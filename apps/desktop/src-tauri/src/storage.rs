use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, path::{Path,PathBuf}, sync::{Mutex,OnceLock}, time::{Duration, SystemTime, UNIX_EPOCH}};

pub type Result<T> = std::result::Result<T, String>;
const LIMIT: usize = 2 * 1024 * 1024;
fn error(_: impl std::fmt::Display) -> String { "Không truy cập được SQLite local (quyền, dung lượng hoặc file lỗi).".into() }
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Prepared {
    pub document_id: String, pub title: String, pub payload: String, pub hash: String,
    pub operation_id: String, pub node_count: i64, pub edge_count: i64,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub document_id: String, pub title: String, pub payload: String, pub hash: String,
    pub operation_id: String, pub node_count: i64, pub edge_count: i64, pub version: i64, pub saved_at: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary { document_id: String, title: String, version: i64, saved_at: i64, node_count: i64, edge_count: i64 }
pub(crate) fn open(path: &Path) -> Result<Connection> {
    // Local initialization and the cloud-link reader can start at the same time.
    // Serialize the initial WAL/schema setup instead of racing DDL on every IPC.
    static INITIALIZED:OnceLock<Mutex<HashSet<PathBuf>>>=OnceLock::new();
    let mut initialized=INITIALIZED.get_or_init(||Mutex::new(HashSet::new())).lock().map_err(error)?;
    let exists=path.exists();
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(error)?; }
    let db = Connection::open(path).map_err(error)?;
    db.busy_timeout(Duration::from_secs(5)).map_err(error)?;
    db.execute_batch("PRAGMA synchronous=FULL;").map_err(error)?;
    if !exists||!initialized.contains(path) {
    db.execute_batch("PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS local_documents (
        document_id TEXT PRIMARY KEY, title TEXT NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL,
        operation_id TEXT NOT NULL, node_count INTEGER NOT NULL, edge_count INTEGER NOT NULL,
        version INTEGER NOT NULL, saved_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS local_revisions (
        document_id TEXT NOT NULL, version INTEGER NOT NULL, record TEXT NOT NULL,
        PRIMARY KEY(document_id, version));
      CREATE TABLE IF NOT EXISTS local_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_outbox (operation_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_links (document_id TEXT PRIMARY KEY, generation INTEGER NOT NULL, state_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS device_credentials (device_id TEXT PRIMARY KEY, reference TEXT NOT NULL);").map_err(error)?;
    initialized.insert(path.to_path_buf());
    }
    Ok(db)
}
pub(crate) fn row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Record> {
    Ok(Record { document_id: row.get(0)?, title: row.get(1)?, payload: row.get(2)?, hash: row.get(3)?, operation_id: row.get(4)?, node_count: row.get(5)?, edge_count: row.get(6)?, version: row.get(7)?, saved_at: row.get(8)? })
}
pub(crate) const COLUMNS: &str = "document_id,title,payload,hash,operation_id,node_count,edge_count,version,saved_at";
pub fn load(path: &Path, id: &str) -> Result<Option<Record>> {
    open(path)?.query_row(&format!("SELECT {COLUMNS} FROM local_documents WHERE document_id=?1"), [id], row).optional().map_err(error)
}
pub fn list(path: &Path) -> Result<Vec<Summary>> {
    let db = open(path)?;
    let mut query = db.prepare("SELECT document_id,title,version,saved_at,node_count,edge_count FROM local_documents ORDER BY saved_at DESC,document_id").map_err(error)?;
    let rows = query.query_map([], |row| Ok(Summary { document_id: row.get(0)?, title: row.get(1)?, version: row.get(2)?, saved_at: row.get(3)?, node_count: row.get(4)?, edge_count: row.get(5)? })).map_err(error)?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(error)
}
pub(crate) fn validate(record: &Prepared) -> Result<()> {
    if record.payload.len() > LIMIT || uuid::Uuid::parse_str(&record.document_id).is_err() || uuid::Uuid::parse_str(&record.operation_id).is_err() { return Err("Dữ liệu local không hợp lệ hoặc vượt 2 MB.".into()); }
    let json: serde_json::Value = serde_json::from_str(&record.payload).map_err(error)?;
    if json["format"] != "diagramai" || json["formatVersion"] != 1 || json["documentId"] != record.document_id || json["title"] != record.title
        || record.title.trim().is_empty() || record.title.chars().count() > 100
        || json["nodes"].as_array().map(|nodes| nodes.len() as i64) != Some(record.node_count) || !(0..=500).contains(&record.node_count)
        || json["edges"].as_array().map(|edges| edges.len() as i64) != Some(record.edge_count) || !(0..=1000).contains(&record.edge_count)
        || format!("{:x}", Sha256::digest(record.payload.as_bytes())) != record.hash { return Err("Dữ liệu local hoặc checksum không hợp lệ.".into()); }
    Ok(())
}
pub fn save(path: &Path, input: Prepared, expected: Option<i64>) -> Result<Record> {
    validate(&input)?;
    let mut db = open(path)?;
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(error)?;
    let previous = tx.query_row(&format!("SELECT {COLUMNS} FROM local_documents WHERE document_id=?1"), [&input.document_id], row).optional().map_err(error)?;
    if let Some(ref old) = previous { if old.operation_id == input.operation_id && old.hash == input.hash { return Ok(old.clone()); } }
    if previous.as_ref().map(|record| record.version) != expected { return Err("LOCAL_CONFLICT".into()); }
    let result = Record { document_id: input.document_id, title: input.title, payload: input.payload, hash: input.hash, operation_id: input.operation_id, node_count: input.node_count, edge_count: input.edge_count,
        version: previous.map_or(1, |record| record.version + 1), saved_at: SystemTime::now().duration_since(UNIX_EPOCH).map_err(error)?.as_millis() as i64 };
    tx.execute("INSERT INTO local_documents VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(document_id) DO UPDATE SET title=excluded.title,payload=excluded.payload,hash=excluded.hash,operation_id=excluded.operation_id,node_count=excluded.node_count,edge_count=excluded.edge_count,version=excluded.version,saved_at=excluded.saved_at",
        params![result.document_id,result.title,result.payload,result.hash,result.operation_id,result.node_count,result.edge_count,result.version,result.saved_at]).map_err(error)?;
    tx.execute("INSERT INTO local_revisions VALUES (?1,?2,?3)", params![result.document_id,result.version,serde_json::to_string(&result).map_err(error)?]).map_err(error)?;
    tx.execute("DELETE FROM local_revisions WHERE document_id=?1 AND version NOT IN (SELECT version FROM local_revisions WHERE document_id=?1 ORDER BY version DESC LIMIT 20)", [&result.document_id]).map_err(error)?;
    tx.commit().map_err(error)?; Ok(result)
}
pub fn remove(path: &Path, id: &str, expected: i64) -> Result<()> {
    let mut db = open(path)?; let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(error)?;
    if tx.execute("DELETE FROM local_documents WHERE document_id=?1 AND version=?2", params![id,expected]).map_err(error)? != 1 { return Err("LOCAL_CONFLICT".into()); }
    tx.execute("DELETE FROM local_revisions WHERE document_id=?1", [id]).map_err(error)?;
    crate::sync::clear_link(&tx,id)?;
    tx.commit().map_err(error)
}
pub fn revisions(path: &Path, id: &str) -> Result<Vec<Record>> {
    let db = open(path)?; let mut query = db.prepare("SELECT record FROM local_revisions WHERE document_id=?1 ORDER BY version DESC").map_err(error)?;
    let rows = query.query_map([id], |row| row.get::<_, String>(0)).map_err(error)?;
    rows.map(|value| serde_json::from_str(&value.map_err(error)?).map_err(error)).collect()
}
pub fn active(path: &Path) -> Result<Option<String>> { open(path)?.query_row("SELECT value FROM local_settings WHERE key='active'", [], |row| row.get(0)).optional().map_err(error) }
pub fn set_active(path: &Path, id: &str) -> Result<()> { open(path)?.execute("INSERT INTO local_settings VALUES ('active',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [id]).map(|_| ()).map_err(error) }

#[cfg(test)]
mod tests {
    use super::*;
    fn input(id: &str, title: &str) -> Prepared {
        let payload = serde_json::json!({"format":"diagramai","formatVersion":1,"documentId":id,"title":title,"nodes":[],"edges":[],"groups":[]}).to_string();
        Prepared { document_id: id.into(), title: title.into(), hash: format!("{:x}", Sha256::digest(payload.as_bytes())), payload, operation_id: uuid::Uuid::new_v4().to_string(), node_count: 0, edge_count: 0 }
    }
    #[test] fn sqlite_atomic_cas_history_restart_and_delete() {
        let temp = tempfile::tempdir().unwrap(); let path = temp.path().join("local.sqlite"); let id = uuid::Uuid::new_v4().to_string();
        let first = input(&id,"Tiếng Việt"); assert_eq!(save(&path,first.clone(),None).unwrap().version,1);
        assert_eq!(save(&path,first,None).unwrap().version,1);
        assert_eq!(save(&path,input(&id,"stale"),None).unwrap_err(),"LOCAL_CONFLICT");
        for version in 1..23 { assert_eq!(save(&path,input(&id,&format!("Sơ đồ {version}")),Some(version)).unwrap().version,version+1); }
        assert_eq!(revisions(&path,&id).unwrap().len(),20); assert_eq!(load(&path,&id).unwrap().unwrap().version,23);
        assert_eq!(remove(&path,&id,1).unwrap_err(),"LOCAL_CONFLICT"); assert!(load(&path,&id).unwrap().is_some());
        set_active(&path,&id).unwrap(); assert_eq!(active(&path).unwrap(),Some(id.clone()));
        remove(&path,&id,23).unwrap(); assert!(load(&path,&id).unwrap().is_none()); assert!(revisions(&path,&id).unwrap().is_empty());
    }
    #[test] fn bad_checksum_and_oversized_input_cannot_replace_data() {
        let temp = tempfile::tempdir().unwrap(); let path = temp.path().join("local.sqlite"); let id = uuid::Uuid::new_v4().to_string();
        save(&path,input(&id,"Safe"),None).unwrap(); let mut bad = input(&id,"Bad"); bad.hash = "0".repeat(64);
        assert!(save(&path,bad,Some(1)).is_err()); assert_eq!(load(&path,&id).unwrap().unwrap().title,"Safe");
    }
}
