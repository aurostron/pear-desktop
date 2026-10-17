use std::path::PathBuf;

/// Packs the vendored Better Lyrics extension into a flat archive that
/// lib.rs embeds with `include_bytes!`, so the release exe is standalone:
/// no source checkout and no `extensions` folder next to the binary needed.
///
/// Format: u32 file count, then per file: u16 path length, path bytes
/// (UTF-8, '/'-separated, relative to the extension root), u32 byte
/// length, file bytes. Deterministic order (paths sorted) keeps rebuilds
/// stable.
fn pack_extension_archive() {
  let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
  let src = manifest_dir
    .join("..")
    .join("vendor")
    .join("extensions")
    .join("better-lyrics");
  println!("cargo:rerun-if-changed={}", src.display());

  let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
  let out_path = out_dir.join("better_lyrics_ext.bin");

  let mut files: Vec<(String, PathBuf)> = Vec::new();
  let mut stack = vec![src.clone()];
  while let Some(dir) = stack.pop() {
    for entry in std::fs::read_dir(&dir).expect("reading vendored better-lyrics") {
      let path = entry.expect("dir entry").path();
      if path.is_dir() {
        stack.push(path);
      } else {
        let rel = path.strip_prefix(&src).expect("strip prefix");
        files.push((rel.to_string_lossy().replace('\\', "/"), path));
      }
    }
  }
  files.sort_by(|a, b| a.0.cmp(&b.0));

  let mut buf: Vec<u8> = Vec::new();
  buf.extend_from_slice(&(files.len() as u32).to_le_bytes());
  for (rel, abs) in &files {
    let data = std::fs::read(abs).expect("reading extension file");
    buf.extend_from_slice(&(rel.len() as u16).to_le_bytes());
    buf.extend_from_slice(rel.as_bytes());
    buf.extend_from_slice(&(data.len() as u32).to_le_bytes());
    buf.extend_from_slice(&data);
  }

  std::fs::write(&out_path, &buf).expect("writing extension archive");
}

fn main() {
  pack_extension_archive();

  let attributes = tauri_build::Attributes::new().app_manifest(
    tauri_build::AppManifest::new().commands(&[
      "get_settings",
      "save_settings",
      "open_settings_window",
      "open_bl_settings_window",
      "app_minimize",
      "app_toggle_maximize",
      "app_start_drag",
      "app_close",
      "diag_log",
      "diag_read",
      "diag_clear",
    ]),
  );
  tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
