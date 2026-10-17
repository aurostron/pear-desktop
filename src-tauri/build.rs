fn main() {
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
