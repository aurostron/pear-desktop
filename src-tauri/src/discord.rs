use std::sync::mpsc::{channel, Sender};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

use crate::player::{PlaybackState, SongInfo};

const DISCORD_CLIENT_ID: &str = "1177081335727267940";

pub enum DiscordMessage {
    UpdateTrack(SongInfo),
    UpdateState(PlaybackState),
    #[allow(dead_code)]
    Clear,
}

pub struct DiscordManager {
    sender: Sender<DiscordMessage>,
}

impl DiscordManager {
    pub fn new() -> Self {
        let (tx, rx) = channel::<DiscordMessage>();

        thread::spawn(move || {
            let mut client: Option<DiscordIpcClient> = None;
            let mut current_song: Option<SongInfo> = None;

            while let Ok(msg) = rx.recv() {
                // Lazy connection to Discord IPC
                if client.is_none() {
                    let mut new_client = DiscordIpcClient::new(DISCORD_CLIENT_ID);
                    if let Err(e) = new_client.connect() {
                        log::debug!("Discord IPC not reachable: {:?}", e);
                        continue;
                    }
                    client = Some(new_client);
                }

                let c = match client.as_mut() {
                    Some(c) => c,
                    None => continue,
                };

                match msg {
                    DiscordMessage::UpdateTrack(song) => {
                        let is_paused = song.is_paused;
                        current_song = Some(song.clone());

                        if is_paused {
                            let _ = c.clear_activity();
                            continue;
                        }

                        let start_time = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs() as i64;

                        let end_time = if song.duration > 0.0 {
                            Some(start_time + (song.duration as i64))
                        } else {
                            None
                        };

                        let image_url = song
                            .image_src
                            .clone()
                            .unwrap_or_else(|| "https://music.youtube.com/favicon.ico".to_string());

                        let mut act = activity::Activity::new()
                            .details(&song.title)
                            .state(&song.artist)
                            .assets(
                                activity::Assets::new()
                                    .large_image(&image_url)
                                    .large_text(if song.album.is_empty() {
                                        &song.title
                                    } else {
                                        &song.album
                                    })
                                    .small_image("https://music.youtube.com/favicon.ico")
                                    .small_text("Playing"),
                            );

                        if let Some(end) = end_time {
                            act = act.timestamps(
                                activity::Timestamps::new()
                                    .start(start_time)
                                    .end(end),
                            );
                        } else {
                            act = act.timestamps(activity::Timestamps::new().start(start_time));
                        }

                        if let Err(e) = c.set_activity(act) {
                            log::debug!("Failed to set Discord activity: {:?}", e);
                            client = None; // Reset client on connection drop
                        }
                    }
                    DiscordMessage::UpdateState(state) => {
                        if state.is_paused {
                            let _ = c.clear_activity();
                        } else if let Some(ref song) = current_song {
                            // Resume activity
                            let now = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs() as i64;
                            let start_time = now - (state.current_time as i64);
                            let end_time = if song.duration > 0.0 {
                                Some(start_time + (song.duration as i64))
                            } else {
                                None
                            };

                            let image_url = song
                                .image_src
                                .clone()
                                .unwrap_or_else(|| "https://music.youtube.com/favicon.ico".to_string());

                            let mut act = activity::Activity::new()
                                .details(&song.title)
                                .state(&song.artist)
                                .assets(
                                    activity::Assets::new()
                                        .large_image(&image_url)
                                        .large_text(&song.album),
                                );

                            if let Some(end) = end_time {
                                act = act.timestamps(
                                    activity::Timestamps::new()
                                        .start(start_time)
                                        .end(end),
                                );
                            }

                            if let Err(e) = c.set_activity(act) {
                                log::debug!("Failed to set Discord activity: {:?}", e);
                                client = None;
                            }
                        }
                    }
                    DiscordMessage::Clear => {
                        let _ = c.clear_activity();
                    }
                }
            }
        });

        Self { sender: tx }
    }

    pub fn update_track(&self, song: SongInfo) {
        let _ = self.sender.send(DiscordMessage::UpdateTrack(song));
    }

    pub fn update_state(&self, state: PlaybackState) {
        let _ = self.sender.send(DiscordMessage::UpdateState(state));
    }

    #[allow(dead_code)]
    pub fn clear(&self) {
        let _ = self.sender.send(DiscordMessage::Clear);
    }
}
