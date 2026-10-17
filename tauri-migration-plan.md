# Tauri v2 Windows Migration Plan

## Goal
Migrate `pear-desktop` from Electron to a lightweight Rust/Tauri v2 desktop client on Windows, stripping unnecessary bloat and maximizing performance, responsiveness, and native Windows integration.

## Tasks
- [x] Task 1: Initialize Tauri v2 Windows project skeleton (`src-tauri` with Tauri v2, `tauri-plugin-single-instance`, `tauri-plugin-store`, `tauri-plugin-global-shortcut`) → Verify: `cargo build` compiles into `app.exe` with all plugins.
- [x] Task 2: Configure WebView2 window to load `https://music.youtube.com` with custom user-agent, session persistence, and hardware acceleration flags → Verify: App boots directly into YouTube Music with logged-in Google session retained across restarts.
- [x] Task 3: Build a lightweight injected script (`inject.js`) to hook `#movie_player`, track player state, and emit IPC events (`song-change`, `play`, `pause`, `seek`, `like`) to Rust → Verify: Console/Rust logs accurate song title, artist, album art URL, and duration on track change.
- [x] Task 4: Implement Windows SMTC (System Media Transport Controls) in Rust via WinRT / `souvlaki` crate → Verify: Windows 11 media flyout / lock screen displays song title, artist, thumbnail, and responds to play/pause/skip buttons.
- [x] Task 5: Implement native Windows Taskbar thumbnail toolbar controls (ITaskbarList3 Thumbar) and System Tray → Verify: Hovering over taskbar icon shows previous, play/pause, next buttons; tray icon toggles window visibility.
- [x] Task 6: Implement Discord Rich Presence in Rust using `discord-rich-presence` crate → Verify: Discord profile displays live playing song, artist, album art, and elapsed time with zero UI lag.
- [x] Task 7: Port essential audio/player enhancers (SponsorBlock skip API, ad skip/mute, precise volume wheel hook) → Verify: SponsorBlock segments skip smoothly and mouse wheel over player adjusts volume by exact increments.
- [x] Task 8: Build lightweight settings dialog & persistence via `tauri-plugin-store` → Verify: Toggling options (Discord RPC, Tray, SponsorBlock) persists to `%APPDATA%/pear-desktop` without restarting.

## Done When
- [x] The app runs on Tauri v2 with Windows WebView2, consuming < 150MB idle RAM and < 15MB binary size.
- [x] YouTube Music plays smoothly with full native Windows media key, SMTC, Taskbar thumbnail, and Discord RPC support.
- [x] Bloated plugins (`@ffmpeg.wasm`, `kuromoji`, `peerjs`, Swagger UI) are removed, leaving a streamlined, high-speed music player.
