// ==UserScript==
// @name         X.com: Mass Like
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Like all (or the top N most recent) posts on a Twitter/X profile page
// @author       mja00
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://www.google.com/s2/favicons?domain=x.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @downloadURL  https://github.com/mja00/userscripts/raw/main/x.com/mass-like.user.js
// @updateURL    https://github.com/mja00/userscripts/raw/main/x.com/mass-like.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- Constants ---
    var SEL_TWEET = 'article[data-testid="tweet"]';
    var SEL_LIKE = '[data-testid="like"]';
    var SEL_UNLIKE = '[data-testid="unlike"]';
    var PANEL_ID = 'ml-panel';
    var TRIGGER_ID = 'ml-trigger';
    var EMPTY_SCROLL_LIMIT = 5;
    var RATE_LIMIT_COOLDOWN = 60000;
    var SESSION_WARN_AT = 50;
    var SESSION_STOP_RECOMMEND = 200;

    // --- Settings ---
    var defaultMode_ = 'defaultMode'; var defaultMode = getSetting(defaultMode_, 'all');
    var defaultCount_ = 'defaultCount'; var defaultCount = getSetting(defaultCount_, 50);
    var delayMin_ = 'delayMin'; var delayMin = getSetting(delayMin_, 2);
    var delayMax_ = 'delayMax'; var delayMax = getSetting(delayMax_, 5);

    function getSetting(name, def) {
        var v = GM_getValue(name, null);
        if (v === null) { GM_setValue(name, def); v = def; }
        return v;
    }

    // --- Utilities ---
    function delay(ms) {
        return new Promise(function (res) { setTimeout(res, ms); });
    }

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
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
    var sessionLikeCount = 0;

    // --- SPA Navigation ---
    var currentPath = window.location.pathname;

    function onUrlChange() {
        var newPath = window.location.pathname;
        if (newPath === currentPath) return;
        currentPath = newPath;
        if (running) {
            cancelled = true;
        }
        if (isProfilePage()) {
            if (!document.getElementById(PANEL_ID)) {
                injectUI();
            }
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
        '  width: 280px; background: #15202b; color: #e7e9ea;',
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
        '#ml-body { padding: 14px; }',
        '.ml-row { margin-bottom: 12px; }',
        '.ml-row label { display: flex; align-items: center; gap: 8px; cursor: pointer; }',
        '.ml-row input[type="radio"] { accent-color: #1d9bf0; }',
        '.ml-row input[type="number"] {',
        '  width: 70px; background: #253341; border: 1px solid #38444d;',
        '  color: #e7e9ea; border-radius: 6px; padding: 4px 8px;',
        '  font-size: 14px; margin-left: 6px;',
        '}',
        '.ml-delay-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }',
        '.ml-delay-row input[type="number"] {',
        '  width: 52px; background: #253341; border: 1px solid #38444d;',
        '  color: #e7e9ea; border-radius: 6px; padding: 4px 6px; font-size: 13px;',
        '}',
        '.ml-delay-row span { color: #8b98a5; font-size: 13px; }',
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
        '#ml-status {',
        '  font-size: 13px; color: #8b98a5; margin-top: 8px; min-height: 18px;',
        '  word-break: break-word;',
        '}'
    ].join('\n'));

    // --- UI Construction ---
    function injectUI() {
        if (document.getElementById(PANEL_ID)) return;

        // Trigger button
        var trigger = document.createElement('button');
        trigger.id = TRIGGER_ID;
        trigger.title = 'Mass Like';
        trigger.innerHTML = '&#10084;';
        trigger.addEventListener('click', function () {
            var panel = document.getElementById(PANEL_ID);
            if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
        });
        document.body.appendChild(trigger);

        // Panel
        var panel = document.createElement('div');
        panel.id = PANEL_ID;

        panel.innerHTML = [
            '<div id="ml-header">',
            '  <span>&#10084; Mass Like</span>',
            '  <button id="ml-close" title="Close">&times;</button>',
            '</div>',
            '<div id="ml-body">',
            '  <div class="ml-row">',
            '    <label><input type="radio" name="ml-mode" value="all"> Like All Posts</label>',
            '  </div>',
            '  <div class="ml-row">',
            '    <label>',
            '      <input type="radio" name="ml-mode" value="topN"> Like Top',
            '      <input type="number" id="ml-count" min="1" max="10000" value="' + defaultCount + '">',
            '      posts',
            '    </label>',
            '  </div>',
            '  <div class="ml-row">',
            '    <div class="ml-delay-row">',
            '      <span>Delay:</span>',
            '      <input type="number" id="ml-delay-min" min="1" max="60" value="' + delayMin + '">',
            '      <span>&#8211;</span>',
            '      <input type="number" id="ml-delay-max" min="1" max="60" value="' + delayMax + '">',
            '      <span>seconds between likes</span>',
            '    </div>',
            '  </div>',
            '  <button id="ml-start">Start Liking</button>',
            '  <button id="ml-stop">Stop</button>',
            '  <div id="ml-progress-wrap">',
            '    <div id="ml-progress-label">0 liked</div>',
            '    <div id="ml-progress-bar-bg"><div id="ml-progress-bar"></div></div>',
            '  </div>',
            '  <div id="ml-status"></div>',
            '</div>'
        ].join('');

        document.body.appendChild(panel);

        // Set saved mode
        var modeInputs = panel.querySelectorAll('input[name="ml-mode"]');
        modeInputs.forEach(function (input) {
            if (input.value === defaultMode) input.checked = true;
            input.addEventListener('change', function () {
                GM_setValue(defaultMode_, this.value);
                defaultMode = this.value;
            });
        });

        panel.querySelector('#ml-close').addEventListener('click', function () {
            panel.style.display = 'none';
        });

        panel.querySelector('#ml-start').addEventListener('click', onStart);
        panel.querySelector('#ml-stop').addEventListener('click', onStop);
    }

    function removeUI() {
        var panel = document.getElementById(PANEL_ID);
        if (panel) panel.remove();
        var trigger = document.getElementById(TRIGGER_ID);
        if (trigger) trigger.remove();
    }

    function setStatus(msg) {
        var el = document.getElementById('ml-status');
        if (el) el.textContent = msg;
    }

    function updateProgress(liked, target) {
        var wrap = document.getElementById('ml-progress-wrap');
        var label = document.getElementById('ml-progress-label');
        var bar = document.getElementById('ml-progress-bar');
        if (!wrap) return;
        wrap.style.display = '';
        if (target > 0) {
            label.textContent = liked + ' / ' + target + ' liked';
            bar.style.width = Math.min(100, Math.round((liked / target) * 100)) + '%';
        } else {
            label.textContent = liked + ' liked';
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

    // --- Engine ---
    function isRetweet(article) {
        // Retweets have a "[User] reposted" social context banner above the tweet
        return !!article.querySelector('[data-testid="socialContext"]');
    }

    function isReply(article) {
        // Replies have a standalone "Replying to" span (distinct from tweet body text)
        var spans = article.querySelectorAll('span');
        for (var i = 0; i < spans.length; i++) {
            if (spans[i].childNodes.length === 1 &&
                spans[i].textContent === 'Replying to') return true;
        }
        return false;
    }

    function getUnlikedButtons() {
        var tweets = document.querySelectorAll(SEL_TWEET);
        var buttons = [];
        tweets.forEach(function (tweet) {
            if (isRetweet(tweet) || isReply(tweet)) return;
            var btn = tweet.querySelector(SEL_LIKE);
            if (btn) buttons.push(btn);
        });
        return buttons;
    }

    function onStart() {
        var modeInput = document.querySelector('input[name="ml-mode"]:checked');
        var mode = modeInput ? modeInput.value : 'all';
        var countEl = document.getElementById('ml-count');
        var targetCount = (mode === 'topN') ? (parseInt(countEl.value, 10) || 50) : 0;

        var minEl = document.getElementById('ml-delay-min');
        var maxEl = document.getElementById('ml-delay-max');
        var minDelay = (parseInt(minEl.value, 10) || 2) * 1000;
        var maxDelay = (parseInt(maxEl.value, 10) || 5) * 1000;
        if (maxDelay < minDelay) maxDelay = minDelay;

        GM_setValue(defaultMode_, mode);
        GM_setValue(defaultCount_, targetCount || 50);
        GM_setValue(delayMin_, Math.round(minDelay / 1000));
        GM_setValue(delayMax_, Math.round(maxDelay / 1000));

        cancelled = false;
        running = true;
        setRunningState(true);
        setStatus('Starting\u2026');
        updateProgress(0, targetCount);

        runLikeEngine(targetCount, minDelay, maxDelay).then(function (result) {
            running = false;
            setRunningState(false);
            if (result.stopped) {
                setStatus('Stopped. Liked ' + result.count + ' post' + (result.count === 1 ? '' : 's') + ' this run.');
            } else {
                setStatus('Done! Liked ' + result.count + ' post' + (result.count === 1 ? '' : 's') + ' this run.');
            }
        });
    }

    function onStop() {
        cancelled = true;
        setStatus('Stopping\u2026');
    }

    async function runLikeEngine(targetCount, minDelay, maxDelay) {
        var likedCount = 0;
        var emptyScrolls = 0;
        var processed = new WeakSet();

        while (!cancelled) {
            var buttons = getUnlikedButtons().filter(function (b) { return !processed.has(b); });

            if (buttons.length === 0) {
                emptyScrolls++;
                if (emptyScrolls >= EMPTY_SCROLL_LIMIT) {
                    setStatus('Reached end of timeline.');
                    break;
                }
                setStatus('Loading more posts\u2026 (attempt ' + emptyScrolls + '/' + EMPTY_SCROLL_LIMIT + ')');
                window.scrollBy(0, window.innerHeight * 2);
                await delay(2000);
                continue;
            }

            emptyScrolls = 0;

            for (var i = 0; i < buttons.length; i++) {
                if (cancelled) break;
                if (targetCount > 0 && likedCount >= targetCount) break;

                var btn = buttons[i];
                processed.add(btn);

                // Session safety warnings
                if (sessionLikeCount === SESSION_WARN_AT) {
                    setStatus('\u26a0\ufe0f ' + SESSION_WARN_AT + ' likes this session \u2014 proceed carefully.');
                }
                if (sessionLikeCount >= SESSION_STOP_RECOMMEND) {
                    setStatus('\u26a0\ufe0f ' + SESSION_STOP_RECOMMEND + '+ likes this session. Stopping to protect your account.');
                    cancelled = true;
                    break;
                }

                btn.click();

                // Verify the like registered (rate-limit detection)
                var liked = await verifyLike(btn, 800);
                if (!liked) {
                    setStatus('Rate limit detected. Cooling down for 60s\u2026');
                    await delay(RATE_LIMIT_COOLDOWN);
                    btn.click();
                    var likedRetry = await verifyLike(btn, 1000);
                    if (!likedRetry) {
                        setStatus('Like still failing. Stopping to protect your account.');
                        cancelled = true;
                        break;
                    }
                }

                likedCount++;
                sessionLikeCount++;
                updateProgress(likedCount, targetCount);
                setStatus('Liked ' + likedCount + (targetCount > 0 ? ' / ' + targetCount : '') + ' posts\u2026');

                var waitMs = randomBetween(minDelay, maxDelay);
                await delay(waitMs);
            }

            if (targetCount > 0 && likedCount >= targetCount) break;
            if (cancelled) break;

            window.scrollBy(0, window.innerHeight * 2);
            await delay(2000);
        }

        return { count: likedCount, stopped: cancelled };
    }

    async function verifyLike(btn, waitMs) {
        await delay(waitMs);
        // The button element may have been replaced by React re-render; re-check nearby
        // by looking at the closest tweet article for an "unlike" button
        var article = btn.closest(SEL_TWEET);
        if (!article) return true; // can't verify, assume OK
        return !!article.querySelector(SEL_UNLIKE);
    }

    // --- Init ---
    function init() {
        if (isProfilePage()) {
            injectUI();
        }
    }

    // Wait for body to be ready before injecting
    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
