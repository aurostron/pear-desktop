use std::sync::Arc;
use adblock::engine::Engine;
use adblock::request::Request;

const DEFAULT_FILTERS: &str = r#"
! EasyList / Brave YouTube & Google Ads Blocklist
||googleads.g.doubleclick.net^
||pagead2.googlesyndication.com^
||static.doubleclick.net^
||adservice.google.com^
||youtube.com/api/stats/ads^
||youtube.com/pagead/*
||music.youtube.com/api/stats/ads^
||music.youtube.com/pagead/*
||www.youtube.com/get_midroll_info^
||youtubei.googleapis.com/youtubei/v1/att/get^
||play.google.com/log*
||doubleclick.net^
||googlesyndication.com^
||innovid.com^
||ad.doubleclick.net^
||2mdn.net^
||imasdk.googleapis.com^
||ad.youtube.com^
||ads.youtube.com^
||youtube.com/ptracking*
||music.youtube.com/ptracking*
||s.youtube.com/api/stats/qoe*
||youtube.com/api/stats/qoe*
||music.youtube.com/api/stats/qoe*
||youtube.com/api/stats/atr*
||music.youtube.com/api/stats/atr*
||youtube.com/error_204*
||music.youtube.com/error_204*
@@||youtube.com/videoplayback^
@@||music.youtube.com/videoplayback^
@@||googlevideo.com/videoplayback^
"#;

pub struct AdBlocker {
    engine: Arc<Engine>,
}

impl AdBlocker {
    pub fn new() -> Self {
        let engine = Engine::new_with_list_text(DEFAULT_FILTERS);
        Self {
            engine: Arc::new(engine),
        }
    }

    pub fn should_block(&self, url: &str, source_url: &str) -> bool {
        // Fast-path whitelist for audio/video stream playback
        if url.contains("/videoplayback") {
            return false;
        }

        // Fast path for obvious Google ad and doubleclick hosts
        if url.contains("googleads.g.doubleclick.net")
            || url.contains("/api/stats/ads")
            || url.contains("/pagead/")
            || url.contains("adservice.google.com")
            || url.contains("pagead2.googlesyndication.com")
            || url.contains("imasdk.googleapis.com")
            || url.contains("static.doubleclick.net")
        {
            return true;
        }

        if let Ok(request) = Request::new(url, source_url, "xmlhttprequest", "GET") {
            let result = self.engine.check_network_request(&request);
            result.should_block()
        } else {
            false
        }
    }
}
