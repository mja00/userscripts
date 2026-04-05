# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run lint        # lint all userscripts
npm run lint:fix    # lint with auto-fix
```

There are no tests and no build step — scripts are plain `.user.js` files installed directly into Tampermonkey.

## Architecture

Scripts are grouped into subdirectories named after the target domain (e.g. `rule34/`, `x.com/`). Each script is a fully self-contained `.user.js` file with no shared modules or imports between scripts.

**Script structure conventions:**
- Tampermonkey `==UserScript==` metadata block at the top (`@name`, `@match`, `@grant`, `@downloadURL`/`@updateURL` pointing to GitHub raw)
- Wrapped in an IIFE `(function() { 'use strict'; ... })();`
- Settings stored with `GM_getValue`/`GM_setValue` using the pattern: `var key_ = 'keyName'; var key = getSetting(key_, default);`
- CSS injected via `GM_addStyle(...)` (granted in metadata) — older `rule34/` scripts define a local `GM_addStyle` polyfill instead
- UI built with vanilla DOM manipulation (`document.createElement`, `innerHTML`, inline styles) — no frameworks
- SPA-heavy sites (like x.com) require patching `history.pushState`/`replaceState` for navigation detection

**Globals available in all scripts:** `GM_getValue`, `GM_setValue`, `GM_addStyle`, `GM_notification`, `GM_xmlhttpRequest`, `GM_info`, `GM_listValues`, `Cookies` (js-cookie via `@require`), `saveAs` (FileSaver.js via `@require`).

## ESLint

Config is in `eslint.config.js` (flat config, ESLint 9+). All Tampermonkey globals are declared there so `no-undef` won't false-positive on them. Existing `rule34/` scripts have pre-existing `eqeqeq` warnings — these are non-blocking and don't need to be fixed when making unrelated changes.
