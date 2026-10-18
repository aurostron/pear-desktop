// YouTube Music Injected Script for Tauri v2 Windows Client
(function () {
  'use strict';
  console.log('[Tauri-YTM] Initializing injected player bridge...');

  // --- BRAVE/UBLOCK PAYLOAD INTERCEPTION & AD SUPPRESSION ENGINE ---
  function sanitizePlayerResponse(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      if ('adPlacements' in obj) delete obj.adPlacements;
      if ('playerAds' in obj) delete obj.playerAds;
      if ('adSlots' in obj) delete obj.adSlots;
      if ('adBreakHeartbeatParams' in obj) delete obj.adBreakHeartbeatParams;
      if (obj.playerConfig && obj.playerConfig.adConfig) {
        delete obj.playerConfig.adConfig;
      }
      if (obj.playbackTracking) {
        delete obj.playbackTracking.videostatsPlaybackUrl;
        delete obj.playbackTracking.videostatsDelayplayUrl;
        delete obj.playbackTracking.videostatsWatchtimeUrl;
        delete obj.playbackTracking.atrUrl;
      }
    } catch (e) {}
    return obj;
  }

  // Intercept window.fetch for YouTube player and next API responses
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    const response = await originalFetch.apply(this, args);

    if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        let data = JSON.parse(text);
        sanitizePlayerResponse(data);
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        return response;
      }
    }

    return response;
  };

  // Intercept XMLHttpRequest for YouTube API responses
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._adblockUrl = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this._adblockUrl && (this._adblockUrl.includes('/youtubei/v1/player') || this._adblockUrl.includes('/youtubei/v1/next'))) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const data = JSON.parse(this.responseText);
            sanitizePlayerResponse(data);
            const str = JSON.stringify(data);
            Object.defineProperty(this, 'responseText', { value: str });
            Object.defineProperty(this, 'response', { value: str });
          } catch (e) {}
        }
      });
    }
    return originalSend.apply(this, args);
  };

  // Intercept window.ytInitialPlayerResponse
  let _initialPlayerResponse = window.ytInitialPlayerResponse;
  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    configurable: true,
    enumerable: true,
    get() {
      return _initialPlayerResponse;
    },
    set(val) {
      _initialPlayerResponse = sanitizePlayerResponse(val);
    }
  });

  // Fail-safe real-time ad skipper & fast-forwarder
  function skipAds() {
    const video = document.querySelector('video');
    const adShowing = document.querySelector('.ad-showing, .ad-interrupting, [class*="ad-showing"]');
    const skipBtn = document.querySelector(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-text, button[id*="skip"]'
    );

    if (skipBtn) {
      skipBtn.click();
    }

    if (adShowing && video) {
      video.muted = true;
      video.playbackRate = 16.0;
      if (video.duration && !isNaN(video.duration)) {
        video.currentTime = video.duration;
      } else {
        video.currentTime = 99999;
      }
    }

    // Auto-dismiss mealbars, promo banners, and "Upgrade" dialogs
    const mealbar = document.querySelector('ytmusic-mealbar-promo-renderer');
    if (mealbar) {
      const dismiss = mealbar.querySelector('yt-button-renderer[dialog-dismiss], #dismiss-button');
      if (dismiss) {
        dismiss.click();
      } else {
        mealbar.remove();
      }
    }
  }

  // Ad-skip poller. 100 ms only while a video is actually active (the only
  // time ads can appear or end); a 1000 ms heartbeat covers paused/idle
  // pages -- cutting the old unconditional 10 Hz cost by ~10x.
  (function adPoll() {
    try {
      skipAds();
    } catch (e) {}
    const video = document.querySelector('video');
    const active = !!video && (!video.paused || video.seeking);
    setTimeout(adPoll, active ? 100 : 1000);
  })();

  // --- CUSTOM PEAR MUSIC LOGO & FRAMELESS CONTROLS ---
  const PEAR_LOGO_DATA_URL = 'data:image/png;base64,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';

  function replaceNavbarLogo() {
    // logo.js (the CSS-first injector) normally owns the logo. This img-swap
    // path is only a fallback for when its stylesheet is missing -- and in
    // that case it also has to fight YouTube re-writing img.src, so skip the
    // whole DOM pass whenever the stylesheet is in place.
    if (document.getElementById('pear-nav-logo-css')) return;

    const logoHolders = document.querySelectorAll(
      'ytmusic-nav-bar a.logo, ytmusic-nav-bar a[aria-label="Home"], ytmusic-nav-bar .left-content a'
    );
    for (const a of logoHolders) {
      if (a.getAttribute('href') !== '/' &&
          a.getAttribute('aria-label') !== 'Home' &&
          !a.classList.contains('logo')) {
        continue;
      }

      // YouTube ships light/dark theme variants as <source> inside <picture>.
      // Removing them forces the <img> src to win.
      const picture = a.querySelector('picture');
      if (picture) {
        picture.querySelectorAll('source').forEach((s) => s.remove());
      }

      const img = a.querySelector('img');
      if (!img) continue;

      // Re-assert even when already tagged: a nav-bar re-render can reset
      // src/srcset on an element we have already visited.
      if (img.dataset.tauriPearLogo !== 'true' ||
          img.getAttribute('src') !== PEAR_LOGO_DATA_URL) {
        img.dataset.tauriPearLogo = 'true';
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = PEAR_LOGO_DATA_URL;
      }

      img.style.height = '24px';
      img.style.width = 'auto';
      img.style.maxHeight = '24px';
      img.style.maxWidth = '140px';
      img.style.objectFit = 'contain';
      img.style.verticalAlign = 'middle';
      img.style.display = 'inline-block';
    }
  }

  // YouTube Music ships an "Upgrade" (Premium) entry in both the full guide
  // and the mini rail. Remove it -- this is a first-party app, no upsell.
  // Matched on the premium icon's inner double-circle (locale-independent);
  // the Explore compass shares the outer circles, so the marker must not be
  // the path prefix alone. The English label stays as a fallback. Removal is
  // idempotent (the node is simply gone on later polls).
  const UPGRADE_ICON_MARK = 'a6.5 6.5 0 100 13 6.5 6.5';
  function removeUpgradeEntry() {
    for (const entry of document.querySelectorAll('ytmusic-guide-entry-renderer')) {
      const d = entry.querySelector('yt-icon path')?.getAttribute('d') || '';
      const label = (entry.textContent || '').trim();
      if (d.includes(UPGRADE_ICON_MARK) || label === 'Upgrade') {
        entry.remove();
      }
    }
  }

  function injectWindowControls() {
    if (document.getElementById('tauri-window-controls')) return;

    const navBar = document.querySelector('ytmusic-nav-bar');
    if (!navBar) return;

    const controls = document.createElement('div');
    controls.id = 'tauri-window-controls';

    // YouTube Music enforces Trusted Types (CSP), so innerHTML assignment
    // throws "This document requires 'TrustedHTML' assignment" -- the buttons
    // must be built with DOM APIs.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const makeButton = (id, title, pathD, width, height, extraClass) => {
      const button = document.createElement('button');
      button.className = 'tauri-win-btn' + (extraClass ? ' ' + extraClass : '');
      button.id = id;
      button.title = title;
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      button.appendChild(svg);
      return button;
    };

    controls.appendChild(makeButton('tauri-btn-min', 'Minimize', 'M0 0h10v1H0z', 10, 1, ''));
    controls.appendChild(makeButton('tauri-btn-max', 'Maximize', 'M1 1h8v8H1V1zm1 1v6h6V2H2z', 10, 10, ''));
    controls.appendChild(makeButton('tauri-btn-close', 'Close', 'M1.4 0L0 1.4 3.6 5 0 8.6 1.4 10 5 6.4 8.6 10l1.4-1.4L6.4 5 10 1.4 8.6 0 5 3.6 1.4 0z', 10, 10, 'tauri-win-close'));

    navBar.appendChild(controls);

    function invokeBackend(cmd) {
      if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
        window.__TAURI_INTERNALS__.invoke(cmd).catch(() => {});
      }
    }

    document.getElementById('tauri-btn-min')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      invokeBackend('app_minimize');
    });

    document.getElementById('tauri-btn-max')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      invokeBackend('app_toggle_maximize');
    });

    document.getElementById('tauri-btn-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      invokeBackend('app_close');
    });

    // Native window dragging on empty navbar area.
    // start_dragging() enters a modal move loop, so firing it on bare mousedown
    // would swallow clicks. Wait for the pointer to actually travel a threshold.
    const DRAG_THRESHOLD = 5;
    let dragState = null;

    const isInteractive = (e) =>
      !!e.target.closest('button, input, textarea, select, a, yt-icon-button, ytmusic-search-box, .tauri-win-btn, #tauri-window-controls');

    navBar.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || isInteractive(e)) return;
      dragState = { x: e.clientX, y: e.clientY, started: false };
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragState || dragState.started) return;
      // The modal drag loop can swallow mouseup; only drag while the button is held.
      if ((e.buttons & 1) === 0) { dragState = null; return; }
      if (Math.abs(e.clientX - dragState.x) < DRAG_THRESHOLD &&
          Math.abs(e.clientY - dragState.y) < DRAG_THRESHOLD) return;
      dragState.started = true;
      invokeBackend('app_start_drag');
    });

    window.addEventListener('mouseup', () => { dragState = null; });

    // Double-click to maximize/restore
    navBar.addEventListener('dblclick', (e) => {
      if (!isInteractive(e)) {
        invokeBackend('app_toggle_maximize');
      }
    });
  }

  // Embedded Geist @font-face rules with local fallbacks
  const GEIST_FONT_CSS = `
    @font-face {
      font-family: 'Geist';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: local('Geist Regular'), local('Geist'),
           url('https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFU.woff2') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Geist';
      font-style: normal;
      font-weight: 500;
      font-display: swap;
      src: local('Geist Medium'), local('Geist-Medium'), local('Geist'),
           url('https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFU.woff2') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Geist';
      font-style: normal;
      font-weight: 600;
      font-display: swap;
      src: local('Geist SemiBold'), local('Geist-SemiBold'), local('Geist'),
           url('https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFU.woff2') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: 'Geist';
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: local('Geist Bold'), local('Geist-Bold'), local('Geist'),
           url('https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFU.woff2') format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
  `;

  let currentFont = 'Geist';
  let currentWeight = '500';

  // Single font <style> element, created exactly once even when applyCustomFont
  // runs again before the element is in the tree. Initialization scripts run
  // at document-created time, before <html>/<head> exist, so the first call
  // has to defer attachment -- a getElementById-only check would create a
  // second style element during that window (the async settings load racing
  // the deferred attach), and the duplicate silently overrode the real one.
  let fontStyleEl = null;

  function ensureFontStyleEl() {
    if (fontStyleEl) return fontStyleEl;

    fontStyleEl = document.getElementById('tauri-custom-font');
    if (fontStyleEl) return fontStyleEl;

    fontStyleEl = document.createElement('style');
    fontStyleEl.id = 'tauri-custom-font';

    const attach = () => {
      const p = document.head || document.documentElement;
      if (!p) return false;
      p.appendChild(fontStyleEl);
      document.removeEventListener('readystatechange', attach);
      document.removeEventListener('DOMContentLoaded', attach);
      // Belt and braces: drop duplicates from any earlier buggy run.
      document.querySelectorAll('style#tauri-custom-font').forEach((el) => {
        if (el !== fontStyleEl) el.remove();
      });
      return true;
    };

    if (!attach()) {
      document.addEventListener('readystatechange', attach);
      document.addEventListener('DOMContentLoaded', attach);
    }
    return fontStyleEl;
  }

  // Apply custom font globally across YouTube Music
  function applyCustomFont(fontName, fontWeight) {
    currentFont = fontName || 'Geist';
    currentWeight = fontWeight || '500';

    const style = ensureFontStyleEl();

    style.textContent = `
      ${GEIST_FONT_CSS}

      /* Geist Medium across YouTube Music's own UI. Better Lyrics' subtree is
         excluded ([class*="blyrics"] and everything inside it): BL drives
         per-line and per-word font sizing/weight for time-synced lyrics, and
         hard-forcing family/weight onto its nodes breaks that typography.
         Verified live against a real lyrics page: BL lyric lines are
         byte-identical with and without these rules; YTM's chrome flips to
         Geist. Only side effect: BL elements that rely on inheritance (e.g.
         blyrics-song-link) pick up weight 500 from the app body, by design. */
      html, body {
        --tauri-font-family: '${currentFont}', 'Geist', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        --tauri-font-weight: ${currentWeight};
        --ytmusic-body-font-family: var(--tauri-font-family);
        --ytmusic-title-font-family: var(--tauri-font-family);
        --yt-endpoint-font-family: var(--tauri-font-family);
      }

      html,
      html *:not([class*="blyrics"], [class*="blyrics"] *) {
        font-family: var(--tauri-font-family) !important;
        font-weight: var(--tauri-font-weight) !important;
      }

      /* Rounded window corners.
         overflow:hidden was removed here: Better Lyrics lays out its lyrics
         inside scroll containers that it sizes itself, and clipping the root
         broke them. Keep this rule to border-radius only. */
      html, body, ytmusic-app {
        border-radius: 12px !important;
      }

      /* Pear Music logo sizing in the nav bar.
      The image source itself is swapped in JS by replaceNavbarLogo() via the
      single PEAR_LOGO_DATA_URL constant -- no duplicate data URL here.
      "source { display: none }" makes the <picture> skip YouTube's light/dark
      theme variants, so the plain <img src> is used instead. */
      ytmusic-nav-bar a.logo picture source,
      ytmusic-nav-bar a[aria-label="Home"] picture source,
      ytmusic-nav-bar .left-content picture source {
        display: none !important;
      }

      ytmusic-nav-bar a.logo img,
      ytmusic-nav-bar a[aria-label="Home"] img,
      ytmusic-nav-bar .left-content a img {
        height: 24px !important;
        max-height: 24px !important;
        width: auto !important;
        max-width: 140px !important;
        object-fit: contain !important;
        vertical-align: middle !important;
        -webkit-user-drag: none;
        user-select: none;
        pointer-events: none;
      }

      /* Frameless window controls.
         The window currently keeps the native title bar, which already has
         minimize/maximize/close, so these in-page duplicates stay hidden rather
         than overlapping YouTube Music's own top-right controls. The buttons
         and their IPC wiring remain in place: if the window ever goes frameless
         (decorations(false)), delete the display:none line below. */
      #tauri-window-controls {
        position: absolute;
        top: 0;
        right: 0;
        height: 48px;
        display: none !important;
        align-items: center;
        z-index: 10000;
        -webkit-app-region: no-drag;
      }

      .tauri-win-btn {
        background: transparent;
        border: none;
        color: #aaa;
        width: 44px;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        outline: none;
        transition: background-color 0.15s ease, color 0.15s ease;
      }

      .tauri-win-btn:hover {
        background-color: rgba(255, 255, 255, 0.12);
        color: #fff;
      }

      .tauri-win-btn.tauri-win-close:hover {
        background-color: #e81123 !important;
        color: #fff !important;
      }

      /* Make empty navbar regions draggable */
      ytmusic-nav-bar {
        -webkit-app-region: drag;
        user-select: none;
      }

      ytmusic-nav-bar > * {
        -webkit-app-region: no-drag;
      }

      /* Cosmetic Ad and Promo Suppression */
      ytmusic-mealbar-promo-renderer,
      ytmusic-banner-promo-renderer,
      .ytp-ad-overlay-container,
      .ytp-ad-message-container,
      ytmusic-player-ad,
      .sparkles-light-cta,
      [class*="ytp-ad-"],
      ytmusic-pivot-bar-item-renderer[tab-id="SPunlimited"],
      tp-yt-paper-dialog:has(ytmusic-mealbar-promo-renderer) {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    console.log('[Tauri-YTM] Custom font applied:', currentFont, currentWeight);
  }

  // Apply default font (Geist Medium) immediately
  applyCustomFont('Geist', '500');

  // Load configured font from Tauri storage if available
  async function loadConfiguredFont() {
    try {
      if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
        const settings = await window.__TAURI_INTERNALS__.invoke('get_settings');
        if (settings && settings.font_family) {
          applyCustomFont(settings.font_family, settings.font_weight || '500');
        }
      }
    } catch (e) {
      // Ignore during initial load
    }
  }
  loadConfiguredFont();

  let lastVideoId = '';
  let lastIsPaused = null;
  let sponsorSegments = [];

  // Emit event to Rust Tauri backend
  function emitToTauri(event, data) {
    try {
      if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.emit === 'function') {
        window.__TAURI__.event.emit(event, data);
      } else if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
        window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event, payload: data });
      }
    } catch (err) {
      console.warn('[Tauri-YTM] IPC emit failed:', event, err);
    }
  }

  function getPlayer() {
    return document.querySelector('#movie_player');
  }

  function getVideoElement() {
    return document.querySelector('video');
  }

  // Fetch SponsorBlock skip segments for music_offtopic, intro, outro, sponsor
  async function fetchSponsorBlock(videoId) {
    sponsorSegments = [];
    if (!videoId) return;

    try {
      const categories = JSON.stringify(['sponsor', 'intro', 'outro', 'music_offtopic']);
      const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${encodeURIComponent(categories)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        sponsorSegments = data.map((item) => item.segment);
        console.log('[Tauri-YTM] Loaded SponsorBlock segments:', sponsorSegments);
      }
    } catch (e) {
      // Non-critical, ignore
    }
  }

  // Track playback and song changes
  function updateSongInfo() {
    const player = getPlayer();
    if (!player || typeof player.getVideoData !== 'function') return;

    const data = player.getVideoData();
    if (!data || !data.video_id) return;

    // Check if song changed
    if (data.video_id !== lastVideoId) {
      lastVideoId = data.video_id;

      let playerResponse = null;
      try {
        if (typeof player.getPlayerResponse === 'function') {
          playerResponse = player.getPlayerResponse();
        }
      } catch (e) {}

      let album = '';
      if (playerResponse?.videoDetails?.album) {
        album = playerResponse.videoDetails.album;
      }

      const duration = player.getDuration() || 0;
      const isPaused = player.getPlayerState() === 2;
      lastIsPaused = isPaused;

      const songInfo = {
        videoId: data.video_id,
        title: data.title || '',
        artist: data.author || '',
        album: album,
        duration: duration,
        imageSrc: `https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`,
        isPaused: isPaused,
      };

      console.log('[Tauri-YTM] Song changed:', songInfo.title, '-', songInfo.artist);
      emitToTauri('ytm:song-change', songInfo);

      // Fetch SponsorBlock segments
      fetchSponsorBlock(data.video_id);
    }

    // Check state (playing / paused)
    const currentState = player.getPlayerState();
    const isPaused = currentState === 2;
    if (isPaused !== lastIsPaused) {
      lastIsPaused = isPaused;
      emitToTauri('ytm:state-change', {
        state: currentState,
        isPaused: isPaused,
        currentTime: player.getCurrentTime() || 0,
        duration: player.getDuration() || 0,
      });
    }

    // (Ad skipping lives in skipAds(), which polls at 100 ms while video is
    // active, with more button variants and seek fallbacks. The duplicate
    // check that used to sit here just doubled the per-tick DOM work.)
  }

  // Handle SponsorBlock segments on time update
  function onTimeUpdate(e) {
    if (sponsorSegments.length === 0) return;
    const video = e.target;
    if (!(video instanceof HTMLVideoElement)) return;

    const current = video.currentTime;
    for (const [start, end] of sponsorSegments) {
      if (current >= start && current < end) {
        console.log('[Tauri-YTM] Skipping SponsorBlock segment:', start, '->', end);
        video.currentTime = end;
        break;
      }
    }
  }

  // Setup video event listeners once video element is present
  function hookVideoEvents() {
    const video = getVideoElement();
    if (video && !video.dataset.tauriHooked) {
      video.dataset.tauriHooked = 'true';
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('play', () => {
        lastIsPaused = false;
        emitToTauri('ytm:state-change', { isPaused: false, state: 1 });
      });
      video.addEventListener('playing', () => {
        if (!xfade.enabled) return;
        xfadeEnsureGraph().then((ok) => {
          if (!ok) return;
          if (xfade.awaitingNext || xfade.state === 'fadedOut') {
            xfade.awaitingNext = false;
            xfadeScheduleFadeIn();
          } else if (xfade.gain && xfade.gain.gain.value < 0.9) {
            xfadeRampTo(1, 0.4);
          }
        });
      });
      video.addEventListener('pause', () => {
        lastIsPaused = true;
        emitToTauri('ytm:state-change', { isPaused: true, state: 2 });
        if (xfade.state === 'fadingOut' || xfade.state === 'fadingIn') {
          xfadeFreeze();
        }
      });
      video.addEventListener('emptied', () => {
        if (xfade.state === 'fadingOut') {
          xfade.state = 'fadedOut';
          xfade.awaitingNext = true;
        }
      });
      video.addEventListener('ended', () => {
        if (!xfade.enabled || !xfade.gain || xfade.state === 'fadedOut') return;
        xfade.awaitingNext = true;
        xfadeRampTo(0, 0.15);
      });
    }
  }

  // Precise volume wheel control
  function hookVolumeWheel() {
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar && !playerBar.dataset.wheelHooked) {
      playerBar.dataset.wheelHooked = 'true';
      playerBar.addEventListener('wheel', (e) => {
        const player = getPlayer();
        if (!player || typeof player.getVolume !== 'function') return;
        e.preventDefault();
        const currentVol = player.getVolume();
        const delta = e.deltaY < 0 ? 2 : -2;
        const newVol = Math.max(0, Math.min(100, currentVol + delta));
        player.setVolume(newVol);
      }, { passive: false });
    }
  }

  // --- Crossfade between songs (Web Audio gain automation) ---
  //
  // YouTube Music plays everything through a single <video> element, and the
  // web player now streams via SABR (the player response carries no direct
  // stream URLs), so a true overlapping crossfade -- two sources playing at
  // once -- is not reachable from inside the page. What we can do is a
  // sample-accurate fade-through: an equal-power curve fades the outgoing
  // track to silence exactly as it ends, and the incoming track fades back
  // up from silence. The graph is only built after the AudioContext is
  // confirmed running, so a suspended context can never mute playback.
  const XFADE_CURVE_POINTS = 65;
  const XFADE_UP = (() => {
    const c = new Float32Array(XFADE_CURVE_POINTS);
    for (let i = 0; i < XFADE_CURVE_POINTS; i++) {
      c[i] = Math.sin((i / (XFADE_CURVE_POINTS - 1)) * Math.PI / 2);
    }
    return c;
  })();
  const XFADE_DOWN = (() => {
    const c = new Float32Array(XFADE_CURVE_POINTS);
    for (let i = 0; i < XFADE_CURVE_POINTS; i++) {
      c[i] = Math.cos((i / (XFADE_CURVE_POINTS - 1)) * Math.PI / 2);
    }
    return c;
  })();

  const xfade = {
    enabled: false,
    duration: 4,
    ctx: null,
    gain: null,
    srcNode: null,
    state: 'idle', // 'idle' | 'fadingOut' | 'fadedOut' | 'fadingIn'
    awaitingNext: false,
  };
  window.__pearXFade = xfade;

  async function xfadeEnsureGraph() {
    if (xfade.srcNode) return xfade.ctx.state === 'running';
    if (!xfade.enabled) return false;
    const video = getVideoElement();
    if (!video) return false;
    try {
      if (!xfade.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        xfade.ctx = new Ctx();
        xfade.gain = xfade.ctx.createGain();
        xfade.gain.gain.value = 1;
      }
      if (xfade.ctx.state === 'suspended') {
        await xfade.ctx.resume().catch(() => {});
      }
      if (xfade.ctx.state !== 'running') return false;
      xfade.srcNode = xfade.ctx.createMediaElementSource(video);
      xfade.srcNode.connect(xfade.gain);
      xfade.gain.connect(xfade.ctx.destination);
      console.log('[Tauri-YTM] Crossfade graph connected');
      return true;
    } catch (e) {
      console.warn('[Tauri-YTM] Crossfade unavailable:', e);
      xfade.srcNode = null;
      return false;
    }
  }

  function xfadeScheduleFadeOut(secondsLeft) {
    if (!xfade.srcNode || xfade.ctx.state !== 'running') return;
    const g = xfade.gain.gain;
    const now = xfade.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setValueCurveAtTime(XFADE_DOWN, now, Math.max(0.25, secondsLeft));
    xfade.state = 'fadingOut';
  }

  function xfadeScheduleFadeIn() {
    if (!xfade.srcNode || xfade.ctx.state !== 'running') return;
    const g = xfade.gain.gain;
    const now = xfade.ctx.currentTime;
    const dur = Math.max(0.25, xfade.duration);
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.setValueCurveAtTime(XFADE_UP, now, dur);
    xfade.state = 'fadingIn';
    setTimeout(() => {
      if (xfade.state === 'fadingIn') xfade.state = 'idle';
    }, dur * 1000 + 150);
  }

  function xfadeRampTo(value, seconds) {
    if (!xfade.gain) return;
    const g = xfade.gain.gain;
    const now = xfade.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(value, now + seconds);
    xfade.state = value === 0 ? 'fadedOut' : 'idle';
  }

  function xfadeFreeze() {
    if (!xfade.gain) return;
    const g = xfade.gain.gain;
    const now = xfade.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    xfade.state = 'idle';
  }

  // End-of-song fade arming. Runs every poll tick; state guards keep it to
  // one schedule per track. The remaining-time check re-arms automatically
  // after a backward seek cancels a scheduled fade.
  function crossfadeTick() {
    const video = getVideoElement();
    if (!video) return;

    const adShowing = document.querySelector('.ad-showing, .ad-interrupting');
    if (!xfade.enabled || adShowing) {
      if (xfade.state !== 'idle' && xfade.gain) xfadeRampTo(1, 0.2);
      return;
    }

    if (xfade.state === 'fadingOut') {
      if (video.paused) {
        xfadeFreeze();
        return;
      }
      const remaining = (video.duration || 0) - video.currentTime;
      if (remaining > xfade.duration + 0.5) xfadeRampTo(1, 0.25);
      return;
    }

    if (xfade.state !== 'idle') return;
    if (video.paused || video.ended) return;

    const remaining = (video.duration || 0) - video.currentTime;
    if (!(remaining > 0.35 && remaining <= xfade.duration + 0.2)) return;

    if (xfade.srcNode) {
      xfadeScheduleFadeOut(remaining);
      return;
    }
    xfadeEnsureGraph().then((ok) => {
      if (!ok || xfade.state !== 'idle') return;
      const v = getVideoElement();
      if (!v || v.paused || v.ended) return;
      const rem = (v.duration || 0) - v.currentTime;
      if (rem > 0.3 && rem <= xfade.duration + 0.5) xfadeScheduleFadeOut(rem);
    });
  }

  // Any click doubles as an unlock attempt for the AudioContext, and
  // next/previous get a quick fade-out so skips feel intentional.
  document.addEventListener('click', (e) => {
    if (!xfade.enabled) return;
    if (!xfade.srcNode) xfadeEnsureGraph();
    const btn = e.target && e.target.closest ? e.target.closest('.next-button, .previous-button') : null;
    if (!btn || !xfade.srcNode) return;
    const video = getVideoElement();
    if (video && !video.paused && xfade.state === 'idle') xfadeScheduleFadeOut(0.45);
  }, true);

  async function loadCrossfadeSettings() {
    try {
      if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
        const settings = await window.__TAURI_INTERNALS__.invoke('get_settings');
        if (settings) {
          xfade.enabled = !!settings.crossfade_enabled;
          xfade.duration = Math.min(15, Math.max(0.5, Number(settings.crossfade_duration) || 4));
        }
      }
    } catch (e) {
      // Ignore during initial load
    }
  }
  loadCrossfadeSettings();

  // Listen for commands from Rust
  window.addEventListener('message', (event) => {
    try {
      const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      const player = getPlayer();

      if (msg.action === 'set-font') {
        applyCustomFont(msg.font, msg.weight);
        return;
      }

      if (msg.action === 'set-crossfade') {
        xfade.enabled = !!msg.enabled;
        xfade.duration = Math.min(15, Math.max(0.5, Number(msg.duration) || 4));
        if (!xfade.enabled && xfade.gain && xfade.state !== 'idle') {
          xfadeRampTo(1, 0.2);
        }
        return;
      }

      if (!player) return;

      switch (msg.action) {
        case 'play':
          player.playVideo();
          break;
        case 'pause':
          player.pauseVideo();
          break;
        case 'toggle-play':
          if (player.getPlayerState() === 2) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }
          break;
        case 'next':
          document.querySelector('.next-button.ytmusic-player-bar')?.click();
          break;
        case 'previous':
          document.querySelector('.previous-button.ytmusic-player-bar')?.click();
          break;
        case 'seek':
          if (typeof msg.time === 'number') {
            player.seekTo(msg.time);
          }
          break;
      }
    } catch (e) {
      console.error('[Tauri-YTM] Failed to process message:', e);
    }
  });

  // Adaptive polling loop. Each step is isolated: before the player API is
  // ready (or on non-player pages) one call can throw, and an uncaught throw
  // used to abort the whole tick, so later steps (window controls, logo,
  // hooks) never ran at all.
  //
  // Cadence follows playback: 400 ms while a video is actually playing (song
  // changes, video-element re-hooks after track switches, ad state), 1200 ms
  // when paused or idle -- the player emits its own play/pause events, so the
  // slow poll is only a safety net. Idle CPU drops ~3x.
  (function poll() {
    for (const step of [updateSongInfo, hookVideoEvents, hookVolumeWheel, replaceNavbarLogo, removeUpgradeEntry, injectWindowControls, crossfadeTick]) {
      try {
        step();
      } catch (e) {}
    }
    const video = getVideoElement();
    const playing = !!video && !video.paused && !video.ended;
    setTimeout(poll, playing ? 400 : 1200);
  })();

  console.log('[Tauri-YTM] Bridge active with Geist Medium font.');
})();

