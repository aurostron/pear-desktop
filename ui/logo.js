// ============================================================================
// Pear Music nav-bar logo injector  --  GENERATED FILE, DO NOT EDIT BY HAND
// Regenerate with:  node tools/gen-logo-inject.cjs
// Source artwork:  ui/pear-logo-nav.png  (185x56)
// Rendered size:   79x24 px
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
  var LOGO_URL = "data:image/png;base64,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";
  var CSS_W = 79;
  var CSS_H = 24;

  // Anchor variants observed across YouTube Music builds. All of them are
  // targeted so the logo survives markup changes on Google's side.
  var ANCHORS = [
    'ytmusic-nav-bar a.logo',
    'ytmusic-nav-bar a[aria-label="Home"]',
    'ytmusic-nav-bar .left-content a'
  ].join(',\n  ');

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
    ].join('\n');
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
