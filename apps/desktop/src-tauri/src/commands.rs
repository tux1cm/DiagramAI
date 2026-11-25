use std::{path::PathBuf, sync::Arc};
use tauri::State;
use crate::{files, storage};

pub struct NativeState { pub database: Option<PathBuf>, pub grants: files::Grants }
type Shared<'a> = State<'a, Arc<NativeState>>;
fn path(state: &NativeState) -> storage::Result<PathBuf> { state.database.clone().ok_or("Không xác định được thư mục dữ liệu ứng dụng.".into()) }
async fn blocking<T: Send + 'static>(work: impl FnOnce() -> storage::Result<T> + Send + 'static) -> storage::Result<T> { tauri::async_runtime::spawn_blocking(work).await.map_err(|_| "Tác vụ local không hoàn tất.")? }
#[tauri::command] pub async fn local_list(state: Shared<'_>) -> storage::Result<Vec<storage::Summary>> { let p = path(&state)?; blocking(move || storage::list(&p)).await }
#[tauri::command] pub async fn local_load(state: Shared<'_>, document_id: String) -> storage::Result<Option<storage::Record>> { let p = path(&state)?; blocking(move || storage::load(&p,&document_id)).await }
#[tauri::command] pub async fn local_save(state: Shared<'_>, record: storage::Prepared, expected_version: Option<i64>) -> storage::Result<storage::Record> { let p = path(&state)?; blocking(move || storage::save(&p,record,expected_version)).await }
#[tauri::command] pub async fn local_remove(state: Shared<'_>, document_id: String, expected_version: i64) -> storage::Result<()> { let p = path(&state)?; blocking(move || storage::remove(&p,&document_id,expected_version)).await }
#[tauri::command] pub async fn local_revisions(state: Shared<'_>, document_id: String) -> storage::Result<Vec<storage::Record>> { let p = path(&state)?; blocking(move || storage::revisions(&p,&document_id)).await }
#[tauri::command] pub async fn local_active(state: Shared<'_>) -> storage::Result<Option<String>> { let p = path(&state)?; blocking(move || storage::active(&p)).await }
#[tauri::command] pub async fn local_set_active(state: Shared<'_>, document_id: String) -> storage::Result<()> { let p = path(&state)?; blocking(move || storage::set_active(&p,&document_id)).await }
#[tauri::command] pub async fn native_open_file(app: tauri::AppHandle, state: Shared<'_>) -> storage::Result<Option<files::Opened>> { let s = state.inner().clone(); blocking(move || files::open(&app,&s.grants)).await }
#[tauri::command] pub async fn native_save_file(app: tauri::AppHandle, state: Shared<'_>, name: String, bytes: Vec<u8>, kind: String, handle: Option<String>) -> storage::Result<Option<files::Saved>> { let s = state.inner().clone(); blocking(move || files::save(&app,&s.grants,name,bytes,kind,handle)).await }
#[tauri::command] pub async fn sync_read(state: Shared<'_>, document_id:String)->storage::Result<crate::sync::Read> {let p=path(&state)?;blocking(move||crate::sync::read(&p,&document_id)).await}
#[tauri::command] pub async fn sync_commit(state: Shared<'_>, request:crate::sync::Commit)->storage::Result<()> {let p=path(&state)?;blocking(move||crate::sync::commit(&p,request)).await}
#[tauri::command] pub async fn sync_credential(state: Shared<'_>, device_id:String)->storage::Result<Option<String>> {let p=path(&state)?;blocking(move||crate::sync::credential(&p,&device_id)).await}
#[tauri::command] pub async fn workspace_read(state: Shared<'_>)->storage::Result<Option<serde_json::Value>> {let p=path(&state)?;blocking(move||crate::workspace::read(&p)).await}
#[tauri::command] pub async fn workspace_write(state: Shared<'_>,input:crate::workspace::Commit)->storage::Result<()> {let p=path(&state)?;blocking(move||crate::workspace::write(&p,input)).await}
#[tauri::command] pub async fn share_credential_write(state: Shared<'_>,access:crate::workspace::ShareAccess)->storage::Result<()> {let p=path(&state)?;blocking(move||crate::workspace::save_share(&p,access)).await}
#[tauri::command] pub async fn share_catalog_read(state: Shared<'_>,id:String)->storage::Result<Option<serde_json::Value>> {let p=path(&state)?;blocking(move||crate::workspace::read_share_catalog(&p,&id)).await}
#[tauri::command] pub async fn share_catalog_write(state: Shared<'_>,catalog:serde_json::Value)->storage::Result<()> {let p=path(&state)?;blocking(move||crate::workspace::write_share_catalog(&p,catalog)).await}
#[tauri::command] pub async fn share_context_read(state: Shared<'_>)->storage::Result<Option<String>> {let p=path(&state)?;blocking(move||crate::workspace::read_share_context(&p)).await}
#[tauri::command] pub async fn share_context_write(state: Shared<'_>,id:Option<String>)->storage::Result<()> {let p=path(&state)?;blocking(move||crate::workspace::write_share_context(&p,id)).await}
