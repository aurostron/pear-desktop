/**
 * Generates `ui/logo.js` -- the Pear Music nav-bar logo injector.
 *
 * The image is inlined as a base64 data URL because the injected script runs
 * on the remote https://music.youtube.com origin inside a WebView2 with no
 * bundler and no access to the `ui/` asset directory.
 *
 * Source of truth for the artwork: ui/pear-logo-nav.png
 *
 * Re-run after swapping the PNG:   node tools/gen-logo-inject.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_PNG = path.join(ROOT, 'ui', 'pear-logo-nav.png');
const OUT_JS = path.join(ROOT, 'ui', 'logo.js');

// Must match the intrinsic pixel size of the source PNG.
const LOGO_W = 185;
const LOGO_H = 56;
const CSS_H = 24; // rendered height in the YouTube Music nav bar

if (!fs.existsSync(SRC_PNG)) {
  console.error('Missing source image: ' + SRC_PNG);
  process.exit(1);
}

const png = fs.readFileSync(SRC_PNG);
const logoUrl = 'data:image/png;base64,' + png.toString('base64');
const cssW = Math.round((CSS_H * LOGO_W) / LOGO_H);

const template = `// ============================================================================
// Pear Music nav-bar logo injector  --  GENERATED FILE, DO NOT EDIT BY HAND
// Regenerate with:  node tools/gen-logo-inject.cjs
// Source artwork:  ui/pear-logo-nav.png  (${LOGO_W}x${LOGO_H})
// Rendered size:   ${cssW}x${CSS_H} px
//
// Design notes:
//  * Deliberately self-contained. It shares no state, no globals and no
//    execution path with ui/inject.js, so a crash anywhere in the main
//    bridge can never take the logo down with it.
//  * Injected through TWO independent channels (a second
//    initialization_script AND an on_page_load -> eval), so a failure of
//    either mechanism is survivable.
//  * CSS-first: YouTube renders the logo as
//    <a class="logo"><picture><source/><source/><img/></picture></a>.
//    Hiding the <picture> and painting our own ::after is immune to
 //    YouTube re-writing img.src on every nav-bar re-render, which is what
 //    defeated the previous src-swapping approach.
 //  * Performance: the MutationObserver coalesces mutation bursts into at
 //    most one reassert per 250 ms, and reassert itself early-outs once the
 //    logo is confirmed -- steady state is two cheap DOM lookups. (The first
 //    version rebuilt the CSS string and ran getComputedStyle() on the
 //    ::after pseudo-element for every mutation frame of YouTube Music's
 //    busy SPA DOM.)
 // ============================================================================
(function () {
  'use strict';

  var STYLE_ID = 'pear-nav-logo-css';
  var LOGO_URL = ${JSON.stringify(logoUrl)};
  var CSS_W = ${cssW};
  var CSS_H = ${CSS_H};

  // Anchor variants observed across YouTube Music builds. All of them are
  // targeted so the logo survives markup changes on Google's side.
  var ANCHORS = [
    'ytmusic-nav-bar a.logo',
    'ytmusic-nav-bar a[aria-label="Home"]',
    'ytmusic-nav-bar .left-content a'
  ].join(',\\n  ');

  function diag(msg) {
    try {
      console.log('[PearLogo] ' + msg);
    } catch (e) {}
    try {
      var t = window.__TAURI_INTERNALS__;
      if (t && typeof t.invoke === 'function') {
        t.invoke('diag_log', { kind: 'logo', msg: String(msg) }).catch(function () {});
      }
    } catch (e) {}
  }

  function styleText() {
    return [
      ANCHORS + ' {',
      '  display: flex !important;',
      '  align-items: center !important;',
      '  justify-content: flex-start !important;',
      '}',
      '',
      ANCHORS + ' > picture,',
      ANCHORS + ' > img {',
      '  display: none !important;',
      '}',
      '',
      ANCHORS + '::after {',
      '  content: "" !important;',
      '  display: block !important;',
      '  flex: 0 0 auto !important;',
      '  width: ' + CSS_W + 'px !important;',
      '  height: ' + CSS_H + 'px !important;',
      '  background-image: url("' + LOGO_URL + '") !important;',
      '  background-repeat: no-repeat !important;',
      '  background-position: left center !important;',
      '  background-size: contain !important;',
      '  pointer-events: none !important;',
      '  -webkit-user-drag: none !important;',
      '}'
    ].join('\\n');
  }

  var CSS_TEXT = null;

  function ensureStyle() {
    var host = document.head || document.documentElement;
    if (!host) return null;
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      el.setAttribute('data-pear-logo', '1');
      el.textContent = CSS_TEXT || (CSS_TEXT = styleText());
      host.appendChild(el);
      diag('style element created');
      diag('css applied (' + el.textContent.length + ' chars)');
    }
    return el;
  }

  // True once the nav bar actually exists, so we only report real success.
  function logoPresent() {
    var a = document.querySelector('ytmusic-nav-bar a.logo') ||
            document.querySelector('ytmusic-nav-bar a[aria-label="Home"]');
    if (!a) return false;
    try {
      return getComputedStyle(a, '::after').backgroundImage.indexOf('data:image/png;base64,') !== -1;
    } catch (e) {
      return true;
    }
  }

  var booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    diag('booting on ' + location.href);

    ensureStyle();

    // Belt-and-braces: YouTube Music is a SPA and re-renders the nav bar on
    // route changes. The stylesheet + selectors survive re-renders by
    // themselves, so reassert only has to (a) restore a removed style element
    // and (b) record, once per nav instance, that the logo is visibly live.
    // Steady state is two cheap lookups -- the old version rebuilt the CSS
    // string and ran getComputedStyle() on every call.
    var reassert = function () {
      var el = ensureStyle();
      if (!el) return;
      var nav = document.querySelector('ytmusic-nav-bar');
      if (!nav) return;
      if (nav.getAttribute('data-pear-logo') === 'active') return;
      if (logoPresent()) {
        nav.setAttribute('data-pear-logo', 'active');
        diag('CONFIRMED logo visible in nav bar');
      }
    };

    try {
      // Coalesce mutation bursts (YouTube's DOM churns constantly during
      // playback) into at most one reassert per 250 ms.
      var pending = false;
      var mo = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () {
          pending = false;
          reassert();
        }, 250);
      });
      var attach = function () {
        var t = document.body || document.documentElement;
        if (!t) return false;
        mo.observe(t, { childList: true, subtree: true });
        return true;
      };
      if (!attach()) setTimeout(attach, 400);
    } catch (e) {
      diag('observer failed: ' + e);
    }

    setInterval(reassert, 2000);

    setTimeout(reassert, 300);
    setTimeout(reassert, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
`;

fs.writeFileSync(OUT_JS, template, 'utf8');
console.log('Wrote ' + path.relative(ROOT, OUT_JS));
console.log('  logo data URL : ' + logoUrl.length + ' chars');
console.log('  rendered size : ' + cssW + 'x' + CSS_H + ' px');
console.log('  output size   : ' + fs.statSync(OUT_JS).size + ' bytes');