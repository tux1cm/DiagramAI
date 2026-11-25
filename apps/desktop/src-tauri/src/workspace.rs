use std::path::Path;
use rusqlite::{params,OptionalExtension};
use serde::Deserialize;
use serde_json::Value;
use crate::{storage::{self,Result},vault};
fn error(_:impl std::fmt::Display)->String {"Không ghi được kho chung local; dữ liệu cũ được giữ.".into()}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Commit {expected_generation:Option<i64>,state:Value,key:Option<String>}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShareAccess {id:String,key:String}
pub fn save_share(path:&Path,input:ShareAccess)->Result<()> {
    if uuid::Uuid::parse_str(&input.id).is_err()||!input.key.starts_with("dai_share_v1_"){return Err("Link chia sẻ không hợp lệ.".into());}
    let mut db=storage::open(path)?;let tx=db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(error)?;
    if crate::sync::credential(path,&input.id)?.is_some_and(|key|key!=input.key){return Err("Không thay quyền đã lưu bằng link khác.".into());}
    vault::write(path,&input.id,&input.key)?;
    tx.execute("INSERT INTO device_credentials VALUES (?1,?2) ON CONFLICT(device_id) DO UPDATE SET reference=excluded.reference",params![input.id,format!("dpapi:{}",input.id)]).map_err(error)?;
    tx.commit().map_err(error)
}
pub fn read_share_catalog(path:&Path,id:&str)->Result<Option<Value>> {
    if uuid::Uuid::parse_str(id).is_err(){return Err("ID chia sẻ không hợp lệ.".into());}
    let raw:Option<String>=storage::open(path)?.query_row("SELECT value FROM local_settings WHERE key=?1",[format!("share-catalog:{id}")],|row|row.get(0)).optional().map_err(error)?;
    raw.map(|value|serde_json::from_str(&value).map_err(error)).transpose()
}
pub fn write_share_catalog(path:&Path,catalog:Value)->Result<()> {
    let id=catalog["id"].as_str().ok_or("Thiếu ID chia sẻ.")?;let raw=serde_json::to_string(&catalog).map_err(error)?;
    if uuid::Uuid::parse_str(id).is_err()||raw.len()>128*1024||!matches!(catalog["kind"].as_str(),Some("project"|"drawing")){return Err("Danh sách chia sẻ không hợp lệ.".into());}
    storage::open(path)?.execute("INSERT INTO local_settings VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("share-catalog:{id}"),raw]).map_err(error)?;Ok(())
}
pub fn read_share_context(path:&Path)->Result<Option<String>> {storage::open(path)?.query_row("SELECT value FROM local_settings WHERE key='active-share'",[],|row|row.get(0)).optional().map_err(error)}
pub fn write_share_context(path:&Path,id:Option<String>)->Result<()> {
    let db=storage::open(path)?;
    if let Some(id)=id {if uuid::Uuid::parse_str(&id).is_err(){return Err("ID chia sẻ không hợp lệ.".into());}db.execute("INSERT INTO local_settings VALUES ('active-share',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[id]).map_err(error)?;}
    else {db.execute("DELETE FROM local_settings WHERE key='active-share'",[]).map_err(error)?;}Ok(())
}
pub fn read(path:&Path)->Result<Option<Value>> {
    let value:Option<String>=storage::open(path)?.query_row("SELECT value FROM local_settings WHERE key='workspace-v1'",[],|row|row.get(0)).optional().map_err(error)?;
    value.map(|raw|serde_json::from_str(&raw).map_err(error)).transpose()
}
pub fn write(path:&Path,input:Commit)->Result<()> {
    let id=input.state["id"].as_str().ok_or("Thiếu ID kho.")?;
    if uuid::Uuid::parse_str(id).is_err()||input.state["generation"].as_i64()!=Some(input.expected_generation.unwrap_or(0)+1){return Err("LOCAL_CONFLICT".into());}
    let raw=serde_json::to_string(&input.state).map_err(error)?;
    if raw.len()>1024*1024{return Err("Kho local quá lớn.".into());}
    if let Some(ref key)=input.key {if !key.starts_with("dai_workspace_v1_"){return Err("Khóa kho không hợp lệ.".into());}}
    let mut db=storage::open(path)?;let tx=db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(error)?;
    let old:Option<String>=tx.query_row("SELECT value FROM local_settings WHERE key='workspace-v1'",[],|row|row.get(0)).optional().map_err(error)?;
    let previous:Option<Value>=old.map(|raw|serde_json::from_str(&raw).map_err(error)).transpose()?;
    if previous.as_ref().and_then(|value|value["generation"].as_i64())!=input.expected_generation||previous.as_ref().is_some_and(|value|value["id"]!=id){return Err("LOCAL_CONFLICT".into());}
    if previous.is_none()&&input.key.is_none(){return Err("Thiếu quyền vào kho.".into());}
    if let Some(ref key)=input.key {
        // Same workspace key is immutable: no credential overwrite before CAS.
        if previous.is_some()&&crate::sync::credential(path,id)?.as_deref()!=Some(key){return Err("Quyền kho không khớp.".into());}
        vault::write(path,id,key)?;
        tx.execute("INSERT INTO device_credentials VALUES (?1,?2) ON CONFLICT(device_id) DO UPDATE SET reference=excluded.reference",params![id,format!("dpapi:{id}")]).map_err(error)?;
    }
    tx.execute("INSERT INTO local_settings VALUES ('workspace-v1',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[raw]).map_err(error)?;
    tx.commit().map_err(error)
}
#[cfg(all(test,windows))]mod tests {
    #[test]fn share_key_is_dpapi_only_and_does_not_replace_an_existing_credential(){
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("shared.sqlite");let id=uuid::Uuid::new_v4().to_string();let key=format!("dai_share_v1_{}","a".repeat(43));
        super::save_share(&path,super::ShareAccess{id:id.clone(),key:key.clone()}).unwrap();
        assert_eq!(crate::sync::credential(&path,&id).unwrap().unwrap(),key);
        assert!(super::save_share(&path,super::ShareAccess{id:id.clone(),key:format!("dai_share_v1_{}","b".repeat(43))}).is_err());
        assert_eq!(crate::sync::credential(&path,&id).unwrap().unwrap(),key);
        assert!(!std::fs::read(&path).unwrap().windows(key.len()).any(|bytes|bytes==key.as_bytes()));
    }
    #[test]fn workspace_key_is_dpapi_only_and_generation_cas_preserves_header(){
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("workspace.sqlite");let id=uuid::Uuid::new_v4().to_string();let key=format!("dai_workspace_v1_{}","a".repeat(43));
        let state=serde_json::json!({"id":id,"generation":1});
        super::write(&path,super::Commit{expected_generation:None,state:state.clone(),key:Some(key.clone())}).unwrap();
        assert_eq!(crate::sync::credential(&path,&id).unwrap().unwrap(),key);
        assert!(!std::fs::read(&path).unwrap().windows(key.len()).any(|bytes|bytes==key.as_bytes()));
        assert_eq!(super::write(&path,super::Commit{expected_generation:None,state:state.clone(),key:None}).unwrap_err(),"LOCAL_CONFLICT");
        assert_eq!(super::read(&path).unwrap().unwrap(),state);
    }
}
