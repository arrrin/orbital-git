#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod git;
use tauri::Manager;

#[tauri::command]
async fn repository(path: String) -> Result<git::Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git::snapshot(&path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn working_state(path: String) -> Result<git::WorkingState, String> {
    tauri::async_runtime::spawn_blocking(move || git::working_state(&path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn execute(path: String, action: String, args: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || git::execute(&path, &action, &args))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn diff(
    path: String,
    file: String,
    revision: Option<String>,
    staged: bool,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::diff(&path, &file, revision.as_deref(), staged)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn load_workspace(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let file = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("workspace.json");
    if !file.exists() {
        return Ok(serde_json::json!({"repos": [],"groups":["Workspace"]}));
    }
    serde_json::from_slice(&std::fs::read(file).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn save_workspace(app: tauri::AppHandle, workspace: serde_json::Value) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let temporary = dir.join("workspace.tmp");
    std::fs::write(
        &temporary,
        serde_json::to_vec_pretty(&workspace).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temporary, dir.join("workspace.json")).map_err(|e| e.to_string())
}
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            repository,
            working_state,
            execute,
            diff,
            load_workspace,
            save_workspace,
            restart_app
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Orbital");
}
