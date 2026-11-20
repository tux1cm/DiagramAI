use serde::Serialize;
use std::{collections::HashMap, io::Write, path::PathBuf, sync::Mutex};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct Grants(pub Mutex<HashMap<String, (PathBuf, String)>>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened { pub name: String, pub text: String, pub handle: String }
#[derive(Serialize)]
pub struct Saved { pub name: String, pub handle: String }
pub fn open(app: &tauri::AppHandle, grants: &Grants) -> Result<Option<Opened>, String> {
    let Some(file) = app.dialog().file().set_title("DiagramAI · Mở sơ đồ").add_filter("DiagramAI", &["diagramai","json"]).blocking_pick_file() else { return Ok(None); };
    let path = file.into_path().map_err(|_| "Không đọc được đường dẫn file đã chọn.")?;
    if std::fs::metadata(&path).map_err(|_| "Không đọc được file.")?.len() > 2 * 1024 * 1024 { return Err("File vượt giới hạn 2 MB.".into()); }
    let text = std::fs::read_to_string(&path).map_err(|_| "Không đọc được file UTF-8.")?;
    let handle = uuid::Uuid::new_v4().to_string(); let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    grants.0.lock().map_err(|_| "Không truy cập được quyền file.")?.insert(handle.clone(), (path,"document".into()));
    Ok(Some(Opened { name, text, handle }))
}
pub fn save(app: &tauri::AppHandle, grants: &Grants, name: String, bytes: Vec<u8>, kind: String, handle: Option<String>) -> Result<Option<Saved>, String> {
    let extension = match kind.as_str() { "document" => "diagramai", "svg" => "svg", "png" => "png", "pdf" => "pdf", _ => return Err("Định dạng không được hỗ trợ.".into()) };
    if bytes.len() > if kind == "document" { 2 * 1024 * 1024 } else { 40 * 1024 * 1024 } { return Err("File xuất vượt giới hạn kích thước.".into()); }
    let granted = match handle.as_ref() {
        Some(id) => Some(grants.0.lock().map_err(|_| "Không truy cập được quyền file.")?.get(id).filter(|(_, granted_kind)| granted_kind == &kind).map(|(path,_)| path.clone()).ok_or("Quyền ghi file không còn hợp lệ; hãy Lưu thành file mới.")?),
        None => None,
    };
    let path = if let Some(path) = granted { path } else {
        let safe_name: String = name.chars().take(120).map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '_' } else { c }).collect();
        let Some(file) = app.dialog().file().set_title(format!("DiagramAI · Lưu {extension}")).set_file_name(safe_name).add_filter("DiagramAI", &[extension]).blocking_save_file() else { return Ok(None); };
        file.into_path().map_err(|_| "Không ghi được đường dẫn đã chọn.")?
    };
    atomic_write(&path, &bytes)?;
    let id = handle.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    grants.0.lock().map_err(|_| "Không truy cập được quyền file.")?.insert(id.clone(),(path,kind));
    Ok(Some(Saved { name, handle: id }))
}
fn atomic_write(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Đường dẫn không hợp lệ.")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|_| "Không tạo được file tạm. File cũ chưa bị thay đổi.")?;
    temp.write_all(bytes).and_then(|_| temp.as_file().sync_all()).map_err(|_| "Không ghi đủ dữ liệu. File cũ chưa bị thay đổi.")?;
    temp.persist(path).map_err(|_| "Không thay thế được file đích. Kiểm tra quyền hoặc file đang mở.")?;
    Ok(())
}
#[cfg(test)] mod tests {
    #[test] fn atomic_file_replace_keeps_exact_utf8_bytes() {
        let temp = tempfile::tempdir().unwrap(); let path = temp.path().join("test.diagramai");
        super::atomic_write(&path,b"original").unwrap(); super::atomic_write(&path,"Tiếng Việt".as_bytes()).unwrap();
        assert_eq!(std::fs::read_to_string(path).unwrap(),"Tiếng Việt");
    }
}
