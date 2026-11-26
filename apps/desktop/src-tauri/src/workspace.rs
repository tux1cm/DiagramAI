use std::path::Path;
use rusqlite::{params,OptionalExtension};
use serde::Deserialize;
use serde_json::Value;
use crate::{storage::{self,Result},vault};
fn error(_:impl std::fmt::Display)->String {"Không ghi được kho chung local; dữ liệu cũ được giữ.".into()}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Commit {expected_generation:Option<i64>,state:Value,key:Option<String>,switch_from_id:Option<String>}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShareAccess {id:String,key:String}
pub fn save_share(path:&Path,input:ShareAccess)->Result<()> {
    if uuid::Uuid::parse_str(&input.id).is_err()||!input.key.starts_with("dai_share_v1_"){return Err("Link chia sẻ không hợp lệ.".into());}
    save_credential(path,&input.id,&input.key)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShortCredential {id:String,code:String}
pub fn save_short(path:&Path,input:ShortCredential)->Result<()> {
    if input.code.len()!=22||!input.code.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-')||!matches!(input.code.as_bytes().last(),Some(b'A'|b'Q'|b'g'|b'w')){return Err("Link ngắn không hợp lệ.".into());}
    save_credential(path,&input.id,&format!("dai_link_v1_{}",input.code))
}
fn save_credential(path:&Path,id:&str,key:&str)->Result<()> {
    if uuid::Uuid::parse_str(id).is_err(){return Err("ID quyền không hợp lệ.".into());}
    let mut db=storage::open(path)?;let tx=db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(error)?;
    if crate::sync::credential(path,id)?.is_some_and(|old|old!=key){return Err("Không thay quyền đã lưu bằng link khác.".into());}
    vault::write(path,id,key)?;
    tx.execute("INSERT INTO device_credentials VALUES (?1,?2) ON CONFLICT(device_id) DO UPDATE SET reference=excluded.reference",params![id,format!("dpapi:{id}")]).map_err(error)?;
    tx.commit().map_err(error)
}
fn check_hash(hash:&str)->Result<()> {if hash.len()!=64||!hash.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)){return Err("Cache link không hợp lệ.".into());}Ok(())}
pub fn read_short(path:&Path,hash:&str)->Result<Option<Value>> {
    check_hash(hash)?;
    let raw:Option<String>=storage::open(path)?.query_row("SELECT value FROM local_settings WHERE key=?1",[format!("short-link:{hash}")],|row|row.get(0)).optional().map_err(error)?;
    raw.map(|value|serde_json::from_str(&value).map_err(error)).transpose()
}
pub fn write_short(path:&Path,hash:&str,binding:Value)->Result<()> {
    check_hash(hash)?;
    let id=binding["id"].as_str().ok_or("Thiếu ID link.")?;let access=binding["accessId"].as_str().ok_or("Thiếu ID scope.")?;
    if binding.as_object().map_or(true,|obj|obj.len()!=3)||uuid::Uuid::parse_str(id).is_err()||uuid::Uuid::parse_str(access).is_err()||!matches!(binding["kind"].as_str(),Some("workspace"|"share")){return Err("Cache link không hợp lệ.".into());}
    if !crate::sync::credential(path,id)?.is_some_and(|value|value.starts_with("dai_link_v1_")){return Err("Chưa lưu quyền link ngắn.".into());}
    storage::open(path)?.execute("INSERT INTO local_settings VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("short-link:{hash}"),serde_json::to_string(&binding).map_err(error)?]).map_err(error)?;Ok(())
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
pub fn archives(path:&Path)->Result<Vec<Value>> {
    let db=storage::open(path)?;let mut stmt=db.prepare("SELECT value FROM local_settings WHERE key LIKE 'workspace-archive:%'").map_err(error)?;
    let rows=stmt.query_map([],|row|row.get::<_,String>(0)).map_err(error)?;
    rows.map(|row|serde_json::from_str(&row.map_err(error)?).map_err(error)).collect()
}
pub fn write(path:&Path,input:Commit)->Result<()> {
    let id=input.state["id"].as_str().ok_or("Thiếu ID kho.")?;
    if uuid::Uuid::parse_str(id).is_err()||input.state["generation"].as_i64()!=Some(input.expected_generation.unwrap_or(0)+1){return Err("LOCAL_CONFLICT".into());}
    let raw=serde_json::to_string(&input.state).map_err(error)?;
    if raw.len()>1024*1024{return Err("Kho local quá lớn.".into());}
    if let Some(ref key)=input.key {if !key.starts_with("dai_workspace_v1_"){return Err("Khóa kho không hợp lệ.".into());}}
    if let Some(ref from)=input.switch_from_id {if uuid::Uuid::parse_str(from).is_err()||from==id||input.key.is_none()||input.expected_generation.is_none(){return Err("LOCAL_CONFLICT".into());}}
    let mut db=storage::open(path)?;let tx=db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(error)?;
    let old:Option<String>=tx.query_row("SELECT value FROM local_settings WHERE key='workspace-v1'",[],|row|row.get(0)).optional().map_err(error)?;
    let previous:Option<Value>=old.map(|raw|serde_json::from_str(&raw).map_err(error)).transpose()?;
    if previous.as_ref().and_then(|value|value["generation"].as_i64())!=input.expected_generation||previous.as_ref().is_some_and(|value|value["id"]!=input.switch_from_id.as_deref().unwrap_or(id)){return Err("LOCAL_CONFLICT".into());}
    if previous.is_none()&&input.key.is_none(){return Err("Thiếu quyền vào kho.".into());}
    if let Some(ref key)=input.key {
        // Same workspace key is immutable: no credential overwrite before CAS.
        let stored=crate::sync::credential(path,id)?;
        if stored.as_ref().is_some_and(|old|old!=key)||(previous.is_some()&&input.switch_from_id.is_none()&&stored.as_deref()!=Some(key)){return Err("Quyền kho không khớp.".into());}
        vault::write(path,id,key)?;
        tx.execute("INSERT INTO device_credentials VALUES (?1,?2) ON CONFLICT(device_id) DO UPDATE SET reference=excluded.reference",params![id,format!("dpapi:{id}")]).map_err(error)?;
    }
    if let Some(ref from)=input.switch_from_id {
        let previous=previous.as_ref().ok_or("LOCAL_CONFLICT")?;
        tx.execute("INSERT INTO local_settings VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("workspace-archive:{from}"),serde_json::to_string(previous).map_err(error)?]).map_err(error)?;
        tx.execute("DELETE FROM local_settings WHERE key=?1",[format!("workspace-archive:{id}")]).map_err(error)?;
    }
    tx.execute("INSERT INTO local_settings VALUES ('workspace-v1',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[raw]).map_err(error)?;
    tx.commit().map_err(error)
}
#[cfg(all(test,windows))]mod tests {
    #[test]fn short_code_is_dpapi_only_and_cache_contains_no_secret(){
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("short.sqlite");let id=uuid::Uuid::new_v4().to_string();let code=format!("{}A","a".repeat(21));let hash="f".repeat(64);
        super::save_short(&path,super::ShortCredential{id:id.clone(),code:code.clone()}).unwrap();
        let binding=serde_json::json!({"id":id,"kind":"share","accessId":uuid::Uuid::new_v4().to_string()});
        super::write_short(&path,&hash,binding.clone()).unwrap();assert_eq!(super::read_short(&path,&hash).unwrap().unwrap(),binding);
        assert_eq!(crate::sync::credential(&path,&id).unwrap().unwrap(),format!("dai_link_v1_{code}"));
        assert!(!std::fs::read(&path).unwrap().windows(code.len()).any(|bytes|bytes==code.as_bytes()));
        assert!(super::save_short(&path,super::ShortCredential{id:id.clone(),code:format!("{}Q","b".repeat(21))}).is_err());
        assert_eq!(crate::sync::credential(&path,&id).unwrap().unwrap(),format!("dai_link_v1_{code}"));
    }
    #[test]fn explicit_switch_archives_old_catalog_and_keys_and_rejects_stale_switch(){
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("switch.sqlite");
        let old_id=uuid::Uuid::new_v4().to_string();let new_id=uuid::Uuid::new_v4().to_string();
        let old_key=format!("dai_workspace_v1_{}","a".repeat(43));let new_key=format!("dai_workspace_v1_{}","b".repeat(43));
        let old=serde_json::json!({"id":old_id,"generation":1,"pending":"kept"});let new=serde_json::json!({"id":new_id,"generation":2});
        super::write(&path,super::Commit{expected_generation:None,state:old.clone(),key:Some(old_key.clone()),switch_from_id:None}).unwrap();
        assert!(super::write(&path,super::Commit{expected_generation:Some(1),state:new.clone(),key:Some(new_key.clone()),switch_from_id:None}).is_err());
        assert!(super::archives(&path).unwrap().is_empty());
        super::write(&path,super::Commit{expected_generation:Some(1),state:new.clone(),key:Some(new_key.clone()),switch_from_id:Some(old_id.clone())}).unwrap();
        assert_eq!(super::archives(&path).unwrap(),vec![old]);assert_eq!(super::read(&path).unwrap().unwrap(),new);
        assert_eq!(crate::sync::credential(&path,&old_id).unwrap().unwrap(),old_key);
        assert_eq!(crate::sync::credential(&path,&new_id).unwrap().unwrap(),new_key);
        assert!(super::write(&path,super::Commit{expected_generation:Some(1),state:new.clone(),key:Some(new_key),switch_from_id:Some(old_id)}).is_err());
        assert_eq!(super::read(&path).unwrap().unwrap(),new);
    }
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
        super::write(&path,super::Commit{expected_generation:None,state:state.clone(),key:Some(key.clone()),switch_from_id:None}).unwrap();
        assert_eq!(crate::sync::credential(&path,&id).unwrap().unwrap(),key);
        assert!(!std::fs::read(&path).unwrap().windows(key.len()).any(|bytes|bytes==key.as_bytes()));
        assert_eq!(super::write(&path,super::Commit{expected_generation:None,state:state.clone(),key:None,switch_from_id:None}).unwrap_err(),"LOCAL_CONFLICT");
        assert_eq!(super::read(&path).unwrap().unwrap(),state);
    }
}
