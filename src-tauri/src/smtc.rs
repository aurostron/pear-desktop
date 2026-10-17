use std::sync::{Arc, Mutex};
use std::time::Duration;

use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, PlatformConfig};
use tauri::{AppHandle, Manager};

use crate::player::{PlaybackState, SongInfo};

pub struct SmtcManager {
    controls: Arc<Mutex<Option<MediaControls>>>,
}

impl SmtcManager {
    pub fn new(app_handle: AppHandle, hwnd: isize) -> Self {
        let config = PlatformConfig {
            dbus_name: "pear-desktop",
            display_name: "YouTube Music",
            hwnd: Some(hwnd as *mut std::ffi::c_void),
        };

        let mut controls = match MediaControls::new(config) {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to initialize Windows SMTC controls: {:?}", e);
                return Self {
                    controls: Arc::new(Mutex::new(None)),
                };
            }
        };

        let app = app_handle.clone();
        if let Err(e) = controls.attach(move |event: MediaControlEvent| {
            if let Some(window) = app.get_webview_window("main") {
                match event {
                    MediaControlEvent::Play => {
                        let _ = window.eval("window.postMessage({ action: 'play' }, '*');");
                    }
                    MediaControlEvent::Pause => {
                        let _ = window.eval("window.postMessage({ action: 'pause' }, '*');");
                    }
                    MediaControlEvent::Toggle => {
                        let _ = window.eval("window.postMessage({ action: 'toggle-play' }, '*');");
                    }
                    MediaControlEvent::Next => {
                        let _ = window.eval("window.postMessage({ action: 'next' }, '*');");
                    }
                    MediaControlEvent::Previous => {
                        let _ = window.eval("window.postMessage({ action: 'previous' }, '*');");
                    }
                    MediaControlEvent::SetPosition(pos) => {
                        let secs = pos.0.as_secs_f64();
                        let _ = window.eval(&format!(
                            "window.postMessage({{ action: 'seek', time: {} }}, '*');",
                            secs
                        ));
                    }
                    _ => {}
                }
            }
        }) {
            log::error!("Failed to attach SMTC listener: {:?}", e);
        }

        Self {
            controls: Arc::new(Mutex::new(Some(controls))),
        }
    }

    pub fn update_track(&self, song: &SongInfo) {
        if let Ok(mut lock) = self.controls.lock() {
            if let Some(ref mut controls) = *lock {
                let duration = if song.duration > 0.0 {
                    Some(Duration::from_secs_f64(song.duration))
                } else {
                    None
                };

                let meta = MediaMetadata {
                    title: Some(&song.title),
                    artist: Some(&song.artist),
                    album: if song.album.is_empty() {
                        None
                    } else {
                        Some(&song.album)
                    },
                    cover_url: song.image_src.as_deref(),
                    duration,
                };

                if let Err(e) = controls.set_metadata(meta) {
                    log::debug!("Failed to set SMTC metadata: {:?}", e);
                }

                let playback = if song.is_paused {
                    MediaPlayback::Paused { progress: None }
                } else {
                    MediaPlayback::Playing { progress: None }
                };

                let _ = controls.set_playback(playback);
            }
        }
    }

    pub fn update_state(&self, state: &PlaybackState) {
        if let Ok(mut lock) = self.controls.lock() {
            if let Some(ref mut controls) = *lock {
                let playback = if state.is_paused {
                    MediaPlayback::Paused { progress: None }
                } else {
                    MediaPlayback::Playing { progress: None }
                };

                let _ = controls.set_playback(playback);
            }
        }
    }
}
