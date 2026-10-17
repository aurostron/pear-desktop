use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongInfo {
    #[serde(rename = "videoId")]
    pub video_id: String,
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub duration: f64,
    #[serde(rename = "imageSrc")]
    pub image_src: Option<String>,
    #[serde(rename = "isPaused", default)]
    pub is_paused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackState {
    pub state: i32,
    #[serde(rename = "isPaused")]
    pub is_paused: bool,
    #[serde(rename = "currentTime", default)]
    pub current_time: f64,
    #[serde(default)]
    pub duration: f64,
}
