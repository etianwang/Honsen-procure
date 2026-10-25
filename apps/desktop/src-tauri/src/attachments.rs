use super::*;
use std::io::Write;
#[path = "heic_limits.rs"]
mod heic_limits;

const MAX_FILE: usize = 100 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttachmentInput {
    pub id: Uuid,
    pub order_id: Uuid,
    pub owner_type: String,
    pub owner_id: Uuid,
    pub original_name: String,
    pub content_type: String,
    pub data_base64: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Metadata {
    id: Uuid,
    order_id: Uuid,
    owner_type: String,
    owner_id: Uuid,
    original_name: String,
    content_type: String,
    byte_length: usize,
    checksum: String,
    project_id: Uuid,
    country_id: Uuid,
    object_key: String,
    version_id: Option<String>,
    status: String,
    uploaded_by: Uuid,
    created_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source_attachment_id: Option<Uuid>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentView {
    pub id: Uuid,
    pub owner_type: String,
    pub owner_id: Uuid,
    pub original_name: String,
    pub content_type: String,
    pub byte_length: i64,
    pub upload_state: String,
    pub available_locally: bool,
    pub retry_count: i64,
    pub last_error: Option<String>,
    pub source_attachment_id: Option<Uuid>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentTarget {
    pub owner_type: String,
    pub owner_id: Uuid,
    pub description: String,
}

fn valid_type(name: &str, mime: &str) -> bool {
    if !valid_required_text(name, 255)
        || name
            .chars()
            .any(|c| c.is_control() || c == '/' || c == '\\')
    {
        return false;
    }
    let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    matches!(
        (extension.as_str(), mime),
        ("pdf", "application/pdf")
            | ("doc", "application/msword")
            | (
                "docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
            | ("xls", "application/vnd.ms-excel")
            | (
                "xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            | ("jpg" | "jpeg", "image/jpeg")
            | ("png", "image/png")
            | ("heic", "image/heic" | "image/heif")
            | (
                "dwg",
                "image/vnd.dwg" | "application/acad" | "application/octet-stream"
            )
            | ("zip", "application/zip" | "application/x-zip-compressed")
    )
}

fn valid_signature(bytes: &[u8], mime: &str) -> bool {
    match mime {
        "application/pdf" => bytes.starts_with(b"%PDF-"),
        "image/jpeg" => bytes.starts_with(&[255, 216, 255]),
        "image/png" => bytes.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]),
        "image/heic" | "image/heif" => {
            bytes.len() >= 12
                && &bytes[4..8] == b"ftyp"
                && bytes[8..bytes.len().min(32)]
                    .windows(4)
                    .any(|v| matches!(v, b"heic" | b"heix" | b"hevc" | b"hevx" | b"mif1"))
        }
        "image/vnd.dwg" | "application/acad" | "application/octet-stream" => {
            bytes.len() >= 6
                && bytes.starts_with(b"AC10")
                && bytes[4..6].iter().all(u8::is_ascii_digit)
        }
        "application/msword" | "application/vnd.ms-excel" => {
            bytes.starts_with(&[208, 207, 17, 224, 161, 177, 26, 225])
        }
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        | "application/zip"
        | "application/x-zip-compressed" => bytes.starts_with(b"PK\x03\x04"),
        _ => false,
    }
}

fn owner_exists(
    connection: &Connection,
    order_id: Uuid,
    owner_type: &str,
    owner_id: Uuid,
) -> Result<bool, AuthError> {
    let table = match owner_type {
        "purchase_order" => return Ok(owner_id == order_id),
        "receipt" => "local_receipts",
        "procurement_expenditure" => {
            return Ok(expenditures::read_payment(connection, owner_id)?
                .is_some_and(|payment| payment.order_id == order_id));
        }
        _ => return Ok(false),
    };
    connection
        .query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1 AND order_id=?2)"),
            params![owner_id.to_string(), order_id.to_string()],
            |r| r.get(0),
        )
        .map_err(|_| AuthError::Database)
}

fn attachment_data(
    connection: &Connection,
    id: Uuid,
) -> Result<(Metadata, String, String), AuthError> {
    let json:String=connection.query_row("SELECT json_object('id',a.id,'orderId',a.order_id,'ownerType',t.owner_type,'ownerId',t.owner_id,'originalName',a.original_name,'contentType',a.content_type,'byteLength',a.byte_length,'checksum',a.checksum,'projectId',t.project_id,'countryId',t.country_id,'objectKey',COALESCE(a.object_key,''),'versionId',t.version_id,'status',CASE WHEN a.upload_state='uploaded' THEN 'uploaded' ELSE 'pending_upload' END,'uploadedBy',t.uploaded_by,'createdAt',t.created_at) FROM local_order_attachments a JOIN local_attachment_transfers t ON t.id=a.id WHERE a.id=?1",[id.to_string()],|r|r.get(0)).map_err(|_|AuthError::InvalidInput)?;
    let canonical: Option<String> = connection
        .query_row(
            "SELECT verified_payload_json FROM local_attachment_transfers WHERE id=?1",
            [id.to_string()],
            |r| r.get(0),
        )
        .map_err(|_| AuthError::Database)?;
    let mut metadata: Metadata = serde_json::from_str(canonical.as_deref().unwrap_or(&json))
        .map_err(|_| AuthError::Database)?;
    if canonical.is_none() {
        let source: Option<String> = connection
            .query_row(
                "SELECT source_attachment_id FROM local_attachment_transfers WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        metadata.source_attachment_id = source
            .map(|v| Uuid::parse_str(&v).map_err(|_| AuthError::Database))
            .transpose()?;
    }
    let (path, state) = connection
        .query_row(
            "SELECT local_path,upload_state FROM local_order_attachments WHERE id=?1",
            [id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| AuthError::Database)?;
    Ok((metadata, path, state))
}

impl LocalAuthService {
    pub fn import_attachment(
        &self,
        mut input: AttachmentInput,
        now: SystemTime,
    ) -> Result<Uuid, AuthError> {
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(input.order_id, now)?;
        let actor = self.active_session_user_id()?;
        if !valid_type(&input.original_name, &input.content_type)
            || input.data_base64.len() > MAX_FILE.div_ceil(3) * 4
        {
            return Err(AuthError::InvalidInput);
        }
        let bytes = BASE64
            .decode(&input.data_base64)
            .map_err(|_| AuthError::InvalidInput)?;
        if bytes.is_empty()
            || bytes.len() > MAX_FILE
            || !valid_signature(&bytes, &input.content_type)
            || (input.owner_type == "receipt" && !input.content_type.starts_with("image/"))
        {
            return Err(AuthError::InvalidInput);
        }
        let is_heic = matches!(input.content_type.as_str(), "image/heic" | "image/heif");
        let original = is_heic.then(|| {
            (
                Uuid::new_v4(),
                bytes.clone(),
                input.original_name.clone(),
                input.content_type.clone(),
            )
        });
        let bytes = compress_image(bytes, &input.content_type)?;
        if is_heic {
            input.original_name = format!(
                "{}.jpg",
                input
                    .original_name
                    .rsplit_once('.')
                    .map_or("image", |v| v.0)
            );
            input.content_type = "image/jpeg".into();
            if !valid_type(&input.original_name, &input.content_type) {
                return Err(AuthError::InvalidInput);
            }
        }
        let checksum = format!("{:x}", Sha256::digest(&bytes));
        let folder = self.media_directory.join("attachments");
        fs::create_dir_all(&folder).map_err(|_| AuthError::Database)?;
        let path = folder.join(input.id.to_string());
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let tx = connection.transaction().map_err(|_| AuthError::Database)?;
        require_order_write_scope(&tx, input.order_id, actor, now)?;
        if !owner_exists(&tx, input.order_id, &input.owner_type, input.owner_id)? {
            return Err(AuthError::InvalidInput);
        }
        let (project,country,root):(String,String,String)=tx.query_row("SELECT project_id,country_id,COALESCE(parent_order_id,id) FROM local_purchase_orders WHERE id=?1 AND deleted_at IS NULL",[input.order_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|_|AuthError::Forbidden)?;
        let total:i64=tx.query_row("SELECT COALESCE(SUM(byte_length),0) FROM local_order_attachments WHERE order_id=?1 OR order_id IN (SELECT id FROM local_purchase_orders WHERE parent_order_id=?1)",[root],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        let photos:i64=tx.query_row("SELECT COUNT(*) FROM local_attachment_transfers WHERE owner_type='receipt' AND owner_id=?1 AND source_attachment_id IS NULL",[input.owner_id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        if total + bytes.len() as i64 + original.as_ref().map_or(0, |v| v.1.len() as i64)
            > 200 * 1024 * 1024
            || (input.owner_type == "receipt" && photos >= 10)
        {
            return Err(AuthError::InvalidInput);
        }
        // create_new prevents renderer-controlled UUID reuse from overwriting an existing file.
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| AuthError::InvalidInput)?;
        let mut original_path = None;
        let result = (|| {
            if let Some((id, source, name, mime)) = &original {
                let source_path = folder.join(id.to_string());
                let mut source_file = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&source_path)
                    .map_err(|_| AuthError::Database)?;
                original_path = Some(source_path.clone());
                source_file
                    .write_all(source)
                    .and_then(|_| source_file.sync_all())
                    .map_err(|_| AuthError::Database)?;
                let hash = format!("{:x}", Sha256::digest(source));
                tx.execute("INSERT INTO local_order_attachments (id,order_id,original_name,content_type,byte_length,local_path,upload_state,checksum,created_at) VALUES (?1,?2,?3,?4,?5,?6,'pending_upload',?7,?8)",params![id.to_string(),input.order_id.to_string(),name,mime,source.len() as i64,source_path.to_str().ok_or(AuthError::InvalidInput)?,hash,unix_seconds(now)]).map_err(|_|AuthError::Database)?;
                tx.execute("INSERT INTO local_attachment_transfers (id,owner_type,owner_id,project_id,country_id,uploaded_by,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![id.to_string(),input.owner_type,input.owner_id.to_string(),project,country,actor.to_string(),unix_seconds(now)]).map_err(|_|AuthError::Database)?;
            }
            file.write_all(&bytes)
                .and_then(|_| file.sync_all())
                .map_err(|_| AuthError::Database)?;
            tx.execute("INSERT INTO local_order_attachments (id,order_id,original_name,content_type,byte_length,local_path,upload_state,checksum,created_at) VALUES (?1,?2,?3,?4,?5,?6,'pending_upload',?7,?8)",params![input.id.to_string(),input.order_id.to_string(),input.original_name,input.content_type,bytes.len() as i64,path.to_str().ok_or(AuthError::InvalidInput)?,checksum,unix_seconds(now)]).map_err(|_|AuthError::Database)?;
            tx.execute("INSERT INTO local_attachment_transfers (id,owner_type,owner_id,project_id,country_id,uploaded_by,created_at,source_attachment_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",params![input.id.to_string(),input.owner_type,input.owner_id.to_string(),project,country,actor.to_string(),unix_seconds(now),original.as_ref().map(|v| v.0.to_string())]).map_err(|_|AuthError::Database)?;
            if input.owner_type == "receipt" {
                tx.execute("INSERT INTO local_receipt_attachment_links (receipt_id,attachment_id) VALUES (?1,?2)",params![input.owner_id.to_string(),input.id.to_string()]).map_err(|_|AuthError::Database)?;
            }
            append_order_audit(
                &tx,
                input.order_id,
                actor,
                "attachment_imported",
                None,
                None,
                Some(&serde_json::json!({"id":input.id,"sourceAttachmentId":original.as_ref().map(|v|v.0),"conversion":if is_heic {"heic-rs/0.1.4 -> jpeg/quality82/max2048"}else{"none"}}).to_string()),
                now,
            )?;
            tx.commit().map_err(|_| AuthError::Database)
        })();
        drop(file);
        if result.is_err() {
            let _ = fs::remove_file(&path);
            if let Some(source_path) = original_path {
                let _ = fs::remove_file(source_path);
            }
        }
        result.map(|_| input.id)
    }

    pub fn list_attachments(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<Vec<AttachmentView>, AuthError> {
        let connection = self.historical_order_connection(order_id, now)?;
        connection.prepare("SELECT a.id,t.owner_type,t.owner_id,a.original_name,a.content_type,a.byte_length,a.upload_state,a.local_path,t.retry_count,t.last_error,t.source_attachment_id FROM local_order_attachments a JOIN local_attachment_transfers t ON t.id=a.id WHERE a.order_id=?1 ORDER BY a.created_at,a.id").map_err(|_|AuthError::Database)?.query_map([order_id.to_string()],|r|Ok(AttachmentView{id:Uuid::parse_str(&r.get::<_,String>(0)?).map_err(|_|rusqlite::Error::InvalidQuery)?,owner_type:r.get(1)?,owner_id:Uuid::parse_str(&r.get::<_,String>(2)?).map_err(|_|rusqlite::Error::InvalidQuery)?,original_name:r.get(3)?,content_type:r.get(4)?,byte_length:r.get(5)?,upload_state:r.get(6)?,available_locally:Path::new(&r.get::<_,String>(7)?).is_file(),retry_count:r.get(8)?,last_error:r.get(9)?,source_attachment_id:r.get::<_,Option<String>>(10)?.map(|v|Uuid::parse_str(&v).map_err(|_|rusqlite::Error::InvalidQuery)).transpose()?})).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)
    }

    pub fn list_attachment_targets(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<Vec<AttachmentTarget>, AuthError> {
        let connection = self.historical_order_connection(order_id, now)?;
        let mut targets = vec![AttachmentTarget {
            owner_type: "purchase_order".into(),
            owner_id: order_id,
            description: String::new(),
        }];
        for (table, kind, column) in [("local_receipts", "receipt", "received_at")] {
            let query =
                format!("SELECT id,{column} FROM {table} WHERE order_id=?1 ORDER BY created_at,id");
            let rows = connection
                .prepare(&query)
                .map_err(|_| AuthError::Database)?
                .query_map([order_id.to_string()], |r| {
                    Ok(AttachmentTarget {
                        owner_type: kind.into(),
                        owner_id: Uuid::parse_str(&r.get::<_, String>(0)?)
                            .map_err(|_| rusqlite::Error::InvalidQuery)?,
                        description: r.get(1)?,
                    })
                })
                .map_err(|_| AuthError::Database)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| AuthError::Database)?;
            targets.extend(rows);
        }
        targets.extend(
            expenditures::effective_records(&connection, order_id)?
                .into_iter()
                .map(|payment| AttachmentTarget {
                    owner_type: "procurement_expenditure".into(),
                    owner_id: payment.id,
                    description: format!(
                        "{} · {} · {} {}",
                        payment.payment_date,
                        payment.payee_name,
                        payment.amount_minor,
                        payment.currency
                    ),
                }),
        );
        Ok(targets)
    }
}

fn validate_metadata(metadata: &Metadata) -> Result<(), AuthError> {
    if !valid_type(&metadata.original_name, &metadata.content_type)
        || metadata.byte_length == 0
        || metadata.byte_length > MAX_FILE
        || metadata.checksum.len() != 64
        || !metadata
            .checksum
            .bytes()
            .all(|v| v.is_ascii_hexdigit() && !v.is_ascii_uppercase())
        || metadata.status != "uploaded"
        || metadata.object_key.is_empty()
        || metadata.object_key.contains("..")
        || metadata.object_key.len() > 1024
        || metadata.created_at < 0
        || !matches!(
            metadata.owner_type.as_str(),
            "purchase_order" | "receipt" | "procurement_expenditure"
        )
        || (metadata.owner_type == "purchase_order" && metadata.owner_id != metadata.order_id)
        || (metadata.owner_type == "receipt" && !metadata.content_type.starts_with("image/"))
        || metadata
            .source_attachment_id
            .is_some_and(|source| source == metadata.id || metadata.content_type != "image/jpeg")
    {
        return Err(AuthError::InvalidInput);
    }
    Ok(())
}

fn project_one(tx: &Transaction<'_>, metadata: &Metadata) -> Result<(), AuthError> {
    validate_metadata(metadata)?;
    let scope:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM local_purchase_orders WHERE id=?1 AND project_id=?2 AND country_id=?3 AND deleted_at IS NULL)",params![metadata.order_id.to_string(),metadata.project_id.to_string(),metadata.country_id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
    if !scope {
        return Ok(());
    }
    if let Some(source) = metadata.source_attachment_id {
        let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM local_attachment_transfers t JOIN local_order_attachments a ON a.id=t.id WHERE t.id=?1 AND a.order_id=?2 AND t.owner_type=?3 AND t.owner_id=?4 AND a.content_type IN ('image/heic','image/heif') AND t.source_attachment_id IS NULL)", params![source.to_string(), metadata.order_id.to_string(),metadata.owner_type,metadata.owner_id.to_string()], |r|r.get(0)).map_err(|_|AuthError::Database)?;
        if !exists {
            return Ok(());
        }
    }
    let prior: Option<String> = tx
        .query_row(
            "SELECT verified_payload_json FROM local_attachment_transfers WHERE id=?1",
            [metadata.id.to_string()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|_| AuthError::Database)?
        .flatten();
    let payload = serde_json::to_string(metadata).map_err(|_| AuthError::InvalidInput)?;
    if let Some(prior) = prior {
        if serde_json::from_str::<Metadata>(&prior).map_err(|_| AuthError::Database)? != *metadata {
            return Err(AuthError::InvalidInput);
        }
        return Ok(());
    }
    let existing: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM local_attachment_transfers WHERE id=?1)",
            [metadata.id.to_string()],
            |r| r.get(0),
        )
        .map_err(|_| AuthError::Database)?;
    if existing {
        let (local, _, _) = attachment_data(tx, metadata.id)?;
        if local.order_id != metadata.order_id
            || local.owner_type != metadata.owner_type
            || local.owner_id != metadata.owner_id
            || local.original_name != metadata.original_name
            || local.content_type != metadata.content_type
            || local.byte_length != metadata.byte_length
            || local.checksum != metadata.checksum
            || local.source_attachment_id != metadata.source_attachment_id
        {
            return Err(AuthError::InvalidInput);
        }
        tx.execute(
            "UPDATE local_order_attachments SET upload_state='uploaded',object_key=?2 WHERE id=?1",
            params![metadata.id.to_string(), metadata.object_key],
        )
        .map_err(|_| AuthError::Database)?;
        tx.execute("UPDATE local_attachment_transfers SET version_id=?2,verified_payload_json=?3,last_error=NULL WHERE id=?1",params![metadata.id.to_string(),metadata.version_id,payload]).map_err(|_|AuthError::Database)?;
    } else {
        tx.execute("INSERT INTO local_order_attachments (id,order_id,original_name,content_type,byte_length,local_path,upload_state,object_key,checksum,created_at) VALUES (?1,?2,?3,?4,?5,'','uploaded',?6,?7,?8)",params![metadata.id.to_string(),metadata.order_id.to_string(),metadata.original_name,metadata.content_type,metadata.byte_length as i64,metadata.object_key,metadata.checksum,metadata.created_at]).map_err(|_|AuthError::Database)?;
        tx.execute("INSERT INTO local_attachment_transfers (id,owner_type,owner_id,project_id,country_id,uploaded_by,created_at,version_id,verified_payload_json,source_attachment_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![metadata.id.to_string(),metadata.owner_type,metadata.owner_id.to_string(),metadata.project_id.to_string(),metadata.country_id.to_string(),metadata.uploaded_by.to_string(),metadata.created_at,metadata.version_id,payload,metadata.source_attachment_id.map(|v|v.to_string())]).map_err(|_|AuthError::Database)?;
    }
    if metadata.owner_type == "receipt"
        && owner_exists(tx, metadata.order_id, "receipt", metadata.owner_id)?
    {
        tx.execute("INSERT OR IGNORE INTO local_receipt_attachment_links (receipt_id,attachment_id) VALUES (?1,?2)",params![metadata.owner_id.to_string(),metadata.id.to_string()]).map_err(|_|AuthError::Database)?;
    }
    Ok(())
}

pub(super) fn project_staged(tx: &Transaction<'_>) -> Result<(), AuthError> {
    let rows=tx.prepare("SELECT entity_id,operation,payload_json FROM local_sync_remote_entities WHERE entity_type='attachment' ORDER BY (json_extract(payload_json,'$.sourceAttachmentId') IS NOT NULL)").map_err(|_|AuthError::Database)?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?))).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
    for (id, op, payload) in rows {
        let metadata: Metadata =
            serde_json::from_str(&payload).map_err(|_| AuthError::InvalidInput)?;
        if metadata.id.to_string() != id || op != "upsert" {
            return Err(AuthError::InvalidInput);
        }
        project_one(tx, &metadata)?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedTransfer {
    id: Uuid,
    url: String,
    headers: HashMap<String, String>,
    expires_at: i64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Prepared {
    upload: Option<SignedTransfer>,
    metadata: Option<Metadata>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Download {
    metadata: Metadata,
    download: SignedTransfer,
}

fn endpoint(operation: &str) -> Result<reqwest::Url, AuthError> {
    sync_push_endpoint()?
        .join(&format!("../attachments/{operation}"))
        .map_err(|_| AuthError::SyncTransport)
}
fn http_client(auth: &LocalAuthService) -> Result<reqwest::Client, AuthError> {
    let mut builder = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(120));
    if let Some(certificate) = &auth.test_tls_root {
        builder = builder.add_root_certificate(certificate.clone());
    }
    builder.build().map_err(|_| AuthError::SyncTransport)
}
fn signed_url(
    transfer: &SignedTransfer,
    id: Uuid,
    now: SystemTime,
) -> Result<reqwest::Url, AuthError> {
    let url = reqwest::Url::parse(&transfer.url).map_err(|_| AuthError::SyncTransport)?;
    if transfer.id != id
        || transfer.expires_at <= unix_seconds(now)
        || url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.port().is_some()
        || !url
            .host_str()
            .is_some_and(|host| host.ends_with(".myqcloud.com"))
    {
        return Err(AuthError::SyncTransport);
    }
    Ok(url)
}
async fn successful(response: reqwest::Response) -> Result<reqwest::Response, AuthError> {
    match response.status() {
        reqwest::StatusCode::UNAUTHORIZED => Err(AuthError::NoActiveSession),
        reqwest::StatusCode::FORBIDDEN => Err(AuthError::Forbidden),
        status if status.is_success() => Ok(response),
        _ => Err(AuthError::SyncTransport),
    }
}

impl LocalAuthService {
    fn attachment_response(
        &self,
        response: reqwest::Response,
        session: OnlineSession,
    ) -> Result<reqwest::Response, AuthError> {
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            session,
        )?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.reject_sync_session(session)?;
        }
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(AuthError::Forbidden);
        }
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        self.verify_test_sync_origin(&response)?;
        Ok(response)
    }

    async fn transfer_attachment(
        &self,
        id: Uuid,
        now: SystemTime,
        sync: &SyncRequest,
    ) -> Result<(), AuthError> {
        let (metadata, path, _) = attachment_data(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            id,
        )?;
        self.require_active_scope_for_order(metadata.order_id, now)?;
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            sync.session,
        )?;
        if sync.session.account_id != metadata.uploaded_by {
            return Err(AuthError::Forbidden);
        }
        let client = http_client(self)?;
        let mut request = serde_json::json!({"id":id,"orderId":metadata.order_id,"ownerType":metadata.owner_type,"ownerId":metadata.owner_id,"originalName":metadata.original_name,"contentType":metadata.content_type,"byteLength":metadata.byte_length,"checksum":metadata.checksum});
        if let Some(source_id) = metadata.source_attachment_id {
            request["sourceAttachmentId"] = serde_json::json!(source_id);
        }
        let prepared = self
            .attachment_response(
                client
                    .post(endpoint("prepare")?)
                    .bearer_auth(&sync.token)
                    .json(&request)
                    .send()
                    .await
                    .map_err(|_| AuthError::SyncTransport)?,
                sync.session,
            )?
            .json::<Prepared>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            sync.session,
        )?;
        let verified = if let Some(verified) = prepared.metadata {
            verified
        } else {
            let upload = prepared.upload.ok_or(AuthError::SyncTransport)?;
            let bytes = fs::read(&path).map_err(|_| AuthError::Database)?;
            if bytes.len() != metadata.byte_length
                || format!("{:x}", Sha256::digest(&bytes)) != metadata.checksum
            {
                return Err(AuthError::InvalidInput);
            }
            let mut request = client.put(signed_url(&upload, id, now)?);
            for (key, value) in upload.headers {
                if !matches!(
                    key.as_str(),
                    "content-type"
                        | "content-length"
                        | "x-cos-meta-sha256"
                        | "x-cos-forbid-overwrite"
                ) {
                    return Err(AuthError::SyncTransport);
                }
                request = request.header(key, value);
            }
            Self::require_request_session(
                &*self.connection.lock().map_err(|_| AuthError::Database)?,
                sync.session,
            )?;
            let response = request
                .body(bytes)
                .send()
                .await
                .map_err(|_| AuthError::SyncTransport)?;
            Self::require_request_session(
                &*self.connection.lock().map_err(|_| AuthError::Database)?,
                sync.session,
            )?;
            // A prior PUT may have succeeded before a crash. Finalization independently hashes the object.
            if !response.status().is_success() && response.status() != reqwest::StatusCode::CONFLICT
            {
                return Err(AuthError::SyncTransport);
            }
            self.attachment_response(
                client
                    .post(endpoint(&format!("{id}/complete"))?)
                    .bearer_auth(&sync.token)
                    .send()
                    .await
                    .map_err(|_| AuthError::SyncTransport)?,
                sync.session,
            )?
            .json::<Metadata>()
            .await
            .map_err(|_| AuthError::SyncTransport)?
        };
        if verified.id != id {
            return Err(AuthError::InvalidInput);
        }
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        Self::require_request_session(&connection, sync.session)?;
        let tx = connection.transaction().map_err(|_| AuthError::Database)?;
        project_one(&tx, &verified)?;
        tx.commit().map_err(|_| AuthError::Database)
    }

    pub async fn sync_attachments_https(
        &self,
        now: SystemTime,
    ) -> Result<ProcurementSyncReport, AuthError> {
        let sync = self.sync_request(now)?;
        // Push order/payment/receipt owners first; upload failures never roll back their offline writes.
        self.push_pending_https(now).await?;
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            sync.session,
        )?;
        let ids=self.connection.lock().map_err(|_|AuthError::Database)?.prepare("SELECT t.id FROM local_attachment_transfers t JOIN local_order_attachments a ON a.id=t.id WHERE a.upload_state='pending_upload' AND t.next_attempt_at<=?1 AND t.uploaded_by=?2 ORDER BY (t.source_attachment_id IS NOT NULL),t.created_at,t.id LIMIT 10").map_err(|_|AuthError::Database)?.query_map(params![unix_seconds(now),sync.session.account_id.to_string()],|r|r.get::<_,String>(0)).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
        let mut completed = 0;
        for id in ids {
            let id = Uuid::parse_str(&id).map_err(|_| AuthError::Database)?;
            match self.transfer_attachment(id, now, &sync).await {
                Ok(()) => completed += 1,
                Err(error) => {
                    let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
                    Self::require_request_session(&connection, sync.session)?;
                    let attempts: i64 = connection
                        .query_row(
                            "SELECT retry_count FROM local_attachment_transfers WHERE id=?1",
                            [id.to_string()],
                            |r| r.get(0),
                        )
                        .map_err(|_| AuthError::Database)?;
                    let delay = 2i64.pow((attempts as u32).min(8))
                        + i64::from(Uuid::new_v4().as_bytes()[0] % 5);
                    connection.execute("UPDATE local_attachment_transfers SET retry_count=retry_count+1,last_error=?2,next_attempt_at=?3 WHERE id=?1",params![id.to_string(),error.to_string(),unix_seconds(now)+delay]).map_err(|_|AuthError::Database)?;
                    if matches!(error, AuthError::NoActiveSession | AuthError::Forbidden) {
                        return Err(error);
                    }
                }
            }
        }
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            sync.session,
        )?;
        self.pull_sync_https(now).await?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        Self::require_request_session(&connection, sync.session)?;
        let pending:i64=connection.query_row("SELECT (SELECT COUNT(*) FROM local_sync_outbox WHERE acknowledged_at IS NULL AND superseded_at IS NULL AND owner_account_id=?1)+(SELECT COUNT(*) FROM local_order_attachments a JOIN local_attachment_transfers t ON t.id=a.id WHERE a.upload_state='pending_upload' AND t.uploaded_by=?1)",[sync.session.account_id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        let conflicts: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_sync_conflicts c JOIN local_sync_outbox o ON o.event_id=c.event_id WHERE c.resolved_at IS NULL AND o.owner_account_id=?1",
                [sync.session.account_id.to_string()],
                |r| r.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        Ok(ProcurementSyncReport {
            uploaded_count: completed,
            pending_count: pending,
            conflict_count: conflicts,
        })
    }

    pub async fn read_attachment_https(
        &self,
        id: Uuid,
        now: SystemTime,
    ) -> Result<String, AuthError> {
        self.require_catalog_read(now)?;
        let (metadata, path, _) = attachment_data(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            id,
        )?;
        let authorized = self.historical_order_connection(metadata.order_id, now)?;
        if !path.is_empty() && Path::new(&path).is_file() {
            return read_verified(&metadata, Path::new(&path));
        }
        drop(authorized);
        let sync = self.sync_request(now)?;
        let client = http_client(self)?;
        let response = self
            .attachment_response(
                client
                    .get(endpoint(&format!("{id}/download"))?)
                    .bearer_auth(&sync.token)
                    .send()
                    .await
                    .map_err(|_| AuthError::SyncTransport)?,
                sync.session,
            )?
            .json::<Download>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            sync.session,
        )?;
        if response.metadata != metadata {
            return Err(AuthError::InvalidInput);
        }
        let mut response = successful(
            client
                .get(signed_url(&response.download, id, now)?)
                .send()
                .await
                .map_err(|_| AuthError::SyncTransport)?,
        )
        .await?;
        let folder = self.media_directory.join("attachments");
        fs::create_dir_all(&folder).map_err(|_| AuthError::Database)?;
        let path = folder.join(id.to_string());
        let temp = folder.join(format!("{id}.{}", Uuid::new_v4()));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| AuthError::Database)?;
        let result = async {
            let mut size = 0;
            while let Some(bytes) = response
                .chunk()
                .await
                .map_err(|_| AuthError::SyncTransport)?
            {
                size += bytes.len();
                if size > metadata.byte_length {
                    return Err(AuthError::InvalidInput);
                }
                file.write_all(&bytes).map_err(|_| AuthError::Database)?;
            }
            Self::require_request_session(
                &*self.connection.lock().map_err(|_| AuthError::Database)?,
                sync.session,
            )?;
            file.sync_all().map_err(|_| AuthError::Database)?;
            read_verified(&metadata, &temp)
        }
        .await;
        drop(file);
        let result = match result {
            Ok(data) => {
                let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
                if let Err(error) = Self::require_request_session(&connection, sync.session) {
                    let _ = fs::remove_file(&temp);
                    return Err(error);
                }
                if path.exists() {
                    let _ = fs::remove_file(&temp);
                    read_verified(&metadata, &path)?;
                } else {
                    fs::rename(&temp, &path).map_err(|_| AuthError::Database)?;
                }
                connection
                    .execute(
                        "UPDATE local_order_attachments SET local_path=?2 WHERE id=?1",
                        params![id.to_string(), path.to_str().ok_or(AuthError::Database)?],
                    )
                    .map_err(|_| AuthError::Database)?;
                Ok(data)
            }
            Err(error) => {
                let _ = fs::remove_file(&temp);
                Err(error)
            }
        };
        result
    }
}

fn read_verified(metadata: &Metadata, path: &Path) -> Result<String, AuthError> {
    if fs::metadata(path).map_err(|_| AuthError::Database)?.len() != metadata.byte_length as u64 {
        return Err(AuthError::InvalidInput);
    }
    let bytes = fs::read(path).map_err(|_| AuthError::Database)?;
    if format!("{:x}", Sha256::digest(&bytes)) != metadata.checksum
        || !valid_signature(&bytes, &metadata.content_type)
    {
        return Err(AuthError::InvalidInput);
    }
    Ok(format!(
        "data:{};base64,{}",
        metadata.content_type,
        BASE64.encode(bytes)
    ))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcurementSyncReport {
    pub uploaded_count: usize,
    pub pending_count: i64,
    pub conflict_count: i64,
}

fn compress_image(bytes: Vec<u8>, mime: &str) -> Result<Vec<u8>, AuthError> {
    use image::ImageDecoder;
    if matches!(mime, "image/heic" | "image/heif") {
        heic_limits::check(&bytes, 32 * 1024 * 1024)?;
        let info = heic_rs::probe(&bytes).map_err(|_| AuthError::InvalidInput)?;
        if [info.width, info.height, info.coded_width, info.coded_height]
            .into_iter()
            .any(|v| v == 0 || v > 8192)
        {
            return Err(AuthError::InvalidInput);
        }
        let options = heic_rs::DecodeOptions {
            max_pixels: Some(32 * 1024 * 1024),
            strict: true,
            ..Default::default()
        };
        let pixels = heic_rs::decode(&bytes, &options).map_err(|_| AuthError::InvalidInput)?;
        let decoded = image::RgbImage::from_raw(pixels.width, pixels.height, pixels.data)
            .ok_or(AuthError::InvalidInput)?;
        let decoded = image::DynamicImage::ImageRgb8(decoded);
        let decoded = if decoded.width() > 2048 || decoded.height() > 2048 {
            decoded.thumbnail(2048, 2048)
        } else {
            decoded
        };
        let mut output = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 82)
            .encode_image(&decoded)
            .map_err(|_| AuthError::InvalidInput)?;
        return Ok(output);
    }
    let format = match mime {
        "image/jpeg" => image::ImageFormat::Jpeg,
        "image/png" => image::ImageFormat::Png,
        _ => return Ok(bytes),
    };
    let mut reader = image::ImageReader::with_format(std::io::Cursor::new(&bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let mut decoder = reader.into_decoder().map_err(|_| AuthError::InvalidInput)?;
    let orientation = decoder.orientation().map_err(|_| AuthError::InvalidInput)?;
    let mut decoded =
        image::DynamicImage::from_decoder(decoder).map_err(|_| AuthError::InvalidInput)?;
    decoded.apply_orientation(orientation);
    let resized = decoded.width() > 2048 || decoded.height() > 2048;
    let decoded = if resized {
        decoded.thumbnail(2048, 2048)
    } else {
        decoded
    };
    let mut output = Vec::new();
    if format == image::ImageFormat::Jpeg {
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 82)
            .encode_image(&decoded)
            .map_err(|_| AuthError::InvalidInput)?;
    } else {
        decoded
            .write_to(&mut std::io::Cursor::new(&mut output), format)
            .map_err(|_| AuthError::InvalidInput)?;
    }
    if resized || output.len() < bytes.len() {
        Ok(output)
    } else {
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn heic_decodes_real_pixels_and_rejects_corruption_and_excess_dimensions() {
        for (fixture, dimensions) in [
            (
                include_bytes!("../../../../tests/fixtures/heic/gradient-512.heic").as_slice(),
                (512, 512),
            ),
            (
                include_bytes!("../../../../tests/fixtures/heic/checker-1024.heic").as_slice(),
                (1024, 1024),
            ),
        ] {
            let output = compress_image(fixture.to_vec(), "image/heic").unwrap();
            if dimensions == (512, 512) {
                assert_eq!(
                    output,
                    include_bytes!("../../../../tests/fixtures/heic/gradient-512.jpg")
                );
            }
            assert!(
                valid_signature(&output, "image/jpeg"),
                "HEIC must be decoded and encoded as JPEG"
            );
            let decoded = image::load_from_memory(&output).unwrap();
            assert_eq!((decoded.width(), decoded.height()), dimensions);
            assert!(compress_image(fixture[..32].to_vec(), "image/heic").is_err());
            let mut oversized = fixture.to_vec();
            let indices: Vec<_> = oversized
                .windows(4)
                .enumerate()
                .filter_map(|(i, v)| (v == b"ispe").then_some(i))
                .collect();
            assert!(!indices.is_empty());
            for index in indices {
                oversized[index + 8..index + 12].copy_from_slice(&9000u32.to_be_bytes());
            }
            assert!(compress_image(oversized, "image/heic").is_err());
        }
        assert!(compress_image(b"not an image".to_vec(), "image/heic").is_err());
    }
    fn login(service: &LocalAuthService, actor: Uuid, now: SystemTime) {
        service
            .cache_verified_account(
                CachedAccount {
                    id: actor,
                    username: format!("attachment-test-{actor}"),
                    roles: vec![Role::Purchaser],
                    enabled: true,
                    requires_password_change: false,
                },
                "fixture-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        let answer = captcha
            .question
            .split_whitespace()
            .filter_map(|v| v.parse::<u8>().ok())
            .sum();
        service
            .offline_login(
                &format!("attachment-test-{actor}"),
                "fixture-password",
                captcha.id,
                answer,
                now,
            )
            .unwrap();
    }
    #[test]
    fn attachment_responses_reject_stale_generations_and_invalidate_only_the_captured_session() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        login(&service, a, now);
        login(&service, b, now);
        let response = |status| {
            reqwest::Response::from(
                tauri::http::Response::builder()
                    .status(status)
                    .body(String::new())
                    .unwrap(),
            )
        };
        service
            .activate_online_session(a, &"a".repeat(32), now)
            .unwrap();
        let old = service.sync_request(now).unwrap().session;
        assert!(service.attachment_response(response(200), old).is_ok());
        service
            .activate_online_session(b, &"b".repeat(32), now)
            .unwrap();
        assert!(matches!(
            service.attachment_response(response(200), old),
            Err(AuthError::SyncAccountBoundary)
        ));
        assert!(matches!(
            service.attachment_response(response(401), old),
            Err(AuthError::SyncAccountBoundary)
        ));
        assert_eq!(service.require_online_sync_session(now), Ok(b));
        let prior_generation = service.sync_request(now).unwrap().session;
        service
            .activate_online_session(b, &"c".repeat(32), now)
            .unwrap();
        assert!(matches!(
            service.attachment_response(response(200), prior_generation),
            Err(AuthError::SyncAccountBoundary)
        ));
        let current = service.sync_request(now).unwrap().session;
        assert!(matches!(
            service.attachment_response(response(401), current),
            Err(AuthError::NoActiveSession)
        ));
        assert_eq!(
            service.require_online_sync_session(now),
            Err(AuthError::NoActiveSession)
        );
    }

    #[test]
    fn file_queue_survives_restart_and_limits_receipt_photos_and_scope() {
        let path =
            std::env::temp_dir().join(format!("honsen-attachments-{}.sqlite", Uuid::new_v4()));
        let service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
        let now = SystemTime::now();
        let actor = Uuid::new_v4();
        let country = Uuid::new_v4();
        let order = Uuid::new_v4();
        login(&service, actor, now);
        crate::tests::grant_new_test_scope(&service, actor, country, now);
        let connection = service.connection.lock().unwrap();
        let (project,department,team):(String,String,String)=connection.query_row("SELECT project_id,department_id,team_id FROM local_authorization_snapshots WHERE account_id=?1",[actor.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        connection.execute("INSERT INTO local_purchase_orders (id,display_no,country_id,project_id,site,department_id,team_id,applicant_id,currency,primary_currency,language_pair,status,workflow_status,urgency,order_date,delivery_address,subtotal_minor,line_discount_minor,order_discount_minor,freight_minor,tax_rate_basis_points,tax_minor,total_minor,version,created_at,updated_at,procurement_mode) VALUES (?1,'ATTACHMENT',?2,?3,'fixture',?4,?5,?6,'XOF','XOF','zh_fr','pending_confirmation','executing','normal','2026-10-24','fixture',1000,0,0,0,0,0,1000,1,0,0,'honsen_self_purchase')",params![order.to_string(),country.to_string(),project,department,team,actor.to_string()]).unwrap();
        let receipt = Uuid::new_v4();
        connection
            .execute(
                "INSERT INTO local_receipts VALUES (?1,?2,'2026-10-24',?3,NULL,?3,0)",
                params![receipt.to_string(), order.to_string(), actor.to_string()],
            )
            .unwrap();
        let second_path =
            std::env::temp_dir().join(format!("honsen-second-client-{}.sqlite", Uuid::new_v4()));
        connection
            .execute("VACUUM INTO ?1", [second_path.to_str().unwrap()])
            .unwrap();
        drop(connection);
        let second = LocalAuthService::open_file_for_test(second_path.to_str().unwrap()).unwrap();
        let second_actor = Uuid::new_v4();
        login(&second, second_actor, now);
        second.connection.lock().unwrap().execute("INSERT INTO local_authorization_snapshots (account_id,project_id,department_id,team_id,verified_at,expires_at) SELECT ?1,project_id,department_id,team_id,verified_at,expires_at FROM local_authorization_snapshots WHERE account_id=?2",params![second_actor.to_string(),actor.to_string()]).unwrap();
        let mut encoded = Vec::new();
        image::DynamicImage::new_rgb8(4096, 8)
            .write_to(
                &mut std::io::Cursor::new(&mut encoded),
                image::ImageFormat::Png,
            )
            .unwrap();
        let input = AttachmentInput {
            id: Uuid::new_v4(),
            order_id: order,
            owner_type: "receipt".into(),
            owner_id: receipt,
            original_name: "synthetic.png".into(),
            content_type: "image/png".into(),
            data_base64: BASE64.encode(encoded),
        };
        for _ in 0..10 {
            service
                .import_attachment(
                    AttachmentInput {
                        id: Uuid::new_v4(),
                        ..input.clone()
                    },
                    now,
                )
                .unwrap();
        }
        assert_eq!(
            service.import_attachment(input.clone(), now),
            Err(AuthError::InvalidInput)
        );
        let files = service.list_attachments(order, now).unwrap();
        assert_eq!(files.len(), 10);
        assert!(
            files
                .iter()
                .all(|v| v.available_locally && v.upload_state == "pending_upload")
        );
        let (metadata, file, _) =
            attachment_data(&*service.connection.lock().unwrap(), files[0].id).unwrap();
        assert_eq!(
            image::ImageReader::open(&file)
                .unwrap()
                .with_guessed_format()
                .unwrap()
                .into_dimensions()
                .unwrap()
                .0,
            2048
        );
        assert!(
            read_verified(&metadata, Path::new(&file))
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
        let mut canonical = metadata.clone();
        canonical.created_at += 120;
        canonical.status = "uploaded".into();
        canonical.object_key = "honsen-procure/attachments/synthetic".into();
        {
            let mut connection = service.connection.lock().unwrap();
            let tx = connection.transaction().unwrap();
            project_one(&tx, &canonical).unwrap();
            tx.commit().unwrap();
        }
        assert_eq!(
            attachment_data(&*service.connection.lock().unwrap(), canonical.id)
                .unwrap()
                .0,
            canonical
        );
        let payment_id = Uuid::new_v4();
        service
            .record_procurement_expenditure(
                RecordProcurementExpenditureInput {
                    id: payment_id,
                    order_id: order,
                    payee_name: "Synthetic payee".into(),
                    currency: "XOF".into(),
                    amount_minor: "100".into(),
                    payment_date: "2026-10-24".into(),
                    payment_type: "progress".into(),
                    payment_method: "cash".into(),
                    voucher_reference: None,
                    notes: None,
                    receipt_id: None,
                    counterparty_type: None,
                    supplier_id: None,
                    payment_handler_id: None,
                    voucher_attachment_ids: vec![],
                },
                now,
            )
            .unwrap();
        let voucher_id = Uuid::new_v4();
        service
            .import_attachment(
                AttachmentInput {
                    id: voucher_id,
                    order_id: order,
                    owner_type: "procurement_expenditure".into(),
                    owner_id: payment_id,
                    original_name: "synthetic-voucher.pdf".into(),
                    content_type: "application/pdf".into(),
                    data_base64: BASE64.encode(b"%PDF-1.4 synthetic voucher"),
                },
                now,
            )
            .unwrap();
        assert!(
            service.list_confirmed_procurement_orders(now).unwrap()[0]
                .payment_summary
                .records[0]
                .has_voucher
        );
        let (mut voucher, _, _) =
            attachment_data(&*service.connection.lock().unwrap(), voucher_id).unwrap();
        voucher.status = "uploaded".into();
        voucher.object_key = "honsen-procure/attachments/synthetic-voucher".into();
        voucher.created_at += 120;
        let payment_payload:String=service.connection.lock().unwrap().query_row("SELECT payload_json FROM local_sync_outbox WHERE entity_type='procurement_expenditure' AND entity_id=?1",[payment_id.to_string()],|r|r.get(0)).unwrap();
        let change =
            |cursor: &str, kind: &str, id: Uuid, payload: serde_json::Value| SyncPullChangeInput {
                cursor: cursor.into(),
                entity_type: kind.into(),
                entity_id: id,
                operation: "upsert".into(),
                version: 1,
                payload,
                changed_at: "2026-10-24T00:00:00Z".into(),
            };
        let page = SyncPullPageInput {
            changes: vec![
                change(
                    "1",
                    "procurement_expenditure",
                    payment_id,
                    serde_json::from_str(&payment_payload).unwrap(),
                ),
                change(
                    "2",
                    "attachment",
                    canonical.id,
                    serde_json::to_value(&canonical).unwrap(),
                ),
                change(
                    "3",
                    "attachment",
                    voucher.id,
                    serde_json::to_value(&voucher).unwrap(),
                ),
            ],
            next_cursor: "3".into(),
        };
        second.apply_sync_pull_page(page.clone(), now).unwrap();
        second.apply_sync_pull_page(page, now).unwrap();
        let remote_files = second.list_attachments(order, now).unwrap();
        assert_eq!(remote_files.len(), 2);
        assert!(
            remote_files
                .iter()
                .all(|v| v.upload_state == "uploaded" && !v.available_locally)
        );
        assert_eq!(
            second.list_confirmed_procurement_orders(now).unwrap()[0]
                .payment_summary
                .paid_minor,
            "100"
        );
        let reversal = service
            .reverse_procurement_expenditure(
                ReverseProcurementExpenditureInput {
                    id: Uuid::new_v4(),
                    expenditure_id: payment_id,
                    reason: "Synthetic cross-device correction".into(),
                },
                now,
            )
            .unwrap();
        let payload:String=service.connection.lock().unwrap().query_row("SELECT payload_json FROM local_sync_outbox WHERE entity_type='procurement_expenditure' AND entity_id=?1",[reversal.id.to_string()],|r|r.get(0)).unwrap();
        second
            .apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![change(
                        "4",
                        "procurement_expenditure",
                        reversal.id,
                        serde_json::from_str(&payload).unwrap(),
                    )],
                    next_cursor: "4".into(),
                },
                now,
            )
            .unwrap();
        assert_eq!(
            second.list_confirmed_procurement_orders(now).unwrap()[0]
                .payment_summary
                .paid_minor,
            "0"
        );
        assert_eq!(
            service.list_confirmed_procurement_orders(now).unwrap()[0]
                .payment_summary
                .paid_minor,
            "0"
        );
        drop(second);
        fs::remove_file(&second_path).unwrap();

        drop(service);
        let service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
        assert!(matches!(
            service.list_attachments(order, now),
            Err(AuthError::NoActiveSession)
        ));
        login(&service, actor, now);
        assert_eq!(service.list_attachments(order, now).unwrap().len(), 11);
        let heic_bytes = include_bytes!("../../../../tests/fixtures/heic/gradient-512.heic");
        let heic_id = Uuid::new_v4();
        let heic_input = AttachmentInput {
            id: heic_id,
            order_id: order,
            owner_type: "purchase_order".into(),
            owner_id: order,
            original_name: "gradient.heic".into(),
            content_type: "image/heic".into(),
            data_base64: BASE64.encode(heic_bytes),
        };
        service.import_attachment(heic_input.clone(), now).unwrap();
        let (derivative, derived_path, _) =
            attachment_data(&*service.connection.lock().unwrap(), heic_id).unwrap();
        assert_eq!(derivative.content_type, "image/jpeg");
        assert_eq!(derivative.original_name, "gradient.jpg");
        let source_id = derivative.source_attachment_id.unwrap();
        let (source, source_path, _) =
            attachment_data(&*service.connection.lock().unwrap(), source_id).unwrap();
        assert_eq!(source.checksum, format!("{:x}", Sha256::digest(heic_bytes)));
        assert_eq!(fs::read(source_path).unwrap(), heic_bytes);
        assert!(
            fs::read(derived_path)
                .unwrap()
                .starts_with(&[255, 216, 255])
        );
        assert_eq!(service.list_attachments(order, now).unwrap().len(), 13);
        assert_eq!(
            service.import_attachment(heic_input.clone(), now),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(
            service.import_attachment(
                AttachmentInput {
                    id: Uuid::new_v4(),
                    data_base64: BASE64.encode(&heic_bytes[..32]),
                    ..heic_input
                },
                now
            ),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(service.list_attachments(order, now).unwrap().len(), 13);
        assert_eq!(
            fs::read_dir(service.media_directory.join("attachments"))
                .unwrap()
                .count(),
            13
        );
        let connection = service.connection.lock().unwrap();
        connection
            .execute(
                "DELETE FROM local_authorization_snapshots WHERE account_id=?1",
                [actor.to_string()],
            )
            .unwrap();
        drop(connection);
        assert!(matches!(
            service.list_attachments(order, now),
            Err(AuthError::Forbidden)
        ));
        assert_eq!(
            service.import_attachment(
                AttachmentInput {
                    id: Uuid::new_v4(),
                    ..input
                },
                now
            ),
            Err(AuthError::Forbidden)
        );
        drop(service);
        fs::remove_file(&path).unwrap();
        assert!(
            path.with_extension("media")
                .starts_with(std::env::temp_dir())
        );
        fs::remove_dir_all(path.with_extension("media")).unwrap();
    }
}
