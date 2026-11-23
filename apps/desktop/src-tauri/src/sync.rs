use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize,Serialize};
use serde_json::Value;
use std::path::Path;
use crate::{storage::{self,Record,Prepared,Result,COLUMNS},vault};
fn error(_: impl std::fmt::Display)->String { "Không ghi được SQLite/outbox. Bản local chưa bị thay thế.".into() }
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Credential { device_id:String, project_id:String, token:String, scope:String }
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Commit { document_id:String, expected_version:Option<i64>, expected_generation:Option<i64>, records:Vec<Record>, link:Option<Value>, credential:Option<Credential> }
#[derive(Serialize)]
pub struct Read { record:Option<Record>,link:Option<Value> }
fn header(tx:&Transaction<'_>,id:&str)->Result<Option<Value>> {
    let raw:Option<String>=tx.query_row("SELECT state_json FROM sync_links WHERE document_id=?1",[id],|row|row.get(0)).optional().map_err(error)?;
    raw.map(|value|serde_json::from_str(&value).map_err(error)).transpose()
}
pub fn read(path:&Path,id:&str)->Result<Read> {
    let mut db=storage::open(path)?; let tx=db.transaction().map_err(error)?;
    let record=tx.query_row(&format!("SELECT {COLUMNS} FROM local_documents WHERE document_id=?1"),[id],storage::row).optional().map_err(error)?;
    let mut link=header(&tx,id)?;
    if let Some(ref mut value)=link {
        let pending=if let Some(id)=value["pendingId"].as_str() {
            let raw:String=tx.query_row("SELECT payload FROM sync_outbox WHERE operation_id=?1",[id],|row|row.get(0)).map_err(error)?;
            serde_json::from_str(&raw).map_err(error)?
        } else { Value::Null };
        value.as_object_mut().ok_or("Trạng thái sync bị lỗi.")?.remove("pendingId"); value["pending"]=pending;
    }
    tx.commit().map_err(error)?; Ok(Read { record,link })
}
pub(crate) fn clear_link(tx:&Transaction<'_>,id:&str)->Result<()> {
    if let Some(old)=header(tx,id)? {
        if let Some(pending)=old["pendingId"].as_str(){tx.execute("DELETE FROM sync_outbox WHERE operation_id=?1",[pending]).map_err(error)?;}
        if let Some(device)=old["deviceId"].as_str(){tx.execute("DELETE FROM device_credentials WHERE device_id=?1",[device]).map_err(error)?;}
    }
    tx.execute("DELETE FROM sync_links WHERE document_id=?1",[id]).map_err(error)?; Ok(())
}
pub fn commit(path:&Path,input:Commit)->Result<()> {
    if uuid::Uuid::parse_str(&input.document_id).is_err()||input.records.len()>3 {return Err("Giao dịch local không hợp lệ.".into());}
    for record in &input.records {
        storage::validate(&Prepared{document_id:record.document_id.clone(),title:record.title.clone(),payload:record.payload.clone(),hash:record.hash.clone(),operation_id:record.operation_id.clone(),node_count:record.node_count,edge_count:record.edge_count})?;
        let version=if record.document_id==input.document_id {input.expected_version.unwrap_or(0)+1} else {1};
        if record.version!=version {return Err("LOCAL_CONFLICT".into());}
    }
    if let Some(ref link)=input.link {
        if link["documentId"]!=input.document_id||link["generation"].as_i64()!=Some(input.expected_generation.unwrap_or(0)+1)||serde_json::to_vec(link).map_err(error)?.len()>6*1024*1024 {return Err("Trạng thái sync không hợp lệ.".into());}
        for field in ["projectId","deviceId","cloudDocumentId"] {if link[field].as_str().and_then(|id|uuid::Uuid::parse_str(id).ok()).is_none(){return Err("ID liên kết không hợp lệ.".into());}}
        if link["baseRevision"].as_i64().unwrap_or(0)<1{return Err("Revision cloud không hợp lệ.".into());}
    }
    if let Some(ref credential)=input.credential {
        let link=input.link.as_ref().ok_or("Thiếu liên kết cloud.")?;
        if link["deviceId"]!=credential.device_id||link["projectId"]!=credential.project_id||!matches!(credential.scope.as_str(),"owner"|"editor") {return Err("Quyền thiết bị không khớp.".into());}
        // If the SQL CAS later fails, an encrypted orphan may remain, never a
        // false durable link or a plaintext token. No existing credential is lost.
        vault::write(path,&credential.device_id,&credential.token)?;
    }
    let mut db=storage::open(path)?; let tx=db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(error)?;
    let version:Option<i64>=tx.query_row("SELECT version FROM local_documents WHERE document_id=?1",[&input.document_id],|row|row.get(0)).optional().map_err(error)?;
    let generation:Option<i64>=tx.query_row("SELECT generation FROM sync_links WHERE document_id=?1",[&input.document_id],|row|row.get(0)).optional().map_err(error)?;
    if version!=input.expected_version||generation!=input.expected_generation{return Err("LOCAL_CONFLICT".into());}
    if input.link.is_some()&&version.is_none()&&!input.records.iter().any(|record|record.document_id==input.document_id){return Err("Không liên kết cloud khi thiếu bản vẽ local.".into());}
    let old=header(&tx,&input.document_id)?;
    for record in &input.records {
        if record.document_id!=input.document_id&&tx.query_row("SELECT 1 FROM local_documents WHERE document_id=?1",[&record.document_id],|row|row.get::<_,i64>(0)).optional().map_err(error)?.is_some(){return Err("LOCAL_CONFLICT".into());}
        tx.execute("INSERT INTO local_documents VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(document_id) DO UPDATE SET title=excluded.title,payload=excluded.payload,hash=excluded.hash,operation_id=excluded.operation_id,node_count=excluded.node_count,edge_count=excluded.edge_count,version=excluded.version,saved_at=excluded.saved_at",params![record.document_id,record.title,record.payload,record.hash,record.operation_id,record.node_count,record.edge_count,record.version,record.saved_at]).map_err(error)?;
        tx.execute("INSERT INTO local_revisions VALUES (?1,?2,?3)",params![record.document_id,record.version,serde_json::to_string(record).map_err(error)?]).map_err(error)?;
        tx.execute("DELETE FROM local_revisions WHERE document_id=?1 AND version NOT IN (SELECT version FROM local_revisions WHERE document_id=?1 ORDER BY version DESC LIMIT 20)",[&record.document_id]).map_err(error)?;
    }
    let new_pending=input.link.as_ref().and_then(|link|link["pending"]["operationId"].as_str());
    if let Some(ref previous)=old {
        if let Some(id)=previous["pendingId"].as_str(){if Some(id)!=new_pending{tx.execute("DELETE FROM sync_outbox WHERE operation_id=?1",[id]).map_err(error)?;}}
        if let Some(id)=previous["deviceId"].as_str(){if input.link.as_ref().and_then(|link|link["deviceId"].as_str())!=Some(id){tx.execute("DELETE FROM device_credentials WHERE device_id=?1",[id]).map_err(error)?;}}
    }
    if let Some(mut link)=input.link {
        let pending=link.as_object_mut().ok_or("Trạng thái sync lỗi.")?.remove("pending").unwrap_or(Value::Null);
        link["pendingId"]=pending["operationId"].clone();
        if !pending.is_null(){
            let id=pending["operationId"].as_str().ok_or("Operation không hợp lệ.")?;
            if uuid::Uuid::parse_str(id).is_err(){return Err("Operation không hợp lệ.".into());}
            tx.execute("INSERT INTO sync_outbox VALUES (?1,?2) ON CONFLICT(operation_id) DO UPDATE SET payload=excluded.payload",params![id,serde_json::to_string(&pending).map_err(error)?]).map_err(error)?;
        }
        tx.execute("INSERT INTO sync_links VALUES (?1,?2,?3) ON CONFLICT(document_id) DO UPDATE SET generation=excluded.generation,state_json=excluded.state_json",params![input.document_id,link["generation"].as_i64(),serde_json::to_string(&link).map_err(error)?]).map_err(error)?;
    }else{tx.execute("DELETE FROM sync_links WHERE document_id=?1",[&input.document_id]).map_err(error)?;}
    if let Some(credential)=input.credential{tx.execute("INSERT INTO device_credentials VALUES (?1,?2) ON CONFLICT(device_id) DO UPDATE SET reference=excluded.reference",params![credential.device_id,format!("dpapi:{}",credential.device_id)]).map_err(error)?;}
    tx.commit().map_err(error)
}
pub fn credential(path:&Path,id:&str)->Result<Option<String>> {
    let reference:Option<String>=storage::open(path)?.query_row("SELECT reference FROM device_credentials WHERE device_id=?1",[id],|row|row.get(0)).optional().map_err(error)?;
    if reference.as_deref()!=Some(&format!("dpapi:{id}")){return Ok(None);}
    vault::read(path,id).map(Some)
}

#[cfg(test)] mod tests {
    use super::*;
    use serde_json::json;
    use sha2::{Digest,Sha256};
    fn record(id:&str,title:&str,version:i64)->Record {
        let payload=json!({"format":"diagramai","formatVersion":1,"documentId":id,"title":title,"nodes":[],"edges":[],"groups":[],"metadata":{"createdAt":"2026-11-23T00:00:00.000Z","updatedAt":"2026-11-23T00:00:00.000Z"}}).to_string();
        Record{document_id:id.into(),title:title.into(),hash:format!("{:x}",Sha256::digest(payload.as_bytes())),payload,operation_id:uuid::Uuid::new_v4().to_string(),node_count:0,edge_count:0,version,saved_at:1}
    }
    #[test] fn sqlite_outbox_generation_and_record_cas_are_atomic() {
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("local.sqlite");let id=uuid::Uuid::new_v4().to_string();
        let first=record(&id,"P4 sang P5",1);
        let link=json!({"documentId":id,"cloudDocumentId":id,"projectId":uuid::Uuid::new_v4().to_string(),"baseRevision":1,"syncedHash":first.hash,"generation":1,"deviceId":uuid::Uuid::new_v4().to_string(),"pending":null,"conflict":null});
        commit(&path,Commit{document_id:id.clone(),expected_version:None,expected_generation:None,records:vec![first],link:Some(link.clone()),credential:None}).unwrap();
        assert_eq!(read(&path,&id).unwrap().link.unwrap()["generation"],1);
        assert_eq!(commit(&path,Commit{document_id:id.clone(),expected_version:None,expected_generation:None,records:vec![],link:Some(link),credential:None}).unwrap_err(),"LOCAL_CONFLICT");
        let second=record(&id,"Sua offline",2);let mut next=read(&path,&id).unwrap().link.unwrap();let operation=uuid::Uuid::new_v4().to_string();
        next["generation"]=json!(2);next["pending"]=json!({"operationId":operation,"baseRevision":1,"document":serde_json::from_str::<Value>(&second.payload).unwrap(),"hash":second.hash,"localVersion":2});
        commit(&path,Commit{document_id:id.clone(),expected_version:Some(1),expected_generation:Some(1),records:vec![second.clone()],link:Some(next.clone()),credential:None}).unwrap();
        let reopened=read(&path,&id).unwrap();assert_eq!(reopened.record.unwrap().payload,second.payload);assert_eq!(reopened.link.unwrap()["pending"]["operationId"],operation);
        next["generation"]=json!(3);next["baseRevision"]=json!(2);next["pending"]=Value::Null;
        commit(&path,Commit{document_id:id.clone(),expected_version:Some(2),expected_generation:Some(2),records:vec![],link:Some(next),credential:None}).unwrap();
        assert_eq!(storage::open(&path).unwrap().query_row("SELECT count(*) FROM sync_outbox",[],|row|row.get::<_,i64>(0)).unwrap(),0);
        let mut db=storage::open(&path).unwrap();let tx=db.transaction().unwrap();clear_link(&tx,&id).unwrap();tx.commit().unwrap();
        assert!(read(&path,&id).unwrap().link.is_none());assert!(storage::load(&path,&id).unwrap().is_some());
    }
    #[test] fn concurrent_local_startup_and_cloud_reads_do_not_race_wal_schema_creation() {
        let temp=tempfile::tempdir().unwrap();let path=temp.path().join("new-profile.sqlite");
        std::thread::scope(|scope| {
            let handles:Vec<_>=(0..8).map(|_|{let path=&path;scope.spawn(move||{
                let id=uuid::Uuid::new_v4().to_string();let first=record(&id,"P5 concurrent startup fixture",1);
                storage::list(path).unwrap();read(path,&id).unwrap();
                commit(path,Commit{document_id:id,expected_version:None,expected_generation:None,records:vec![first],link:None,credential:None}).unwrap();
            })}).collect();
            for handle in handles {handle.join().unwrap();}
        });
        assert_eq!(storage::list(&path).unwrap().len(),8);
    }
}
