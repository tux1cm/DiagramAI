use std::{io::Write, path::{Path, PathBuf}};
use crate::storage::Result;

fn path(database: &Path, id: &str) -> Result<PathBuf> {
    if uuid::Uuid::parse_str(id).is_err() { return Err("ID thiết bị không hợp lệ.".into()); }
    Ok(database.parent().ok_or("Không có thư mục ứng dụng.")?.join("device-credentials").join(format!("{id}.dpapi")))
}
#[cfg(windows)]
fn crypt(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::{CryptProtectData,CryptUnprotectData,CRYPT_INTEGER_BLOB,CRYPTPROTECT_UI_FORBIDDEN}};
    let input = CRYPT_INTEGER_BLOB { cbData: bytes.len() as u32, pbData: bytes.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    // Per-Windows-user DPAPI; never CRYPTPROTECT_LOCAL_MACHINE. Plain tokens are
    // not written to SQLite or files, including isolated native test profiles.
    let success = unsafe {
        if encrypt { CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null(),std::ptr::null(),CRYPTPROTECT_UI_FORBIDDEN,&mut output) }
        else { CryptUnprotectData(&input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null(),std::ptr::null(),CRYPTPROTECT_UI_FORBIDDEN,&mut output) }
    };
    if success == 0 { return Err("Không truy cập được kho quyền Windows. Bản vẽ local vẫn được giữ.".into()); }
    let result = unsafe { std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData as *mut core::ffi::c_void); }
    Ok(result)
}
#[cfg(not(windows))]
fn crypt(_: &[u8], _: bool) -> Result<Vec<u8>> { Err("Kho quyền thiết bị chưa hỗ trợ nền tảng này; không lưu token dạng plain text.".into()) }

pub fn write(database: &Path, id: &str, token: &str) -> Result<()> {
    let suffix=token.strip_prefix("dai_device_v1_").or_else(||token.strip_prefix("dai_workspace_v1_")).or_else(||token.strip_prefix("dai_share_v1_"));
    let short=token.strip_prefix("dai_link_v1_");
    let alphabet=|value:&str|value.bytes().all(|byte|byte.is_ascii_alphanumeric()||byte==b'_'||byte==b'-');
    if !suffix.is_some_and(|value|value.len()==43&&alphabet(value))&&!short.is_some_and(|value|value.len()==22&&alphabet(value)&&matches!(value.as_bytes().last(),Some(b'A'|b'Q'|b'g'|b'w'))) { return Err("Token thiết bị/kho không hợp lệ.".into()); }
    let path = path(database,id)?; let parent = path.parent().ok_or("Không có thư mục quyền.")?;
    std::fs::create_dir_all(parent).map_err(|_| "Không tạo được kho quyền Windows.")?;
    let encrypted = crypt(token.as_bytes(),true)?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|_| "Không tạo được file quyền tạm.")?;
    temp.write_all(&encrypted).and_then(|_| temp.as_file().sync_all()).map_err(|_| "Không ghi được quyền thiết bị.")?;
    temp.persist(path).map_err(|_| "Không thay được file quyền thiết bị.")?;
    Ok(())
}
pub fn read(database: &Path, id: &str) -> Result<String> {
    let path = path(database,id)?;
    if std::fs::metadata(&path).map_err(|_| "Không đọc được quyền thiết bị.")?.len()>16384 { return Err("File quyền thiết bị không hợp lệ.".into()); }
    let encrypted = std::fs::read(path).map_err(|_| "Không đọc được quyền thiết bị.")?;
    String::from_utf8(crypt(&encrypted,false)?).map_err(|_| "Quyền thiết bị bị lỗi.".into())
}
#[cfg(all(test,windows))]
mod tests {
    #[test] fn token_is_dpapi_protected_not_plaintext_and_reopens_for_same_user() {
        let dir=tempfile::tempdir().unwrap(); let database=dir.path().join("local.sqlite"); let id=uuid::Uuid::new_v4().to_string();
        let token=format!("dai_device_v1_{}","a".repeat(43)); super::write(&database,&id,&token).unwrap();
        let encrypted=std::fs::read(super::path(&database,&id).unwrap()).unwrap();
        assert!(!encrypted.windows(token.len()).any(|part| part==token.as_bytes()));
        assert_eq!(super::read(&database,&id).unwrap(),token);
    }
}
