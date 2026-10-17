use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

fn default_font_family() -> String {
    "Geist".to_string()
}

fn default_crossfade_duration() -> f64 {
    4.0
}

fn default_font_weight() -> String {
    "500".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub discord_rpc: bool,
    pub sponsorblock: bool,
    pub close_to_tray: bool,
    pub precise_volume: bool,
    pub auto_skip_ads: bool,
    /// Run stock YouTube Music with zero extension overhead. Applies on the
    /// next launch: WebView2 fixes the extension environment flags when the
    /// first webview is created (see `SettingsState::perf_mode_at_startup`).
    #[serde(default)]
    pub performance_mode: bool,
    /// Fade the end of each song into the start of the next. Implemented as
    /// a Web Audio fade-through: YouTube's SABR streaming makes a true
    /// overlapping crossfade (two simultaneous sources) impossible from
    /// inside the page.
    #[serde(default)]
    pub crossfade_enabled: bool,
    /// Crossfade length in seconds. The settings UI exposes 1-12 s; the
    /// page clamps to 0.5-15 s as a safety net.
    #[serde(default = "default_crossfade_duration")]
    pub crossfade_duration: f64,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_weight")]
    pub font_weight: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            discord_rpc: true,
            sponsorblock: true,
            close_to_tray: true,
            precise_volume: true,
            auto_skip_ads: true,
            performance_mode: false,
            crossfade_enabled: false,
            crossfade_duration: default_crossfade_duration(),
            font_family: default_font_family(),
            font_weight: default_font_weight(),
        }
    }
}

pub struct SettingsState {
    pub settings: Arc<Mutex<AppSettings>>,
    /// Snapshot of `performance_mode` taken at startup. WebView2 fixes the
    /// environment's extension flags when the first webview is created, so
    /// toggling the setting only takes effect on the next launch -- all
    /// window builders must read this snapshot, never the live setting
    /// (mismatched environment options between windows fail with 0x8007139F).
    pub perf_mode_at_startup: bool,
}

impl SettingsState {
    pub fn new(app: &AppHandle) -> Self {
        let store = app.store("settings.json");
        let initial_settings = if let Ok(s) = store {
            if let Some(val) = s.get("config") {
                serde_json::from_value(val).unwrap_or_default()
            } else {
                AppSettings::default()
            }
        } else {
            AppSettings::default()
        };

        let perf_mode_at_startup = initial_settings.performance_mode;

        Self {
            settings: Arc::new(Mutex::new(initial_settings)),
            perf_mode_at_startup,
        }
    }

    pub fn get(&self) -> AppSettings {
        self.settings.lock().unwrap().clone()
    }

    pub fn update(&self, app: &AppHandle, new_settings: AppSettings) -> Result<(), String> {
        *self.settings.lock().unwrap() = new_settings.clone();
        if let Ok(store) = app.store("settings.json") {
            store.set("config", serde_json::to_value(&new_settings).unwrap());
            let _ = store.save();
        }

        // Notify webview to apply the new font and crossfade config
        // immediately -- both take effect live, no restart needed.
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.eval(&format!(
                "window.postMessage({{ action: 'set-font', font: '{}', weight: '{}' }}, '*'); window.postMessage({{ action: 'set-crossfade', enabled: {}, duration: {} }}, '*');",
                new_settings.font_family, new_settings.font_weight,
                new_settings.crossfade_enabled, new_settings.crossfade_duration
            ));
        }

        Ok(())
    }
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, SettingsState>) -> AppSettings {
    state.get()
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: tauri::State<'_, SettingsState>,
    settings: AppSettings,
) -> Result<(), String> {
    state.update(&app, settings)
}
