mod adblocker;
mod discord;
mod player;
mod settings;
mod smtc;

use std::io::Write;
use std::sync::Arc;
use tauri::{tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Listener, Manager};

use adblocker::AdBlocker;
use discord::DiscordManager;
use player::{PlaybackState, SongInfo};
use settings::SettingsState;
use smtc::SmtcManager;

/// Appends a line to the injection diagnostic log.
///
/// This exists because a script injected into a remote page fails silently:
/// there is no console to read unless devtools are open, and a throw anywhere
/// in the script hides everything downstream. This makes injection observable
/// from outside the app.
fn diag_log_path() -> std::path::PathBuf {
  std::env::temp_dir().join("pear-ytm-diag.log")
}

/// Locates the directory that contains unpacked browser extensions.
///
/// WebView2 ignores the `--load-extension` command-line switch (verified via
/// CDP: no extension target ever appears, even with
/// `--disable-features=DisableLoadExtensionCommandLineSwitch`). The supported
/// route is `AreBrowserExtensionsEnabled` plus
/// `ICoreWebView2Profile7::AddBrowserExtension`, which wry drives for us when
/// `WebviewWindowBuilder::extensions_path` is set.
///
/// wry registers *one extension per child folder* of this path, so the value
/// must be the parent directory (`.../extensions`), never the extension
/// folder itself.
///
/// Resolution order:
///   1. `PEAR_BL_EXT` env var -- a scratch dir of extension folders.
///   2. `vendor/extensions` next to the crate -- the committed copy.
///   3. Tauri resource dir `extensions` -- the bundled copy.
#[cfg(target_os = "windows")]
fn find_extensions_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
  let looks_like_extensions_dir = |p: &std::path::Path| {
    p.is_dir() && p.join("better-lyrics").join("manifest.json").is_file()
  };

  if let Ok(custom) = std::env::var("PEAR_BL_EXT") {
    let p = std::path::PathBuf::from(custom);
    if looks_like_extensions_dir(&p) {
      return Some(p);
    }
    log::warn!(
      "PEAR_BL_EXT set but no extensions found under {}",
      p.display()
    );
  }

  let crate_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
  let repo_root = crate_dir.parent().unwrap_or(crate_dir);
  let vendored = repo_root.join("vendor").join("extensions");
  if looks_like_extensions_dir(&vendored) {
    return Some(vendored);
  }

  if let Ok(dir) = app.path().resource_dir() {
    let p = dir.join("extensions");
    if looks_like_extensions_dir(&p) {
      return Some(p);
    }
  }

  None
}

#[tauri::command]
fn diag_log(kind: String, msg: String) {
  log::info!("[diag:{}] {}", kind, msg);
  let line = format!("[{}] {}\n", kind, msg.replace('\n', " "));
  if let Ok(mut f) = std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(diag_log_path())
  {
    let _ = f.write_all(line.as_bytes());
  }
}

#[tauri::command]
fn diag_read() -> Option<String> {
  std::fs::read_to_string(diag_log_path()).ok()
}

#[tauri::command]
fn diag_clear() {
  let _ = std::fs::remove_file(diag_log_path());
}

/// Shared by the "Settings" tray menu item and the IPC command below.
///
/// Never call this inline from a synchronous command: synchronous commands run
/// on the main thread inside a WebView2 message callback, and creating a
/// webview there re-enters the message pump, which hangs or crashes the
/// process. The command wrapper below is async so Tauri runs it off-thread,
/// while the tray handler runs on the event loop, where synchronous window
/// creation is the normal supported path.
///
/// The window must carry the *same* WebView2 environment options as the main
/// window: WebView2 rejects a webview whose environment options (e.g. the
/// extension flags below) differ from the environment already created in the
/// process, failing `build()` with HRESULT 0x8007139F (ERROR_INVALID_STATE).
fn open_settings_window_impl(app: &tauri::AppHandle) {
  if let Some(win) = app.get_webview_window("settings") {
    diag_log("rust".into(), "open_settings: window exists, focusing".into());
    let _ = win.show();
    let _ = win.set_focus();
  } else {
    diag_log("rust".into(), "open_settings: creating window".into());
    let mut builder = tauri::WebviewWindowBuilder::new(
      app,
      "settings",
      tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("YouTube Music Settings")
    .inner_size(500.0, 520.0)
    .resizable(false)
    .on_page_load(|_webview, payload| {
      diag_log(
        "rust".into(),
        format!(
          "open_settings: page_load {:?} for {}",
          payload.event(),
          payload.url()
        ),
      );
    });

    // Environment options must equal the main window's, or build() fails
    // with 0x8007139F. When performance mode was on at startup the main
    // window was built *without* extensions, so this one must match.
    #[cfg(target_os = "windows")]
    if !app.state::<SettingsState>().perf_mode_at_startup {
      if let Some(dir) = find_extensions_dir(app) {
        builder = builder.browser_extensions_enabled(true).extensions_path(dir);
      }
    }

    match builder.build() {
      Ok(_) => diag_log("rust".into(), "open_settings: window built".into()),
      Err(e) => diag_log("rust".into(), format!("open_settings: build failed: {e}")),
    }
  }
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle) {
  open_settings_window_impl(&app);
}

/// Derives the Chrome extension id of the vendored Better Lyrics build.
///
/// The manifest carries a `key` (the extension's published public key), and
/// Chrome derives the id from it: SHA-256 over the decoded key, first 16 bytes,
/// each nibble mapped `0-f` -> `a-p`. This mirrors `tools/ext-id.mjs` and is
/// deliberately *path*-independent, so the same id resolves whether the
/// extension runs from the dev checkout or an installed resource dir.
#[cfg(target_os = "windows")]
fn better_lyrics_id(extensions_dir: &std::path::Path) -> Option<String> {
  use base64::Engine as _;
  use sha2::{Digest, Sha256};

  let manifest_path = extensions_dir.join("better-lyrics").join("manifest.json");
  let manifest = std::fs::read_to_string(&manifest_path).ok()?;
  let json: serde_json::Value = serde_json::from_str(&manifest).ok()?;
  let key = json
    .get("key")
    .or_else(|| json.get("chrome:key"))
    .or_else(|| json.get("chromium:key"))?
    .as_str()?;
  let der = base64::engine::general_purpose::STANDARD.decode(key).ok()?;
  let hash = Sha256::digest(&der);

  let mut id = String::with_capacity(32);
  for byte in hash.iter().take(16) {
    id.push((b'a' + (byte >> 4)) as char);
    id.push((b'a' + (byte & 0x0f)) as char);
  }
  Some(id)
}

/// Opens the Better Lyrics settings page -- the same UI a browser shows when
/// clicking the extension's toolbar icon (`action/default_popup`) -- in its own
/// small window, sized to the page's natural 560x600 layout.
///
/// Only reachable once the extension has actually been registered (the
/// find_extensions_dir check), and only meaningful on Windows/WebView2.
///
/// This must be async: a synchronous command runs inline on the main thread's
/// WebView2 message callback, and building a second webview there re-enters
/// the message pump and deadlocks. An async command executes off-thread and
/// Tauri marshals the actual creation back onto the main event loop.
#[tauri::command]
async fn open_bl_settings_window(app: tauri::AppHandle) {
  if let Some(win) = app.get_webview_window("bl-settings") {
    let _ = win.show();
    let _ = win.set_focus();
    return;
  }

  // Performance mode loads no extensions at all, so there is no extension
  // page to show -- and building this window with extension environment
  // options would mismatch the main window's environment (0x8007139F).
  #[cfg(target_os = "windows")]
  if app.state::<SettingsState>().perf_mode_at_startup {
    diag_log("rust".into(), "open_bl_settings: performance mode is on; nothing to open".into());
    return;
  }

  #[cfg(target_os = "windows")]
  {
    let Some(dir) = find_extensions_dir(&app) else {
      diag_log("rust".into(), "open_bl_settings: extensions dir not found".into());
      return;
    };
    let Some(id) = better_lyrics_id(&dir) else {
      diag_log("rust".into(), "open_bl_settings: could not derive extension id".into());
      return;
    };
    let target = format!("chrome-extension://{id}/action/index.html");
    diag_log("rust".into(), format!("open_bl_settings: opening {target}"));

    // The window starts at about:blank and the extension page is navigated to
    // afterwards, host-side, with retries. Two WebView2 behaviours force this:
    //   1. Each webview gets a fresh environment whose AddBrowserExtension
    //      registration completes asynchronously. Navigations to
    //      `chrome-extension://` issued before that completes are dropped
    //      (observed: the window settles on WebView2's default start page).
    //   2. Only host/browser-initiated navigations may reach extension URLs.
    //      Page-initiated ones (a script setting `location.href`) are rejected
    //      with ERR_BLOCKED_BY_CLIENT by WebView2/Edge.
    // `WebviewWindow::navigate` is host-side, and retrying covers point 1.
    let result = tauri::WebviewWindowBuilder::new(
      &app,
      "bl-settings",
      tauri::WebviewUrl::External(url::Url::parse("about:blank").unwrap()),
    )
    .title("Better Lyrics")
    .inner_size(560.0, 600.0)
    .resizable(false)
    .browser_extensions_enabled(true)
    .extensions_path(&dir)
    .build();

    match result {
      Ok(win) => {
        diag_log("rust".into(), "open_bl_settings: window built".into());
        std::thread::spawn(move || {
          let target_url = match url::Url::parse(&target) {
            Ok(u) => u,
            Err(e) => {
              diag_log("rust".into(), format!("open_bl_settings: bad url: {e}"));
              return;
            }
          };
          for attempt in 1..=8 {
            std::thread::sleep(std::time::Duration::from_millis(if attempt == 1 { 400 } else { 1000 }));
            let current = win.url().map(|u| u.to_string()).unwrap_or_default();
            if current.starts_with("chrome-extension://") {
              diag_log("rust".into(), format!("open_bl_settings: loaded on attempt {attempt} ({current})"));
              return;
            }
            let _ = win.navigate(target_url.clone());
          }
          diag_log("rust".into(), "open_bl_settings: gave up navigating".into());
        });
      }
      Err(e) => diag_log("rust".into(), format!("open_bl_settings: build failed: {e}")),
    }
  }
}

/// Resolves the main webview. The injected titlebar controls in `ui/inject.js`
/// live in that window, so these commands must never fall back to "settings".
fn main_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
  app.get_webview_window("main")
}

#[tauri::command]
fn app_minimize(app: tauri::AppHandle) {
  if let Some(win) = main_window(&app) {
    let _ = win.minimize();
  }
}

#[tauri::command]
fn app_toggle_maximize(app: tauri::AppHandle) {
  if let Some(win) = main_window(&app) {
    match win.is_maximized() {
      Ok(true) => {
        let _ = win.unmaximize();
      }
      _ => {
        let _ = win.maximize();
      }
    }
  }
}

#[tauri::command]
fn app_start_drag(app: tauri::AppHandle) {
  if let Some(win) = main_window(&app) {
    let _ = win.start_dragging();
  }
}

/// Closes the main window. Routed through the window's close handler so the
/// "close to tray" setting set up in `setup()` still applies -- calling
/// `app.exit()` here would bypass it.
#[tauri::command]
fn app_close(app: tauri::AppHandle) {
  if let Some(win) = main_window(&app) {
    let _ = win.close();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_global_shortcut::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      settings::get_settings,
      settings::save_settings,
      open_settings_window,
      open_bl_settings_window,
      app_minimize,
      app_toggle_maximize,
      app_start_drag,
      app_close,
      diag_log,
      diag_read,
      diag_clear
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Initialize Settings State
      let settings_state = SettingsState::new(app.handle());
      // WebView2 fixes the extension environment flags when the first
      // webview is created, so performance mode can only change across
      // restarts -- every window builder reads this snapshot, never the
      // live setting (see SettingsState::perf_mode_at_startup).
      let perf_mode = settings_state.perf_mode_at_startup;
      app.manage(settings_state);

      // Initialize Discord Rich Presence Manager
      let discord = Arc::new(DiscordManager::new());

      // Initialize Brave AdBlocker engine
      let adblocker = Arc::new(AdBlocker::new());
      let blocker = adblocker.clone();

      // Create primary YouTube Music WebView2 window
      let ytm_url = url::Url::parse("https://music.youtube.com").expect("Invalid URL");

      // The Pear logo gets its own initialization_script, fully independent of
      // the main bridge below. (The first version of this app put the logo, the
      // font, ad blocking and the IPC bridge in one script, where a single parse
      // error silently disabled all of them.)
      let logo_script = include_str!("../../ui/logo.js");

      // Re-evaluated on every completed page load so SPA navigations cannot lose
      // it. Re-injection is idempotent -- logo.js guards itself with a global flag.
      let page_load_scripts = vec![logo_script.to_string()];

      // Enable browser extensions and point wry at the folder holding them.
      // wry creates the WebView2 environment with `AreBrowserExtensionsEnabled`
      // and registers one `AddBrowserExtension` call per child folder, so the
      // extension runs with its genuine `chrome.*` APIs and service worker.
      #[cfg(target_os = "windows")]
      let extensions_dir: Option<std::path::PathBuf> = if perf_mode {
        diag_log("rust".into(), "performance mode: extension load skipped".into());
        None
      } else {
        match find_extensions_dir(app.handle()) {
          Some(p) => {
            diag_log("rust".into(), format!("extensions dir: {}", p.display()));
            Some(p)
          }
          None => {
            diag_log("rust".into(), "extensions dir NOT found - running without extensions".into());
            None
          }
        }
      };

      let mut window_builder = tauri::WebviewWindowBuilder::new(
        app,
        "main",
        tauri::WebviewUrl::External(ytm_url),
      )
      .title("YouTube Music")
      .inner_size(1200.0, 800.0)
      .min_inner_size(400.0, 300.0)
      .maximized(true)
      .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
      .initialization_script(include_str!("../../ui/inject.js"))
      .initialization_script(logo_script)
      .on_page_load(move |webview, payload| {
        diag_log("rust".into(), format!("page_load {:?} for {}", payload.event(), payload.url()));
        if let tauri::webview::PageLoadEvent::Finished = payload.event() {
          for script in &page_load_scripts {
            match webview.eval(script) {
              Ok(()) => diag_log("rust".into(), "eval(logo.js) dispatched".into()),
              Err(e) => diag_log("rust".into(), format!("eval(logo.js) FAILED: {}", e)),
            }
          }
        }
      })
      .on_web_resource_request(move |request, response| {
        let uri = request.uri().to_string();
        if blocker.should_block(&uri, "https://music.youtube.com") {
          *response.status_mut() = tauri::http::StatusCode::NO_CONTENT;
          *response.body_mut() = std::borrow::Cow::Borrowed(&[]);
        }
      });

      #[cfg(target_os = "windows")]
      if let Some(dir) = &extensions_dir {
        window_builder = window_builder
          .browser_extensions_enabled(true)
          .extensions_path(dir);
      }

      let window = window_builder.build()?;

      // AddBrowserExtension runs asynchronously right after webview creation,
      // so the navigation already in flight misses the extensions'
      // `document_start` content scripts. Reload once, shortly after, to get
      // a load that includes them. The old 8 s wait just discarded more page
      // work: the bl-settings window shows extension registration completes
      // by ~1.4 s ("loaded on attempt 2"), so 3 s carries a 2x margin.
      // Performance mode runs without extensions and needs no reload at all.
      #[cfg(target_os = "windows")]
      if extensions_dir.is_some() {
        let w = window.clone();
        std::thread::spawn(move || {
          std::thread::sleep(std::time::Duration::from_secs(3));
          diag_log("rust".into(), "eval(reload) to apply extension content scripts".into());
          let _ = w.eval("window.location.reload()");
        });
      }

      // Record injection start so a failure to even reach the page is visible.
      diag_log("rust".into(), "main webview built; inject.js + logo.js attached".into());

      // Close to tray behavior (respecting settings)
      let win_clone = window.clone();
      let app_handle_for_close = app.handle().clone();
      window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
          let state = app_handle_for_close.state::<SettingsState>();
          if state.get().close_to_tray {
            api.prevent_close();
            let _ = win_clone.hide();
          }
        }
      });

      // Initialize Windows SMTC (System Media Transport Controls)
      #[cfg(target_os = "windows")]
      let smtc = {
        let hwnd = window.hwnd().unwrap();
        Arc::new(SmtcManager::new(app.handle().clone(), hwnd.0 as _))
      };

      // Configure System Tray
      if let Some(icon) = app.default_window_icon() {
        let play_i = tauri::menu::MenuItem::with_id(app, "play_pause", "Play / Pause", true, None::<&str>)?;
        let next_i = tauri::menu::MenuItem::with_id(app, "next", "Next Track", true, None::<&str>)?;
        let prev_i = tauri::menu::MenuItem::with_id(app, "prev", "Previous Track", true, None::<&str>)?;
        let settings_i = tauri::menu::MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
        let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let tray_menu = tauri::menu::Menu::with_items(app, &[&play_i, &next_i, &prev_i, &settings_i, &quit_i])?;

        let _tray = TrayIconBuilder::new()
          .icon(icon.clone())
          .tooltip("YouTube Music")
          .menu(&tray_menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| {
            match event.id.as_ref() {
              "quit" => app.exit(0),
              "settings" => open_settings_window_impl(app),
              "play_pause" => {
                if let Some(win) = app.get_webview_window("main") {
                  let _ = win.eval("window.postMessage({ action: 'toggle-play' }, '*');");
                }
              }
              "next" => {
                if let Some(win) = app.get_webview_window("main") {
                  let _ = win.eval("window.postMessage({ action: 'next' }, '*');");
                }
              }
              "prev" => {
                if let Some(win) = app.get_webview_window("main") {
                  let _ = win.eval("window.postMessage({ action: 'previous' }, '*');");
                }
              }
              _ => {}
            }
          })
          .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              ..
            } = event
            {
              let app = tray.app_handle();
              if let Some(win) = app.get_webview_window("main") {
                if win.is_visible().unwrap_or(false) {
                  let _ = win.hide();
                } else {
                  let _ = win.show();
                  let _ = win.set_focus();
                }
              }
            }
          })
          .build(app)?;
      }

      // Track Change listener (Updates Discord RPC and Windows SMTC)
      let d_track = discord.clone();
      #[cfg(target_os = "windows")]
      let s_track = smtc.clone();
      let app_handle_for_track = app.handle().clone();
      app.listen("ytm:song-change", move |event| {
        if let Ok(info) = serde_json::from_str::<SongInfo>(event.payload()) {
          log::info!("[YTM] Track change: {} - {}", info.title, info.artist);
          let state = app_handle_for_track.state::<SettingsState>();
          if state.get().discord_rpc {
            d_track.update_track(info.clone());
          }
          #[cfg(target_os = "windows")]
          s_track.update_track(&info);
        }
      });

      // Playback State listener (Playing / Paused updates)
      let d_state = discord.clone();
      #[cfg(target_os = "windows")]
      let s_state = smtc.clone();
      let app_handle_for_state = app.handle().clone();
      app.listen("ytm:state-change", move |event| {
        if let Ok(state) = serde_json::from_str::<PlaybackState>(event.payload()) {
          let settings = app_handle_for_state.state::<SettingsState>();
          if settings.get().discord_rpc {
            d_state.update_state(state.clone());
          }
          #[cfg(target_os = "windows")]
          s_state.update_state(&state);
        }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
