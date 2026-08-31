// ==UserScript==
// @name         X.com: Mass Like
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Like (or unlike) posts on a Twitter/X profile with adaptive pacing, filters, and rate-limit protection
// @author       mja00
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://www.google.com/s2/favicons?domain=x.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @downloadURL  https://github.com/mja00/userscripts/raw/main/x.com/mass-like.user.js
// @updateURL    https://github.com/mja00/userscripts/raw/main/x.com/mass-like.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- Constants ---
    var SEL_TWEET = 'article[data-testid="tweet"]';
    var SEL_LIKE = '[data-testid="like"]';
    var SEL_UNLIKE = '[data-testid="unlike"]';
    var SEL_CONTEXT = '[data-testid="socialContext"]';
    var PANEL_ID = 'ml-panel';
    var TRIGGER_ID = 'ml-trigger';
    var LOG_KEY = 'actionLog';

    var EMPTY_SCROLL_LIMIT = 6;
    var FLIP_TIMEOUT_MS = 1500;
    var POLL_MS = 60;
    var SCROLL_TIMEOUT_MS = 5000;
    var HOUR_MS = 3600000;
    var DAY_MS = 86400000;
    var BACKOFF_BASE_MS = 20000;
    var BACKOFF_MAX_MS = 600000;
    var FAIL_STREAK_LIMIT = 3;
    var STREAK_TO_FLOOR = 20;
    var PRESETS = { safe: [3, 6], normal: [1.5, 3], fast: [0.6, 1.2] };

    // --- Settings ---
    var DEFAULTS = {
        mode: 'all',
        count: 50,
        action: 'like',
        delayMin: 1.5,
        delayMax: 3,
        skipReplies: true,
        skipReposts: true,
        skipPinned: true,
        hourlyCap: 250,
        dailyCap: 900,
        verify: true,
        autoResume: true,
        dryRun: false
    };

    var settings = {};
    Object.keys(DEFAULTS).forEach(function (key) {
        var v = GM_getValue(key, null);
        settings[key] = (v === null || v === undefined) ? DEFAULTS[key] : v;
    });

    function saveSettings() {
        Object.keys(settings).forEach(function (key) { GM_setValue(key, settings[key]); });
    }

    // --- Action budget (persisted so caps survive reloads) ---
    var actionLog = (function () {
        var arr;
        try { arr = JSON.parse(GM_getValue(LOG_KEY, '[]')); } catch { arr = []; }
        if (!Array.isArray(arr)) arr = [];
        var cutoff = Date.now() - DAY_MS;
        return arr.filter(function (t) { return typeof t === 'number' && t > cutoff; });
    })();

    function recordAction() {
        actionLog.push(Date.now());
        GM_setValue(LOG_KEY, JSON.stringify(actionLog));
    }

    function countSince(windowMs) {
        var cutoff = Date.now() - windowMs;
        var n = 0;
        for (var i = actionLog.length - 1; i >= 0; i--) {
            if (actionLog[i] <= cutoff) break;
            n++;
        }
        return n;
    }

    // ms until the next action fits inside both caps, 0 when one is allowed now
    function budgetWait() {
        var now = Date.now();
        var wait = 0;
        [[settings.hourlyCap, HOUR_MS], [settings.dailyCap, DAY_MS]].forEach(function (pair) {
            var cap = pair[0];
            var windowMs = pair[1];
            if (!cap || cap <= 0) return;
            var used = countSince(windowMs);
            if (used < cap) return;
            var oldest = actionLog[actionLog.length - cap];
            var w = oldest + windowMs - now;
            if (w > wait) wait = w;
        });
        return wait;
    }

    // --- Rate-limit detection at the network layer ---
    var lastFailureAt = 0;

    (function watchNetwork() {
        var win = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
        if (!win.fetch) return;
        var origFetch = win.fetch;
        win.fetch = function (input) {
            var url = (typeof input === 'string') ? input : (input && input.url) || '';
            var promise = origFetch.apply(this, arguments);
            if (!/FavoriteTweet|UnfavoriteTweet/.test(url)) return promise;
            return promise.then(function (res) {
                if (res.status === 429 || res.status === 403) {
                    lastFailureAt = Date.now();
                } else if (res.status === 200) {
                    // X also returns limit/lock errors as codes inside a 200 body
                    res.clone().text().then(function (body) {
                        if (/"code":\s*(88|64|326)/.test(body)) lastFailureAt = Date.now();
                    }).catch(function () { });
                }
                return res;
            });
        };
    })();

    // --- Utilities ---
    function delay(ms) {
        return new Promise(function (res) { setTimeout(res, ms); });
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    async function pollFor(fn, timeout) {
        var start = Date.now();
        for (;;) {
            if (fn()) return true;
            if (cancelled || Date.now() - start >= timeout) return false;
            await delay(POLL_MS);
        }
    }

    function formatDuration(ms) {
        var s = Math.ceil(ms / 1000);
        if (s < 60) return s + 's';
        return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    }

    function isProfilePage() {
        var path = window.location.pathname;
        var nonProfile = ['/home', '/explore', '/search', '/notifications',
            '/messages', '/settings', '/i/', '/compose', '/login', '/signup'];
        if (nonProfile.some(function (r) { return path === r || path.startsWith(r + '/'); })) {
            return false;
        }
        return /^\/[A-Za-z0-9_]{1,15}(\/with_replies|\/highlights|\/articles|\/media|\/likes)?$/.test(path);
    }

    // --- State ---
    var cancelled = false;
    var running = false;

    // --- SPA Navigation ---
    var currentPath = window.location.pathname;

    function onUrlChange() {
        var newPath = window.location.pathname;
        if (newPath === currentPath) return;
        currentPath = newPath;
        if (running) cancelled = true;
        if (isProfilePage()) {
            if (!document.getElementById(PANEL_ID)) injectUI();
        } else {
            removeUI();
        }
    }

    (function patchHistory() {
        var origPush = history.pushState;
        var origReplace = history.replaceState;
        history.pushState = function () { origPush.apply(this, arguments); onUrlChange(); };
        history.replaceState = function () { origReplace.apply(this, arguments); onUrlChange(); };
        window.addEventListener('popstate', onUrlChange);
    })();

    // --- CSS ---
    GM_addStyle([
        '#' + TRIGGER_ID + ' {',
        '  position: fixed; bottom: 20px; right: 20px; z-index: 99999;',
        '  width: 44px; height: 44px; border-radius: 50%;',
        '  background: #1d9bf0; border: none; cursor: pointer;',
        '  display: flex; align-items: center; justify-content: center;',
        '  box-shadow: 0 2px 10px rgba(0,0,0,0.4); font-size: 20px;',
        '  transition: transform 0.15s;',
        '}',
        '#' + TRIGGER_ID + ':hover { transform: scale(1.1); }',
        '#' + PANEL_ID + ' {',
        '  position: fixed; bottom: 74px; right: 20px; z-index: 99999;',
        '  width: 300px; background: #15202b; color: #e7e9ea;',
        '  border: 1px solid #38444d; border-radius: 12px;',
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
        '  font-size: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);',
        '  overflow: hidden;',
        '}',
        '#ml-header {',
        '  display: flex; align-items: center; justify-content: space-between;',
        '  padding: 12px 14px; border-bottom: 1px solid #38444d;',
        '  font-weight: 700; font-size: 15px;',
        '}',
        '#ml-close {',
        '  background: none; border: none; color: #8b98a5; cursor: pointer;',
        '  font-size: 18px; padding: 0; line-height: 1;',
        '}',
        '#ml-close:hover { color: #e7e9ea; }',
        '#ml-body { padding: 14px; max-height: 72vh; overflow-y: auto; }',
        '.ml-row { margin-bottom: 12px; }',
        '.ml-row label { display: flex; align-items: center; gap: 8px; cursor: pointer; }',
        '.ml-row input[type="radio"], .ml-row input[type="checkbox"] { accent-color: #1d9bf0; }',
        '#ml-body input[type="number"], #ml-body select {',
        '  background: #253341; border: 1px solid #38444d;',
        '  color: #e7e9ea; border-radius: 6px; padding: 4px 8px; font-size: 13px;',
        '}',
        '#ml-count { width: 72px; margin-left: 6px; }',
        '#ml-action { width: 100%; margin-top: 4px; }',
        '.ml-inline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }',
        '.ml-inline input[type="number"] { width: 58px; }',
        '.ml-inline span, .ml-hint { color: #8b98a5; font-size: 13px; }',
        '.ml-presets { display: flex; gap: 6px; margin-top: 8px; }',
        '.ml-presets button {',
        '  flex: 1; padding: 4px 0; background: #253341; color: #e7e9ea;',
        '  border: 1px solid #38444d; border-radius: 6px; font-size: 12px; cursor: pointer;',
        '}',
        '.ml-presets button:hover { background: #2f4356; }',
        '#ml-advanced { border-top: 1px solid #38444d; margin: 12px 0; padding-top: 10px; }',
        '#ml-advanced summary { cursor: pointer; color: #8b98a5; font-size: 13px; margin-bottom: 10px; }',
        '#ml-advanced .ml-row { margin-bottom: 8px; }',
        '#ml-start {',
        '  width: 100%; padding: 9px; background: #1d9bf0; color: #fff;',
        '  border: none; border-radius: 20px; font-size: 15px; font-weight: 700;',
        '  cursor: pointer; margin-top: 4px;',
        '}',
        '#ml-start:hover { background: #1a8cd8; }',
        '#ml-start:disabled { background: #38444d; color: #8b98a5; cursor: not-allowed; }',
        '#ml-stop {',
        '  width: 100%; padding: 9px; background: #f4212e; color: #fff;',
        '  border: none; border-radius: 20px; font-size: 15px; font-weight: 700;',
        '  cursor: pointer; margin-top: 8px; display: none;',
        '}',
        '#ml-stop:hover { background: #cc1a26; }',
        '#ml-progress-wrap { margin-top: 12px; display: none; }',
        '#ml-progress-label { font-size: 13px; color: #8b98a5; margin-bottom: 6px; }',
        '#ml-progress-bar-bg {',
        '  background: #253341; border-radius: 6px; height: 8px; overflow: hidden;',
        '}',
        '#ml-progress-bar {',
        '  height: 100%; background: #1d9bf0; border-radius: 6px;',
        '  width: 0%; transition: width 0.3s;',
        '}',
        '#ml-budget { font-size: 12px; color: #8b98a5; margin-top: 10px; }',
        '#ml-status {',
        '  font-size: 13px; color: #8b98a5; margin-top: 6px; min-height: 18px;',
        '  word-break: break-word;',
        '}'
    ].join('\n'));

    // --- UI Construction ---
    function injectUI() {
        if (document.getElementById(PANEL_ID)) return;

        var trigger = document.createElement('button');
        trigger.id = TRIGGER_ID;
        trigger.title = 'Mass Like';
        trigger.innerHTML = '&#10084;';
        trigger.addEventListener('click', function () {
            var p = document.getElementById(PANEL_ID);
            if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
        });
        document.body.appendChild(trigger);

        var panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.display = 'none';
        panel.innerHTML = [
            '<div id="ml-header">',
            '  <span>&#10084; Mass Like</span>',
            '  <button id="ml-close" title="Close">&times;</button>',
            '</div>',
            '<div id="ml-body">',
            '  <div class="ml-row">',
            '    <select id="ml-action">',
            '      <option value="like">Like posts</option>',
            '      <option value="unlike">Unlike posts</option>',
            '    </select>',
            '  </div>',
            '  <div class="ml-row">',
            '    <label><input type="radio" name="ml-mode" value="all"> All posts</label>',
            '  </div>',
            '  <div class="ml-row">',
            '    <label>',
            '      <input type="radio" name="ml-mode" value="topN"> Top',
            '      <input type="number" id="ml-count" min="1" max="10000" value="' + settings.count + '">',
            '      posts',
            '    </label>',
            '  </div>',
            '  <div class="ml-row">',
            '    <div class="ml-inline">',
            '      <span>Delay:</span>',
            '      <input type="number" id="ml-delay-min" min="0.2" max="60" step="0.1" value="' + settings.delayMin + '">',
            '      <span>&#8211;</span>',
            '      <input type="number" id="ml-delay-max" min="0.2" max="60" step="0.1" value="' + settings.delayMax + '">',
            '      <span>seconds</span>',
            '    </div>',
            '    <div class="ml-presets">',
            '      <button type="button" data-preset="safe">Safe</button>',
            '      <button type="button" data-preset="normal">Normal</button>',
            '      <button type="button" data-preset="fast">Fast</button>',
            '    </div>',
            '  </div>',
            '  <details id="ml-advanced">',
            '    <summary>Advanced</summary>',
            '    <div class="ml-row"><label><input type="checkbox" id="ml-skip-replies"> Skip replies</label></div>',
            '    <div class="ml-row"><label><input type="checkbox" id="ml-skip-reposts"> Skip reposts</label></div>',
            '    <div class="ml-row"><label><input type="checkbox" id="ml-skip-pinned"> Skip pinned</label></div>',
            '    <div class="ml-row ml-inline">',
            '      <span>Max per hour:</span>',
            '      <input type="number" id="ml-cap-hour" min="0" max="5000" value="' + settings.hourlyCap + '">',
            '    </div>',
            '    <div class="ml-row ml-inline">',
            '      <span>Max per day:</span>',
            '      <input type="number" id="ml-cap-day" min="0" max="20000" value="' + settings.dailyCap + '">',
            '    </div>',
            '    <div class="ml-row"><label><input type="checkbox" id="ml-verify"> Verify each action</label></div>',
            '    <div class="ml-row"><label><input type="checkbox" id="ml-auto-resume"> Auto-resume after cooldown</label></div>',
            '    <div class="ml-row"><label><input type="checkbox" id="ml-dry-run"> Dry run (count only)</label></div>',
            '    <div class="ml-hint">0 disables a cap. Caps count real actions across reloads.</div>',
            '  </details>',
            '  <button id="ml-start">Start</button>',
            '  <button id="ml-stop">Stop</button>',
            '  <div id="ml-progress-wrap">',
            '    <div id="ml-progress-label">0 done</div>',
            '    <div id="ml-progress-bar-bg"><div id="ml-progress-bar"></div></div>',
            '  </div>',
            '  <div id="ml-budget"></div>',
            '  <div id="ml-status"></div>',
            '</div>'
        ].join('');
        document.body.appendChild(panel);

        panel.querySelectorAll('input[name="ml-mode"]').forEach(function (input) {
            input.checked = input.value === settings.mode;
        });
        panel.querySelector('#ml-action').value = settings.action;
        bindCheckbox(panel, '#ml-skip-replies', 'skipReplies');
        bindCheckbox(panel, '#ml-skip-reposts', 'skipReposts');
        bindCheckbox(panel, '#ml-skip-pinned', 'skipPinned');
        bindCheckbox(panel, '#ml-verify', 'verify');
        bindCheckbox(panel, '#ml-auto-resume', 'autoResume');
        bindCheckbox(panel, '#ml-dry-run', 'dryRun');

        panel.querySelector('#ml-action').addEventListener('change', updateActionLabels);
        panel.querySelectorAll('.ml-presets button').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var preset = PRESETS[btn.getAttribute('data-preset')];
                panel.querySelector('#ml-delay-min').value = preset[0];
                panel.querySelector('#ml-delay-max').value = preset[1];
            });
        });
        panel.querySelector('#ml-close').addEventListener('click', function () {
            panel.style.display = 'none';
        });
        panel.querySelector('#ml-start').addEventListener('click', onStart);
        panel.querySelector('#ml-stop').addEventListener('click', onStop);

        updateActionLabels();
        updateBudget();
    }

    function bindCheckbox(panel, selector, key) {
        var el = panel.querySelector(selector);
        el.checked = !!settings[key];
        el.addEventListener('change', function () { settings[key] = el.checked; });
    }

    function removeUI() {
        var panel = document.getElementById(PANEL_ID);
        if (panel) panel.remove();
        var trigger = document.getElementById(TRIGGER_ID);
        if (trigger) trigger.remove();
    }

    function actionVerb() {
        return document.getElementById('ml-action') && document.getElementById('ml-action').value === 'unlike'
            ? 'Unlike' : 'Like';
    }

    function updateActionLabels() {
        var startBtn = document.getElementById('ml-start');
        if (startBtn) startBtn.textContent = actionVerb() === 'Unlike' ? 'Start Unliking' : 'Start Liking';
    }

    function setStatus(msg) {
        var el = document.getElementById('ml-status');
        if (el) el.textContent = msg;
    }

    function updateBudget() {
        var el = document.getElementById('ml-budget');
        if (!el) return;
        var parts = ['Hour: ' + countSince(HOUR_MS) + (settings.hourlyCap > 0 ? '/' + settings.hourlyCap : ''),
            'Day: ' + countSince(DAY_MS) + (settings.dailyCap > 0 ? '/' + settings.dailyCap : '')];
        el.textContent = parts.join(' · ');
    }

    function updateProgress(done, target) {
        var wrap = document.getElementById('ml-progress-wrap');
        var label = document.getElementById('ml-progress-label');
        var bar = document.getElementById('ml-progress-bar');
        if (!wrap) return;
        wrap.style.display = '';
        if (target > 0) {
            label.textContent = done + ' / ' + target + ' done';
            bar.style.width = Math.min(100, Math.round((done / target) * 100)) + '%';
        } else {
            label.textContent = done + ' done';
            bar.style.width = '0%';
        }
    }

    function setRunningState(isRunning) {
        var startBtn = document.getElementById('ml-start');
        var stopBtn = document.getElementById('ml-stop');
        if (!startBtn) return;
        startBtn.disabled = isRunning;
        stopBtn.style.display = isRunning ? '' : 'none';
    }

    // --- Target selection ---
    function isReply(article) {
        // Replies have a standalone "Replying to" span (distinct from tweet body text)
        var spans = article.querySelectorAll('span');
        for (var i = 0; i < spans.length; i++) {
            if (spans[i].childNodes.length === 1 &&
                spans[i].textContent === 'Replying to') return true;
        }
        return false;
    }

    function collectTargets(processed) {
        var wanted = settings.action === 'like' ? SEL_LIKE : SEL_UNLIKE;
        var out = [];
        document.querySelectorAll(SEL_TWEET).forEach(function (article) {
            var ctx = article.querySelector(SEL_CONTEXT);
            var ctxText = ctx ? ctx.textContent : '';
            var pinned = /^Pinned/i.test(ctxText);
            if (pinned) {
                if (settings.skipPinned) return;
            } else if (ctxText && settings.skipReposts) {
                return;
            }
            if (settings.skipReplies && isReply(article)) return;
            var btn = article.querySelector(wanted);
            if (btn && !processed.has(btn)) out.push({ btn: btn, article: article });
        });
        return out;
    }

    async function waitForTargets(processed, timeout) {
        var found = [];
        await pollFor(function () {
            found = collectTargets(processed);
            return found.length > 0;
        }, timeout);
        return found;
    }

    // --- Engine ---
    function onStart() {
        var modeInput = document.querySelector('input[name="ml-mode"]:checked');
        settings.mode = modeInput ? modeInput.value : 'all';
        settings.action = document.getElementById('ml-action').value;
        settings.count = Math.max(1, parseInt(document.getElementById('ml-count').value, 10) || 50);
        settings.delayMin = Math.max(0.2, parseFloat(document.getElementById('ml-delay-min').value) || 1.5);
        settings.delayMax = Math.max(settings.delayMin, parseFloat(document.getElementById('ml-delay-max').value) || 3);
        settings.hourlyCap = Math.max(0, parseInt(document.getElementById('ml-cap-hour').value, 10) || 0);
        settings.dailyCap = Math.max(0, parseInt(document.getElementById('ml-cap-day').value, 10) || 0);
        saveSettings();

        cancelled = false;
        running = true;
        setRunningState(true);
        setStatus('Starting…');
        updateProgress(0, settings.mode === 'topN' ? settings.count : 0);

        runEngine().then(function (result) {
            running = false;
            setRunningState(false);
            updateBudget();
            var noun = ' post' + (result.count === 1 ? '' : 's');
            var verb = settings.dryRun ? 'matched' : (settings.action === 'like' ? 'liked' : 'unliked');
            setStatus((result.stopped ? 'Stopped. ' : 'Done! ') + result.count + noun + ' ' + verb + ' this run.');
        });
    }

    function onStop() {
        cancelled = true;
        setStatus('Stopping…');
    }

    // Random pacing that settles toward the floor as clean actions accumulate
    function nextDelay(streak) {
        var min = settings.delayMin * 1000;
        var max = Math.max(min, settings.delayMax * 1000);
        var spread = Math.max(0, 1 - streak / STREAK_TO_FLOOR);
        return Math.round(randomBetween(min, min + (max - min) * spread));
    }

    async function cooldown(ms, label) {
        var end = Date.now() + ms;
        while (!cancelled) {
            var left = end - Date.now();
            if (left <= 0) break;
            setStatus(label + ' — resuming in ' + formatDuration(left) + '…');
            await delay(Math.min(1000, left));
        }
    }

    async function runEngine() {
        var target = settings.mode === 'topN' ? settings.count : 0;
        var doneSel = settings.action === 'like' ? SEL_UNLIKE : SEL_LIKE;
        var count = 0;
        var emptyScrolls = 0;
        var streak = 0;
        var failStreak = 0;
        var processed = new WeakSet();

        while (!cancelled) {
            var wait = budgetWait();
            if (wait > 0) {
                if (!settings.autoResume) {
                    setStatus('Rate cap reached. Stopping.');
                    break;
                }
                await cooldown(wait, 'Rate cap reached');
                continue;
            }

            var targets = collectTargets(processed);
            if (!targets.length) {
                emptyScrolls++;
                if (emptyScrolls >= EMPTY_SCROLL_LIMIT) {
                    setStatus('Reached end of timeline.');
                    break;
                }
                setStatus('Loading more posts… (' + emptyScrolls + '/' + EMPTY_SCROLL_LIMIT + ')');
                window.scrollBy(0, window.innerHeight * 2);
                targets = await waitForTargets(processed, SCROLL_TIMEOUT_MS);
                if (!targets.length) continue;
            }
            emptyScrolls = 0;

            for (var i = 0; i < targets.length; i++) {
                if (cancelled || (target > 0 && count >= target) || budgetWait() > 0) break;

                var item = targets[i];
                processed.add(item.btn);
                if (!item.btn.isConnected) continue;

                if (settings.dryRun) {
                    count++;
                    updateProgress(count, target);
                    setStatus('Dry run: ' + count + ' matching post' + (count === 1 ? '' : 's') + '.');
                    await delay(80);
                    continue;
                }

                var clickedAt = Date.now();
                item.btn.click();

                // X flips the button optimistically, so the flip only proves the click landed
                var flipped = await pollFor(function () {
                    return !!item.article.querySelector(doneSel);
                }, FLIP_TIMEOUT_MS);

                setStatus(actionVerb() + 'd ' + (count + 1) + (target > 0 ? ' / ' + target : '') + '…');
                await delay(nextDelay(streak));

                // By now the request has settled: a revert or a 429 means we pushed too hard
                var reverted = settings.verify && item.article.isConnected &&
                    !item.article.querySelector(doneSel);
                if (!flipped || reverted || lastFailureAt > clickedAt) {
                    streak = 0;
                    failStreak++;
                    processed.delete(item.btn);
                    if (failStreak >= FAIL_STREAK_LIMIT) {
                        setStatus('Rate limited repeatedly. Stopping to protect your account.');
                        cancelled = true;
                        break;
                    }
                    var backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, failStreak - 1));
                    await cooldown(backoff, 'Rate limited');
                    break;
                }

                count++;
                streak++;
                failStreak = 0;
                recordAction();
                updateProgress(count, target);
                updateBudget();
            }

            if (target > 0 && count >= target) break;
        }

        return { count: count, stopped: cancelled };
    }

    // --- Init ---
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && running) onStop();
    });

    function init() {
        if (isProfilePage()) injectUI();
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
