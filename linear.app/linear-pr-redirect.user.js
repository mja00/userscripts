// ==UserScript==
// @name         Linear: Redirect Code Review to GitHub PR
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  When landing on a Linear code-review page, resolve the underlying pull request and redirect to it on GitHub
// @author       mja00
// @match        https://linear.app/*/review/*
// @icon         https://www.google.com/s2/favicons?domain=linear.app
// @run-at       document-start
// @noframes
// @downloadURL  https://github.com/mja00/userscripts/raw/main/linear.app/linear-pr-redirect.user.js
// @updateURL    https://github.com/mja00/userscripts/raw/main/linear.app/linear-pr-redirect.user.js
// ==/UserScript==

(function () {
    'use strict';

    var LOG_PREFIX = '[linear-pr-redirect]';
    var API_BASE = 'https://client-api.linear.app';
    var MAX_PRELOAD_ATTEMPTS = 4;
    var RETRY_DELAY_MS = 700;

    var currentSlug = null;
    var resolving = false;

    function log() {
        var args = [LOG_PREFIX].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }

    function parseRoute() {
        var segments = location.pathname.split('/').filter(Boolean);
        // /:orgKey/review/:reviewSlug[/:viewMode]
        if (segments.length < 3 || segments[1] !== 'review') return null;
        return { orgKey: segments[0], slug: segments[2] };
    }

    function slugIdOf(slug) {
        var idx = slug.lastIndexOf('-');
        return idx === -1 ? slug : slug.slice(idx + 1);
    }

    // Same endpoint the Linear client hits to preload the review page. It returns
    // newline-delimited JSON models; auth rides on the linear.app session cookies.
    function fetchPreloadModels(slug, extraHeaders) {
        var url = API_BASE + '/sync/preload_page_models?page=PullRequest&identifier=' + encodeURIComponent(slug) + '&type=full';
        var headers = {
            accept: 'application/octet-stream, text/plain',
            'content-type': 'application/json'
        };
        try {
            var clientId = localStorage.getItem('clientId');
            if (clientId) headers['linear-client-id'] = clientId;
        } catch { /* storage unavailable */ }
        if (extraHeaders) {
            for (var key in extraHeaders) headers[key] = extraHeaders[key];
        }
        return fetch(url, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: headers
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        });
    }

    function extractPullRequestUrl(text, expectedSlugId) {
        var lines = text.split('\n');
        var fallback = null;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.indexOf('_metadata_') === 0) continue;
            var model;
            try {
                model = JSON.parse(line);
            } catch {
                continue;
            }
            if (!model || model.__class !== 'PullRequest' || typeof model.url !== 'string' || model.url.indexOf('https://') !== 0) continue;
            if (!model.slugId || model.slugId === expectedSlugId) return model.url;
            if (!fallback) fallback = model.url;
        }
        return fallback;
    }

    // Fallback when cookies alone are not enough: resolve the user/account/org ids
    // for the org in the URL and resend them as the context headers the web client uses.
    function fetchAuthHeaders(orgKey) {
        var query = 'query { availableUsers { id users { id organization { id urlKey } } } }';
        return fetch(API_BASE + '/graphql', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: query, variables: {} })
        }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).then(function (json) {
            var available = json && json.data && json.data.availableUsers;
            if (!available || !Array.isArray(available.users)) return null;
            var user = null;
            for (var i = 0; i < available.users.length; i++) {
                var org = available.users[i].organization;
                if (org && org.urlKey === orgKey) {
                    user = available.users[i];
                    break;
                }
            }
            if (!user || !user.organization) return null;
            return {
                user: user.id,
                useraccount: available.id,
                organization: user.organization.id
            };
        });
    }

    function delay(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function resolveAndRedirect(route) {
        var expectedSlugId = slugIdOf(route.slug);
        var authHeaders = null;

        for (var attempt = 1; attempt <= MAX_PRELOAD_ATTEMPTS; attempt++) {
            var text = null;
            var prUrl = null;
            try {
                text = await fetchPreloadModels(route.slug, authHeaders);
                prUrl = extractPullRequestUrl(text, expectedSlugId);
            } catch (err) {
                log('Preload attempt ' + attempt + '/' + MAX_PRELOAD_ATTEMPTS + ' failed: ' + (err && err.message));
                if (attempt === 1 && !authHeaders) {
                    try {
                        authHeaders = await fetchAuthHeaders(route.orgKey);
                    } catch { /* retry without them */ }
                    if (authHeaders) continue;
                }
            }
            if (prUrl) {
                log('Redirecting to ' + prUrl);
                location.replace(prUrl);
                return;
            }
            log('No pull request resolved for ' + route.slug + ' (attempt ' + attempt + '/' + MAX_PRELOAD_ATTEMPTS + ')');
            await delay(RETRY_DELAY_MS * attempt);
        }
        log('Giving up on ' + route.slug + '; leaving the review page as-is');
    }

    function checkRoute() {
        var route = parseRoute();
        if (!route || resolving || route.slug === currentSlug) return;
        currentSlug = route.slug;
        resolving = true;
        resolveAndRedirect(route)
            .catch(function (err) {
                log('Unexpected error: ' + (err && err.message));
            })
            .then(function () {
                resolving = false;
            });
    }

    // Linear is an SPA: catch in-app navigation to review pages, not just hard loads.
    ['pushState', 'replaceState'].forEach(function (name) {
        var original = history[name];
        history[name] = function () {
            var result = original.apply(this, arguments);
            checkRoute();
            return result;
        };
    });
    window.addEventListener('popstate', checkRoute);

    checkRoute();
})();
