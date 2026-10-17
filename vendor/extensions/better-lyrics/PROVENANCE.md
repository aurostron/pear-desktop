# Better Lyrics — vendored extension

This directory is an **unmodified copy** of the Better Lyrics browser extension.

| | |
|---|---|
| Upstream | https://github.com/better-lyrics/better-lyrics |
| Version | 3.0.0 |
| Source | GitHub release asset `chrome-v3.0.0.zip` (published 2026-10-15) |
| Files | 96 (5.1 MB) |
| Licence | **GPL-3.0** (full text in `LICENSE` in this directory) |

## Why it is here

WebView2 can load a real, unpacked browser extension via `--load-extension`.
That gives Better Lyrics its genuine `chrome.*` APIs — `storage`, `alarms`,
`i18n` and its own MV3 service worker — instead of trying to re-implement them
behind an `initialization_script`. It also brings the entire feature set
(time-synced lyrics, themes, the Kawarp background, translations, the unison
editor) with no porting work.

`src-tauri/src/lib.rs` locates this folder via `find_extension()` and passes it
to the webview through `additional_browser_args`.

Note that WebView2 disables `--load-extension` unless the
`DisableLoadExtensionCommandLineSwitch` feature is explicitly turned off, so
that flag is part of the argument string we build.

## Updating

1. Download the new `chrome-<version>.zip` from the GitHub releases page.
2. Extract it over this directory, replacing its contents.
3. Keep `LICENSE` (it ships in the upstream repo, not the release zip).
4. Update the version above and `version` in `manifest.json` note below.

No source changes are made here, so an update is always a clean replacement.

## Licensing — read this

Better Lyrics is **GPL-3.0**, a strong copyleft licence. Your project
(`pear-desktop`) is MIT. Distributing an application that bundles this
extension therefore carries GPL-3.0 obligations for the combined work — the
whole distributed binary, not just this folder.

That is a legal call, not a technical one, and it is yours to make. Options:

* Ship it and relicense the combined work under GPL-3.0.
* Ship it for personal/internal use only, where the copyleft does not reach
  distribution.
* Replace it with a permissively licensed equivalent and do the porting work.

Nothing in `src-tauri/` links against this code — it is loaded purely as
extension data at runtime — but bundling is still bundling.