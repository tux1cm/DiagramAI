#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod storage;
mod files;
mod commands;
mod sync;
mod vault;
mod workspace;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = std::env::var_os("DIAGRAMAI_TEST_DATA_DIR").map(std::path::PathBuf::from).or_else(|| app.path().app_data_dir().ok());
            app.manage(std::sync::Arc::new(commands::NativeState { database: directory.map(|path| path.join("diagramai.sqlite")), grants: files::Grants::default() }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::local_list,commands::local_load,commands::local_save,commands::local_remove,commands::local_revisions,commands::local_active,commands::local_set_active,commands::native_open_file,commands::native_save_file,commands::sync_read,commands::sync_commit,commands::sync_credential,commands::workspace_read,commands::workspace_write])
        .run(tauri::generate_context!())
        .expect("failed to run DiagramAI");
}
