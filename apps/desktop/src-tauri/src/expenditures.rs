use super::*;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CounterpartySnapshot {
    #[serde(rename = "type")]
    pub kind: String,
    pub supplier_id: Option<Uuid>,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PaymentPayload {
    pub id: Uuid,
    pub order_id: Uuid,
    pub project_id: Uuid,
    pub country_id: Uuid,
    pub supplier_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receipt_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counterparty_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counterparty_snapshot: Option<CounterpartySnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voucher_attachment_ids: Option<Vec<Uuid>>,
    pub payee_name: String,
    pub currency: String,
    pub amount_minor: String,
    pub payment_date: String,
    pub payment_type: String,
    pub payment_method: String,
    pub payment_handler_id: Uuid,
    pub voucher_reference: Option<String>,
    pub notes: Option<String>,
    pub status: String,
    pub corrects_expenditure_id: Option<Uuid>,
    pub correction_reason: Option<String>,
    pub created_by: Uuid,
    pub created_at: i64,
}

pub(super) fn read_payment(
    connection: &Connection,
    id: Uuid,
) -> Result<Option<PaymentPayload>, AuthError> {
    let decisions_exist: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='local_payment_conflict_decisions')",[],|r|r.get(0)).map_err(|_|AuthError::Database)?;
    if decisions_exist {
        let hidden: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM local_payment_conflict_decisions WHERE entity_id=?1 AND canonical_entity_id<>?1)",[id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        if hidden {
            return Ok(None);
        }
        let canonical: Option<String> = connection.query_row("SELECT json_extract(payload_json,'$.canonicalPayload') FROM local_payment_conflict_decisions WHERE canonical_entity_id=?1 ORDER BY id LIMIT 1",[id.to_string()],|r|r.get(0)).optional().map_err(|_|AuthError::Database)?;
        if let Some(payload) = canonical {
            return serde_json::from_str(&payload)
                .map(Some)
                .map_err(|_| AuthError::Database);
        }
    }
    let journal_exists: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='local_procurement_expenditure_sync_payloads')",[],|r|r.get(0)).map_err(|_|AuthError::Database)?;
    if journal_exists {
        let payload: Option<String> = connection.query_row("SELECT payload_json FROM local_procurement_expenditure_sync_payloads WHERE expenditure_id=?1",[id.to_string()],|r|r.get(0)).optional().map_err(|_|AuthError::Database)?;
        if let Some(payload) = payload {
            return serde_json::from_str(&payload)
                .map(Some)
                .map_err(|_| AuthError::Database);
        }
    }
    let value: Option<String> = connection.query_row(
        "SELECT json_object('id',e.id,'orderId',e.order_id,'projectId',e.project_id,'countryId',o.country_id,'supplierId',e.supplier_id,'receiptId',e.receipt_id,'counterpartyType',e.counterparty_type,'counterpartySnapshot',json(NULLIF(e.counterparty_snapshot_json,'{}')),'voucherAttachmentIds',json((SELECT json_group_array(attachment_id) FROM (SELECT attachment_id FROM local_procurement_expenditure_vouchers WHERE expenditure_id=e.id ORDER BY attachment_id))),'payeeName',e.payee_name,'currency',e.currency,'amountMinor',CAST(e.amount_minor AS TEXT),'paymentDate',e.payment_date,'paymentType',e.payment_type,'paymentMethod',e.payment_method,'paymentHandlerId',e.payment_handler_id,'voucherReference',e.voucher_reference,'notes',e.notes,'status',e.status,'correctsExpenditureId',e.corrects_expenditure_id,'correctionReason',e.correction_reason,'createdBy',e.created_by,'createdAt',e.created_at) FROM local_procurement_expenditures e JOIN local_purchase_orders o ON o.id=e.order_id WHERE e.id=?1",
        [id.to_string()], |row| row.get(0),
    ).optional().map_err(|_| AuthError::Database)?;
    value
        .map(|json| serde_json::from_str(&json).map_err(|_| AuthError::Database))
        .transpose()
}

pub(super) fn validate(payment: &PaymentPayload) -> Result<i64, AuthError> {
    let amount = as_i64(parse_non_negative_minor(&payment.amount_minor)?)?;
    if amount <= 0
        || amount.to_string() != payment.amount_minor
        || !valid_currency(&payment.currency)
        || !valid_required_text(&payment.payee_name, 500)
        || !valid_iso_date(&payment.payment_date)
        || !matches!(
            payment.payment_type.as_str(),
            "advance" | "progress" | "final" | "other"
        )
        || !matches!(
            payment.payment_method.as_str(),
            "cash" | "bank_transfer" | "mobile_payment" | "other"
        )
        || !valid_optional_text(&payment.notes, 4000)
        || !valid_optional_text(&payment.voucher_reference, 1000)
        || payment.counterparty_type.as_deref().is_some_and(|kind| {
            !matches!(kind, "registered_supplier" | "market_casual")
                || kind == "registered_supplier" && payment.supplier_id.is_none()
                || kind == "market_casual" && payment.supplier_id.is_some()
        })
        || payment
            .counterparty_snapshot
            .as_ref()
            .is_some_and(|snapshot| {
                Some(snapshot.kind.as_str()) != payment.counterparty_type.as_deref()
                    || snapshot.supplier_id != payment.supplier_id
                    || !valid_required_text(&snapshot.name, 500)
            })
        || payment.voucher_attachment_ids.as_ref().is_some_and(|ids| {
            ids.len() > 100 || ids.iter().collect::<HashSet<_>>().len() != ids.len()
        })
        || payment.created_at < 0
        || match payment.status.as_str() {
            "recorded" => {
                payment.corrects_expenditure_id.is_some() || payment.correction_reason.is_some()
            }
            "reversed" => {
                payment
                    .corrects_expenditure_id
                    .is_none_or(|id| id == payment.id)
                    || payment
                        .correction_reason
                        .as_ref()
                        .is_none_or(|v| !valid_required_text(v, 1000))
            }
            _ => true,
        }
    {
        return Err(AuthError::InvalidInput);
    }
    Ok(amount)
}

fn insert_payment(
    transaction: &Transaction<'_>,
    payment: &PaymentPayload,
) -> Result<bool, AuthError> {
    let amount = validate(payment)?;
    let order: Option<(String, String, String, Option<String>, Option<String>, Option<String>)> = transaction.query_row(
        "SELECT project_id,country_id,currency,procurement_mode,parent_order_id,supplier_id FROM local_purchase_orders WHERE id=?1 AND deleted_at IS NULL",
        [payment.order_id.to_string()], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)),
    ).optional().map_err(|_| AuthError::Database)?;
    let Some((project, country, currency, mode, parent, supplier)) = order else {
        return Ok(false);
    };
    let parent_mode: Option<String> = if let Some(parent) = parent {
        let result: Option<Option<String>> = transaction.query_row("SELECT procurement_mode FROM local_purchase_orders WHERE id=?1 AND project_id=?2 AND country_id=?3 AND deleted_at IS NULL",params![parent,project,country],|r|r.get(0)).optional().map_err(|_| AuthError::Database)?;
        let Some(result) = result else {
            return Ok(false);
        };
        result
    } else {
        mode
    };
    if project != payment.project_id.to_string()
        || country != payment.country_id.to_string()
        || currency != payment.currency
        || parent_mode.as_deref() != Some("honsen_self_purchase")
        || payment
            .supplier_id
            .map(|v| v.to_string())
            .is_some_and(|v| supplier.as_ref().is_some_and(|supplier| supplier != &v))
    {
        return Err(AuthError::InvalidInput);
    }
    if let Some(supplier) = payment.supplier_id {
        let stored: Option<String> = transaction
            .query_row(
                "SELECT country_id FROM local_suppliers WHERE id=?1",
                [supplier.to_string()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        match stored {
            None => return Ok(false),
            Some(country) if country != payment.country_id.to_string() => {
                return Err(AuthError::InvalidInput);
            }
            _ => {}
        }
    }
    if let Some(receipt) = payment.receipt_id {
        let valid: bool=transaction.query_row("SELECT EXISTS(SELECT 1 FROM local_receipts WHERE id=?1 AND order_id=?2) OR EXISTS(SELECT 1 FROM local_sync_remote_entities WHERE entity_type='receipt' AND entity_id=?1 AND operation='upsert' AND json_extract(payload_json,'$.orderId')=?2)",params![receipt.to_string(),payment.order_id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        if !valid {
            return Ok(false);
        }
    }
    for attachment in payment.voucher_attachment_ids.as_deref().unwrap_or(&[]) {
        let order: Option<String> = transaction
            .query_row(
                "SELECT order_id FROM local_order_attachments WHERE id=?1 AND deleted_at IS NULL",
                [attachment.to_string()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        match order {
            None => return Ok(false),
            Some(order) if order != payment.order_id.to_string() => {
                return Err(AuthError::InvalidInput);
            }
            _ => {}
        }
    }
    if let Some(existing) = read_payment(transaction, payment.id)? {
        let mut incoming = payment.clone();
        if incoming.supplier_id.is_none() {
            incoming.supplier_id = existing.supplier_id;
        }
        // Legacy events omitted optional metadata; compare only fields they actually supplied.
        if incoming.receipt_id.is_none() {
            incoming.receipt_id = existing.receipt_id;
        }
        if incoming.counterparty_type.is_none() {
            incoming.counterparty_type = existing.counterparty_type.clone();
        }
        if incoming.counterparty_snapshot.is_none() {
            incoming.counterparty_snapshot = existing.counterparty_snapshot.clone();
        }
        if incoming.voucher_attachment_ids.is_none() {
            incoming.voucher_attachment_ids = existing.voucher_attachment_ids.clone();
        }
        if existing == incoming {
            return Ok(true);
        }
        if adopt_legacy_server_provenance(transaction, &existing, &incoming)? {
            return Ok(true);
        }
        return Err(AuthError::InvalidInput);
    }
    if let Some(original_id) = payment.corrects_expenditure_id {
        let Some(original) = read_payment(transaction, original_id)? else {
            return Ok(false);
        };
        if original.status != "recorded"
            || original.order_id != payment.order_id
            || original.project_id != payment.project_id
            || original.country_id != payment.country_id
            || original.currency != payment.currency
            || original.amount_minor != payment.amount_minor
            || original.payee_name != payment.payee_name
            || original.payment_date != payment.payment_date
            || original.payment_type != payment.payment_type
            || original.payment_method != payment.payment_method
            || payment.receipt_id.is_some() && payment.receipt_id != original.receipt_id
            || payment.counterparty_type.is_some()
                && payment.counterparty_type != original.counterparty_type
            || payment.counterparty_snapshot.is_some()
                && payment.counterparty_snapshot != original.counterparty_snapshot
        {
            return Err(AuthError::InvalidInput);
        }
    }
    transaction.execute("INSERT INTO local_procurement_expenditures (id,order_id,project_id,supplier_id,payee_name,currency,amount_minor,payment_date,payment_type,payment_method,payment_handler_id,voucher_reference,notes,status,corrects_expenditure_id,correction_reason,created_by,created_at,counterparty_type,counterparty_snapshot_json,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?18)",params![payment.id.to_string(),payment.order_id.to_string(),project,payment.supplier_id.map(|id|id.to_string()).or(supplier.clone()),payment.payee_name,payment.currency,amount,payment.payment_date,payment.payment_type,payment.payment_method,payment.payment_handler_id.to_string(),payment.voucher_reference,payment.notes,payment.status,payment.corrects_expenditure_id.map(|v|v.to_string()),payment.correction_reason,payment.created_by.to_string(),payment.created_at,payment.counterparty_type.as_deref().unwrap_or(if payment.supplier_id.is_some() || supplier.is_some() { "registered_supplier" } else { "market_casual" }),payment.counterparty_snapshot.as_ref().map(serde_json::to_string).transpose().map_err(|_|AuthError::Database)?.unwrap_or_else(||"{}".into())]).map_err(|_|AuthError::InvalidInput)?;
    persist_payload(transaction, payment)?;
    for attachment in payment.voucher_attachment_ids.as_deref().unwrap_or(&[]) {
        transaction.execute("INSERT OR IGNORE INTO local_procurement_expenditure_vouchers(expenditure_id,attachment_id) VALUES(?1,?2)",params![payment.id.to_string(),attachment.to_string()]).map_err(|_|AuthError::Database)?;
    }
    append_order_audit(
        transaction,
        payment.order_id,
        payment.created_by,
        if payment.status == "reversed" {
            "payment_reversed"
        } else {
            "payment_recorded"
        },
        payment.correction_reason.as_deref(),
        None,
        Some(&serde_json::to_string(payment).map_err(|_| AuthError::InvalidInput)?),
        UNIX_EPOCH + Duration::from_secs(payment.created_at as u64),
    )?;
    Ok(true)
}

fn adopt_legacy_server_provenance(
    transaction: &Transaction<'_>,
    existing: &PaymentPayload,
    incoming: &PaymentPayload,
) -> Result<bool, AuthError> {
    let journaled: bool=transaction.query_row("SELECT EXISTS(SELECT 1 FROM local_procurement_expenditure_sync_payloads WHERE expenditure_id=?1)",[existing.id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
    if journaled {
        return Ok(false);
    }
    let checksum = format!(
        "{:x}",
        Sha256::digest(include_str!("../migrations/0045_procurement_expenditures.sql").as_bytes())
    );
    let baseline: bool=transaction.query_row("SELECT EXISTS(SELECT 1 FROM local_schema_migrations WHERE version IN ('0045_procurement_expenditures','0044_procurement_expenditures') AND checksum=?1)",[checksum],|r|r.get(0)).map_err(|_|AuthError::Database)?;
    if !baseline {
        return Ok(false);
    }
    let mut comparison = incoming.clone();
    comparison.created_at = existing.created_at;
    let mut local = existing.clone();
    if let Some(ids) = comparison.voucher_attachment_ids.as_mut() {
        ids.sort();
    }
    if let Some(ids) = local.voucher_attachment_ids.as_mut() {
        ids.sort();
    }
    if comparison != local {
        return Ok(false);
    }
    let sources=transaction.prepare("SELECT payload_json FROM local_sync_outbox WHERE entity_type='procurement_expenditure' AND entity_id=?1 UNION ALL SELECT previous_json FROM local_order_audit_entries WHERE action='payment_sync_payload_migrated' AND json_extract(previous_json,'$.id')=?1").map_err(|_|AuthError::Database)?.query_map([existing.id.to_string()],|r|r.get::<_,String>(0)).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
    let canonical = serde_json::to_value(incoming).map_err(|_| AuthError::Database)?;
    let mut verified = false;
    for source in sources {
        let source: serde_json::Value =
            serde_json::from_str(&source).map_err(|_| AuthError::Database)?;
        if let Some(source) = source.as_object() {
            if !source.contains_key("createdAt")
                && !source.contains_key("createdBy")
                && source.contains_key("counterpartySnapshot")
                && source.iter().all(|(key, value)| {
                    if key == "receiptId" && value.is_null() {
                        return canonical.get(key).is_none_or(serde_json::Value::is_null);
                    }
                    if key == "voucherAttachmentIds" {
                        let mut expected = value.as_array().cloned().unwrap_or_default();
                        let mut actual = canonical
                            .get(key)
                            .and_then(serde_json::Value::as_array)
                            .cloned()
                            .unwrap_or_default();
                        expected.sort_by_key(serde_json::Value::to_string);
                        actual.sort_by_key(serde_json::Value::to_string);
                        return expected == actual;
                    }
                    canonical.get(key) == Some(value)
                })
            {
                verified = true;
                break;
            }
        }
    }
    if !verified {
        return Ok(false);
    }
    persist_payload(transaction, incoming)?;
    append_order_audit(
        transaction,
        existing.order_id,
        existing.created_by,
        "legacy_payment_server_provenance_adopted",
        Some("Server acceptance time is distinct from the preserved local creation time"),
        Some(&serde_json::to_string(existing).map_err(|_| AuthError::Database)?),
        Some(&canonical.to_string()),
        SystemTime::now(),
    )?;
    Ok(true)
}

pub(super) fn persist_payload(
    transaction: &Transaction<'_>,
    payment: &PaymentPayload,
) -> Result<(), AuthError> {
    validate(payment)?;
    transaction.execute("INSERT INTO local_procurement_expenditure_sync_payloads(expenditure_id,payload_json) VALUES(?1,?2)",params![payment.id.to_string(),serde_json::to_string(payment).map_err(|_|AuthError::Database)?]).map_err(|_|AuthError::Database)?;
    Ok(())
}

pub(super) fn project_staged(transaction: &Transaction<'_>) -> Result<(), AuthError> {
    let rows = transaction.prepare("SELECT entity_id,operation,payload_json,server_version FROM local_sync_remote_entities WHERE entity_type='procurement_expenditure' ORDER BY json_extract(payload_json,'$.status'),entity_id").map_err(|_|AuthError::Database)?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,i64>(3)?))).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
    for (id, operation, json, server_version) in rows {
        let payment: PaymentPayload =
            serde_json::from_str(&json).map_err(|_| AuthError::InvalidInput)?;
        if operation != "upsert" || payment.id.to_string() != id {
            return Err(AuthError::InvalidInput);
        }
        let defeated: bool = transaction.query_row("SELECT EXISTS(SELECT 1 FROM local_payment_conflict_decisions WHERE entity_id=?1 AND canonical_entity_id<>?1)",[payment.id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        if defeated {
            continue;
        }
        if let Some(original_id) = payment.corrects_expenditure_id {
            let decided: bool=transaction.query_row("SELECT EXISTS(SELECT 1 FROM local_payment_conflict_decisions WHERE canonical_entity_id=?1)",[payment.id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
            if decided {
                continue;
            }
            let losing:Option<(String,String,i64,String)>=transaction.query_row("SELECT e.id,o.event_id,o.base_version,o.payload_json FROM local_procurement_expenditures e JOIN local_sync_outbox o ON o.entity_type='procurement_expenditure' AND o.entity_id=e.id AND o.acknowledged_at IS NULL WHERE e.corrects_expenditure_id=?1 AND e.id<>?2 ORDER BY o.created_at,o.event_id LIMIT 1",params![original_id.to_string(),payment.id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|_|AuthError::Database)?;
            if let Some((local_id, event_id, base_version, local_payload)) = losing {
                let exists:bool=transaction.query_row("SELECT EXISTS(SELECT 1 FROM local_sync_conflicts WHERE event_id=?1 AND server_version=?2 AND json_extract(server_payload_json,'$.id')=?3)",params![event_id,server_version,payment.id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
                if !exists {
                    transaction.execute("INSERT INTO local_sync_conflicts (id,event_id,entity_type,entity_id,base_version,server_version,local_payload_json,server_payload_json,server_operation,created_at) VALUES (?1,?2,'procurement_expenditure',?3,?4,?5,?6,?7,'upsert',?8)",params![Uuid::new_v4().to_string(),event_id,local_id,base_version,server_version,local_payload,json,payment.created_at]).map_err(|_|AuthError::Database)?;
                }
                continue;
            }
        }
        insert_payment(transaction, &payment)?;
    }
    Ok(())
}

pub(super) fn reverse(
    service: &LocalAuthService,
    input: ReverseProcurementExpenditureInput,
    now: SystemTime,
) -> Result<ProcurementExpenditureView, AuthError> {
    if !service.require_order_mutation(now)? {
        return Err(AuthError::Forbidden);
    }
    if !valid_required_text(&input.reason, 1000) {
        return Err(AuthError::InvalidInput);
    }
    let actor = service.active_session_user_id()?;
    let original = read_payment(
        &*service.connection.lock().map_err(|_| AuthError::Database)?,
        input.expenditure_id,
    )?
    .ok_or(AuthError::InvalidInput)?;
    service.require_active_scope_for_order(original.order_id, now)?;
    if original.status != "recorded" {
        return Err(AuthError::InvalidInput);
    }
    let blocked: bool = service.connection.lock().map_err(|_|AuthError::Database)?.query_row("SELECT EXISTS(SELECT 1 FROM local_sync_conflicts c WHERE c.entity_type='procurement_expenditure' AND c.entity_id=?1 AND c.resolved_at IS NULL) OR EXISTS(SELECT 1 FROM local_payment_conflict_discovery c WHERE json_extract(c.payload_json,'$.entityId')=?1 AND NOT EXISTS(SELECT 1 FROM local_payment_conflict_decisions d WHERE d.conflict_id=c.conflict_id))",[original.id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
    if blocked {
        return Err(AuthError::InvalidInput);
    }
    let mut payment = original.clone();
    payment.id = input.id;
    payment.status = "reversed".into();
    payment.corrects_expenditure_id = Some(input.expenditure_id);
    payment.correction_reason = Some(input.reason);
    payment.created_by = actor;
    payment.created_at = unix_seconds(now);
    payment.voucher_reference = None;
    payment.voucher_attachment_ids = Some(vec![]);
    payment.notes = None;
    let mut connection = service.connection.lock().map_err(|_| AuthError::Database)?;
    let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
    require_order_write_scope(&transaction, payment.order_id, actor, now)?;
    if !insert_payment(&transaction, &payment)? {
        return Err(AuthError::InvalidInput);
    }
    let payload = serde_json::to_string(&payment).map_err(|_| AuthError::InvalidInput)?;
    insert_local_sync_outbox(
        &transaction,
        "procurement_expenditure",
        payment.id,
        &payload,
        now,
    )?;
    transaction.commit().map_err(|_| AuthError::Database)?;
    Ok(ProcurementExpenditureView {
        has_voucher: false,
        voucher_warning: true,
        id: payment.id,
        order_id: payment.order_id,
        payee_name: payment.payee_name,
        currency: payment.currency,
        amount_minor: payment.amount_minor,
        payment_date: payment.payment_date,
        payment_type: payment.payment_type,
        status: payment.status,
        voucher_reference: None,
        notes: payment.correction_reason,
        corrects_expenditure_id: payment.corrects_expenditure_id,
    })
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvePaymentConflictInput {
    pub conflict_id: Uuid,
    pub event_id: Uuid,
    pub reason: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CloudResolution {
    id: Uuid,
    resolved_by: Uuid,
    resolved_at: String,
    reason: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CloudConflict {
    conflict_id: Uuid,
    event_id: Uuid,
    entity_id: Uuid,
    server_version: i64,
    local_payload: serde_json::Value,
    server_payload: serde_json::Value,
    origin_account_id: Uuid,
    origin_installation_id: Uuid,
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolution: Option<CloudResolution>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CloudConflicts {
    conflicts: Vec<CloudConflict>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Decision {
    id: Uuid,
    conflict_id: Uuid,
    event_id: Uuid,
    action: String,
    reason: String,
    entity_id: Uuid,
    canonical_entity_id: Uuid,
    server_version: i64,
    local_payload: serde_json::Value,
    server_payload: serde_json::Value,
    canonical_payload: PaymentPayload,
    origin_account_id: Uuid,
    origin_installation_id: Uuid,
    order_id: Uuid,
    project_id: Uuid,
    country_id: Uuid,
    resolved_by: Uuid,
    resolved_at: String,
}
fn valid_utc(value: &str) -> bool {
    let Some(body) = value.strip_suffix('Z') else {
        return false;
    };
    if body.len() < 19 || body.len() > 29 || !body.get(..10).is_some_and(valid_iso_date) {
        return false;
    }
    let bytes = body.as_bytes();
    if bytes[10] != b'T' || bytes[13] != b':' || bytes[16] != b':' {
        return false;
    }
    for (start, max) in [(11, 23u8), (14, 59), (17, 59)] {
        let pair = &bytes[start..start + 2];
        if !pair.iter().all(u8::is_ascii_digit) || (pair[0] - b'0') * 10 + pair[1] - b'0' > max {
            return false;
        }
    }
    body.len() == 19
        || (bytes[19] == b'.' && body.len() > 20 && bytes[20..].iter().all(u8::is_ascii_digit))
}

fn raw_uuid(value: &serde_json::Value, key: &str) -> Result<Uuid, AuthError> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .and_then(|v| Uuid::parse_str(v).ok())
        .ok_or(AuthError::InvalidInput)
}
fn validate_raw_conflict(
    local: &serde_json::Value,
    winner: &serde_json::Value,
    entity: Uuid,
    version: i64,
) -> Result<(), AuthError> {
    for payment in [local, winner] {
        let currency = payment
            .get("currency")
            .and_then(serde_json::Value::as_str)
            .ok_or(AuthError::InvalidInput)?;
        let amount = payment
            .get("amountMinor")
            .and_then(serde_json::Value::as_str)
            .ok_or(AuthError::InvalidInput)?;
        let name = payment
            .get("payeeName")
            .and_then(serde_json::Value::as_str)
            .ok_or(AuthError::InvalidInput)?;
        let date = payment
            .get("paymentDate")
            .and_then(serde_json::Value::as_str)
            .ok_or(AuthError::InvalidInput)?;
        if !valid_currency(currency)
            || !valid_required_text(name, 500)
            || !valid_iso_date(date)
            || as_i64(parse_non_negative_minor(amount)?)? <= 0
        {
            return Err(AuthError::InvalidInput);
        }
    }
    if raw_uuid(local, "id")? != entity
        || raw_uuid(local, "orderId")? != raw_uuid(winner, "orderId")?
        || raw_uuid(local, "projectId")? != raw_uuid(winner, "projectId")?
        || version < 1
    {
        return Err(AuthError::InvalidInput);
    }
    if raw_uuid(winner, "id")? != entity
        && (local.get("status").and_then(serde_json::Value::as_str) != Some("reversed")
            || winner.get("status").and_then(serde_json::Value::as_str) != Some("reversed")
            || local.get("correctsExpenditureId") != winner.get("correctsExpenditureId"))
    {
        return Err(AuthError::InvalidInput);
    }
    Ok(())
}
fn validate_conflict(
    local: &PaymentPayload,
    winner: &PaymentPayload,
    entity: Uuid,
    version: i64,
    origin: Uuid,
) -> Result<(), AuthError> {
    validate(local)?;
    validate(winner)?;
    if local.id != entity
        || local.created_by != origin
        || version < 1
        || local.order_id != winner.order_id
        || local.project_id != winner.project_id
        || local.country_id != winner.country_id
        || local.currency != winner.currency
        || (local.id != winner.id
            && (local.status != "reversed"
                || winner.status != "reversed"
                || local.corrects_expenditure_id != winner.corrects_expenditure_id))
    {
        return Err(AuthError::InvalidInput);
    }
    Ok(())
}
fn payment_admin(connection: &LocalConnection, now: SystemTime) -> Result<Uuid, AuthError> {
    let actor = LocalAuthService::require_conflict_resolution(connection, now)?;
    let roles: String = connection
        .query_row(
            "SELECT roles_json FROM local_accounts WHERE id=?1",
            [actor.to_string()],
            |r| r.get(0),
        )
        .map_err(|_| AuthError::Database)?;
    if !serde_json::from_str::<Vec<Role>>(&roles)
        .map_err(|_| AuthError::Database)?
        .contains(&Role::Administrator)
    {
        return Err(AuthError::Forbidden);
    }
    Ok(actor)
}
fn cache_conflicts(
    tx: &Transaction<'_>,
    actor: Uuid,
    rows: Vec<CloudConflict>,
    now: SystemTime,
) -> Result<(), AuthError> {
    if rows.len() > 500 {
        return Err(AuthError::InvalidInput);
    }
    let retained = serde_json::to_string(
        &rows
            .iter()
            .map(|r| r.conflict_id.to_string())
            .collect::<Vec<_>>(),
    )
    .map_err(|_| AuthError::Database)?;
    for row in rows {
        validate_raw_conflict(
            &row.local_payload,
            &row.server_payload,
            row.entity_id,
            row.server_version,
        )?;
        if row
            .local_payload
            .get("createdBy")
            .is_some_and(|v| v.as_str() != Some(row.origin_account_id.to_string().as_str()))
        {
            return Err(AuthError::InvalidInput);
        }
        if !valid_utc(&row.created_at)
            || row.resolution.as_ref().is_some_and(|r| {
                !valid_utc(&r.resolved_at) || !valid_required_text(&r.reason, 1000)
            })
        {
            return Err(AuthError::InvalidInput);
        }
        require_order_write_scope(tx, raw_uuid(&row.local_payload, "orderId")?, actor, now)?;
        let prior: Option<String>=tx.query_row("SELECT payload_json FROM local_payment_conflict_discovery WHERE account_id=?1 AND conflict_id=?2",params![actor.to_string(),row.conflict_id.to_string()],|r|r.get(0)).optional().map_err(|_|AuthError::Database)?;
        if let Some(prior) = prior {
            let mut previous: CloudConflict =
                serde_json::from_str(&prior).map_err(|_| AuthError::Database)?;
            previous.resolution = row.resolution.clone();
            if serde_json::to_value(previous).map_err(|_| AuthError::Database)?
                != serde_json::to_value(&row).map_err(|_| AuthError::Database)?
            {
                return Err(AuthError::InvalidInput);
            }
        }
        tx.execute("INSERT INTO local_payment_conflict_discovery(account_id,conflict_id,payload_json) VALUES(?1,?2,?3) ON CONFLICT(account_id,conflict_id) DO UPDATE SET payload_json=excluded.payload_json",params![actor.to_string(),row.conflict_id.to_string(),serde_json::to_string(&row).map_err(|_|AuthError::Database)?]).map_err(|_|AuthError::Database)?;
    }
    tx.execute("DELETE FROM local_payment_conflict_discovery WHERE account_id=?1 AND conflict_id NOT IN (SELECT value FROM json_each(?2))",params![actor.to_string(),retained]).map_err(|_|AuthError::Database)?;
    Ok(())
}
fn cached_conflicts(
    connection: &LocalConnection,
    now: SystemTime,
) -> Result<Vec<SyncConflictView>, AuthError> {
    let actor = payment_admin(connection, now)?;
    let rows=connection.prepare("SELECT payload_json FROM local_payment_conflict_discovery WHERE account_id=?1 ORDER BY conflict_id").map_err(|_|AuthError::Database)?.query_map([actor.to_string()],|r|r.get::<_,String>(0)).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
    let mut views = Vec::new();
    for json in rows {
        let row: CloudConflict = serde_json::from_str(&json).map_err(|_| AuthError::Database)?;
        if require_order_write_scope(
            connection,
            raw_uuid(&row.local_payload, "orderId")?,
            actor,
            now,
        )
        .is_err()
        {
            continue;
        }
        let decision: Option<String> = connection
            .query_row(
                "SELECT payload_json FROM local_payment_conflict_decisions WHERE conflict_id=?1",
                [row.conflict_id.to_string()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        let decision = decision
            .map(|v| serde_json::from_str::<Decision>(&v).map_err(|_| AuthError::Database))
            .transpose()?;
        let pending: bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM local_sync_outbox WHERE owner_account_id=?1 AND entity_type='payment_conflict_resolution' AND json_extract(payload_json,'$.conflictId')=?2 AND superseded_at IS NULL AND rejected_at IS NULL)",params![actor.to_string(),row.conflict_id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        views.push(SyncConflictView {
            id: row.conflict_id,
            event_id: Some(row.event_id),
            entity_type: "procurement_expenditure".into(),
            entity_id: row.entity_id,
            server_version: row.server_version,
            local_payload_json: serde_json::to_string(&row.local_payload)
                .map_err(|_| AuthError::Database)?,
            server_payload_json: serde_json::to_string(&row.server_payload)
                .map_err(|_| AuthError::Database)?,
            server_operation: "upsert".into(),
            payment_resolution_state: if decision.is_some() {
                Some("confirmed".into())
            } else if pending {
                Some("pending".into())
            } else {
                None
            },
            resolved_by: decision.as_ref().map(|d| d.resolved_by),
            resolved_at: decision.as_ref().map(|d| d.resolved_at.clone()),
            resolution_reason: decision.map(|d| d.reason),
        });
    }
    Ok(views)
}
impl LocalAuthService {
    pub async fn list_payment_sync_conflicts(
        &self,
        now: SystemTime,
    ) -> Result<Vec<SyncConflictView>, AuthError> {
        match self.fetch_payment_sync_conflicts(now).await {
            Err(AuthError::SyncTransport) => cached_conflicts(
                &*self.connection.lock().map_err(|_| AuthError::Database)?,
                now,
            ),
            result => result,
        }
    }
    async fn fetch_payment_sync_conflicts(
        &self,
        now: SystemTime,
    ) -> Result<Vec<SyncConflictView>, AuthError> {
        payment_admin(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            now,
        )?;
        let request = match self.sync_request(now) {
            Ok(v) => v,
            Err(AuthError::NoActiveSession) => {
                return cached_conflicts(
                    &*self.connection.lock().map_err(|_| AuthError::Database)?,
                    now,
                );
            }
            Err(e) => return Err(e),
        };
        self.refresh_authorization_for_session(&request, now)
            .await?;
        let base =
            std::env::var("HONSEN_SYNC_API_BASE_URL").map_err(|_| AuthError::SyncTransport)?;
        let response = self
            .https_client()?
            .get(sync_endpoint_from(&base, "payment-conflicts")?)
            .bearer_auth(&request.token)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            request.session,
        )?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.reject_sync_session(request.session)?;
        }
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(AuthError::Forbidden);
        }
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        self.verify_test_sync_origin(&response)?;
        let rows = response
            .json::<CloudConflicts>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        Self::require_request_session(&connection, request.session)?;
        let actor = payment_admin(&connection, now)?;
        let tx = connection.transaction().map_err(|_| AuthError::Database)?;
        cache_conflicts(&tx, actor, rows.conflicts, now)?;
        tx.commit().map_err(|_| AuthError::Database)?;
        cached_conflicts(&connection, now)
    }
    pub fn resolve_payment_sync_conflict(
        &self,
        input: ResolvePaymentConflictInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if !valid_required_text(&input.reason, 1000) {
            return Err(AuthError::InvalidInput);
        }
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let actor = payment_admin(&connection, now)?;
        let tx = connection.transaction().map_err(|_| AuthError::Database)?;
        let json: String=tx.query_row("SELECT payload_json FROM local_payment_conflict_discovery WHERE account_id=?1 AND conflict_id=?2",params![actor.to_string(),input.conflict_id.to_string()],|r|r.get(0)).optional().map_err(|_|AuthError::Database)?.ok_or(AuthError::Forbidden)?;
        let row: CloudConflict = serde_json::from_str(&json).map_err(|_| AuthError::Database)?;
        if row.event_id != input.event_id || row.resolution.is_some() {
            return Err(AuthError::InvalidInput);
        }
        require_order_write_scope(&tx, raw_uuid(&row.local_payload, "orderId")?, actor, now)?;
        let exists: bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM local_payment_conflict_decisions WHERE conflict_id=?1) OR EXISTS(SELECT 1 FROM local_sync_outbox WHERE owner_account_id=?2 AND entity_type='payment_conflict_resolution' AND json_extract(payload_json,'$.conflictId')=?1 AND superseded_at IS NULL AND rejected_at IS NULL)",params![input.conflict_id.to_string(),actor.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        if exists {
            return Err(AuthError::InvalidInput);
        }
        let id = Uuid::new_v4();
        let payload=serde_json::json!({"id":id,"conflictId":input.conflict_id,"eventId":input.event_id,"action":"use_server","reason":input.reason}).to_string();
        insert_local_sync_outbox(&tx, "payment_conflict_resolution", id, &payload, now)?;
        append_order_audit(
            &tx,
            raw_uuid(&row.local_payload, "orderId")?,
            actor,
            "payment_conflict_resolution_queued",
            Some(&input.reason),
            None,
            Some(&payload),
            now,
        )?;
        tx.commit().map_err(|_| AuthError::Database)
    }
}
pub(super) fn project_decisions(tx: &Transaction<'_>, now: SystemTime) -> Result<(), AuthError> {
    let rows=tx.prepare("SELECT entity_id,operation,payload_json FROM local_sync_remote_entities WHERE entity_type='payment_conflict_resolution' ORDER BY source_cursor,entity_id").map_err(|_|AuthError::Database)?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?))).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
    for (id, operation, json) in rows {
        let d: Decision = serde_json::from_str(&json).map_err(|_| AuthError::InvalidInput)?;
        validate_raw_conflict(
            &d.local_payload,
            &d.server_payload,
            d.entity_id,
            d.server_version,
        )?;
        if d.local_payload
            .get("createdBy")
            .is_some_and(|v| v.as_str() != Some(d.origin_account_id.to_string().as_str()))
        {
            return Err(AuthError::InvalidInput);
        }
        validate(&d.canonical_payload)?;
        if raw_uuid(&d.server_payload, "id")? != d.canonical_payload.id
            || raw_uuid(&d.server_payload, "orderId")? != d.canonical_payload.order_id
            || raw_uuid(&d.server_payload, "projectId")? != d.canonical_payload.project_id
        {
            return Err(AuthError::InvalidInput);
        }
        let canonical_json =
            serde_json::to_value(&d.canonical_payload).map_err(|_| AuthError::Database)?;
        if !d
            .server_payload
            .as_object()
            .ok_or(AuthError::InvalidInput)?
            .iter()
            .all(|(key, value)| {
                canonical_json.get(key).unwrap_or(&serde_json::Value::Null) == value
            })
        {
            return Err(AuthError::InvalidInput);
        }
        if d.id.to_string() != id
            || operation != "upsert"
            || d.action != "use_server"
            || !valid_required_text(&d.reason, 1000)
            || !valid_utc(&d.resolved_at)
            || d.canonical_entity_id != d.canonical_payload.id
            || d.order_id != d.canonical_payload.order_id
            || d.project_id != d.canonical_payload.project_id
            || d.country_id != d.canonical_payload.country_id
        {
            return Err(AuthError::InvalidInput);
        }
        let order: bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM local_purchase_orders WHERE id=?1 AND project_id=?2 AND country_id=?3)",params![d.order_id.to_string(),d.project_id.to_string(),d.country_id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
        if !order {
            continue;
        }
        let old: Option<String> = tx
            .query_row(
                "SELECT payload_json FROM local_payment_conflict_decisions WHERE conflict_id=?1",
                [d.conflict_id.to_string()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        if let Some(old) = old {
            if serde_json::from_str::<serde_json::Value>(&old).map_err(|_| AuthError::Database)?
                != serde_json::from_str::<serde_json::Value>(&json)
                    .map_err(|_| AuthError::Database)?
            {
                return Err(AuthError::InvalidInput);
            }
            continue;
        }
        let canonical: Option<String>=tx.query_row("SELECT json_extract(payload_json,'$.canonicalPayload') FROM local_payment_conflict_decisions WHERE canonical_entity_id=?1 LIMIT 1",[d.canonical_entity_id.to_string()],|r|r.get(0)).optional().map_err(|_|AuthError::Database)?;
        if canonical.is_some_and(|value| {
            serde_json::from_str::<PaymentPayload>(&value).ok().as_ref()
                != Some(&d.canonical_payload)
        }) {
            return Err(AuthError::InvalidInput);
        }
        tx.execute("INSERT INTO local_payment_conflict_decisions(id,conflict_id,event_id,entity_id,canonical_entity_id,payload_json) VALUES(?1,?2,?3,?4,?5,?6)",params![id,d.conflict_id.to_string(),d.event_id.to_string(),d.entity_id.to_string(),d.canonical_entity_id.to_string(),json]).map_err(|_|AuthError::Database)?;
        tx.execute("UPDATE local_sync_outbox SET superseded_at=COALESCE(superseded_at,?3),last_error='payment_conflict_use_server' WHERE event_id=?1 AND owner_account_id=?2 AND entity_type='procurement_expenditure'",params![d.event_id.to_string(),d.origin_account_id.to_string(),unix_seconds(now)]).map_err(|_|AuthError::Database)?;
        tx.execute("UPDATE local_sync_conflicts SET resolved_at=?3,resolved_by=?4,resolution_reason=?5 WHERE event_id=?1 AND EXISTS(SELECT 1 FROM local_sync_outbox o WHERE o.event_id=local_sync_conflicts.event_id AND o.owner_account_id=?2)",params![d.event_id.to_string(),d.origin_account_id.to_string(),unix_seconds(now),d.resolved_by.to_string(),d.reason]).map_err(|_|AuthError::Database)?;
        append_order_audit(
            tx,
            d.order_id,
            d.resolved_by,
            "payment_conflict_resolution_confirmed",
            Some(&d.reason),
            Some(&serde_json::to_string(&d.local_payload).map_err(|_| AuthError::Database)?),
            Some(&json),
            now,
        )?;
    }
    Ok(())
}
pub(super) fn recover_rejected_reversals(
    tx: &Transaction<'_>,
    actor: Uuid,
    now: SystemTime,
) -> Result<(), AuthError> {
    let rows=tx.prepare("SELECT o.event_id,o.payload_json FROM local_sync_outbox o WHERE o.entity_type='procurement_expenditure' AND o.owner_account_id=?1 AND o.acknowledged_at IS NULL AND o.last_error='VALIDATION_ERROR' AND (o.rejected_at IS NOT NULL OR o.superseded_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM local_payment_conflict_recovery r WHERE r.event_id=o.event_id) AND NOT EXISTS(SELECT 1 FROM local_payment_conflict_decisions d WHERE d.event_id=o.event_id) AND NOT EXISTS(SELECT 1 FROM local_payment_conflict_discovery d WHERE json_extract(d.payload_json,'$.eventId')=o.event_id)").map_err(|_|AuthError::Database)?.query_map([actor.to_string()],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
    for (event, json) in rows {
        let local: PaymentPayload = serde_json::from_str(&json).map_err(|_| AuthError::Database)?;
        if local.status != "reversed"
            || local.created_by != actor
            || read_payment(tx, local.id)?.as_ref() != Some(&local)
        {
            continue;
        }
        if require_order_write_scope(tx, local.order_id, actor, now).is_err() {
            continue;
        }
        let winners=tx.prepare("SELECT payload_json FROM local_sync_remote_entities WHERE entity_type='procurement_expenditure' AND operation='upsert' AND entity_id<>?1 AND json_extract(payload_json,'$.correctsExpenditureId')=?2").map_err(|_|AuthError::Database)?.query_map(params![local.id.to_string(),local.corrects_expenditure_id.map(|v|v.to_string())],|r|r.get::<_,String>(0)).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
        for winner in winners {
            let winner: PaymentPayload =
                serde_json::from_str(&winner).map_err(|_| AuthError::InvalidInput)?;
            validate_conflict(&local, &winner, local.id, 1, actor)?;
            if local.amount_minor != winner.amount_minor
                || local.payment_date != winner.payment_date
                || local.payee_name != winner.payee_name
            {
                return Err(AuthError::InvalidInput);
            }
            tx.execute("INSERT INTO local_payment_conflict_recovery(event_id,owner_account_id,original_payload_json,recovered_at) VALUES(?1,?2,?3,?4)",params![event,actor.to_string(),json,unix_seconds(now)]).map_err(|_|AuthError::Database)?;
            tx.execute("UPDATE local_sync_outbox SET rejected_at=NULL,superseded_at=NULL,last_error='payment_conflict_attestation_retry' WHERE event_id=?1 AND owner_account_id=?2",params![event,actor.to_string()]).map_err(|_|AuthError::Database)?;
            append_order_audit(
                tx,
                local.order_id,
                actor,
                "payment_conflict_attestation_retry",
                Some("Retry the original rejected event once to obtain a server conflict"),
                Some(&json),
                Some(&json),
                now,
            )?;
            break;
        }
    }
    Ok(())
}

pub(super) fn effective_records(
    connection: &Connection,
    order_id: Uuid,
) -> Result<Vec<ProcurementExpenditureView>, AuthError> {
    let ids=connection.prepare("SELECT id FROM local_procurement_expenditures WHERE order_id=?1 UNION SELECT canonical_entity_id FROM local_payment_conflict_decisions WHERE json_extract(payload_json,'$.orderId')=?1 ORDER BY 1").map_err(|_|AuthError::Database)?.query_map([order_id.to_string()],|r|r.get::<_,String>(0)).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
    let mut records = Vec::new();
    for id in ids {
        let id = Uuid::parse_str(&id).map_err(|_| AuthError::Database)?;
        if let Some(p) = read_payment(connection, id)? {
            let has_voucher:bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM local_attachment_transfers WHERE owner_type='procurement_expenditure' AND owner_id=?1) OR EXISTS(SELECT 1 FROM local_procurement_expenditure_vouchers WHERE expenditure_id=?1)",[id.to_string()],|r|r.get(0)).map_err(|_|AuthError::Database)?;
            let has_voucher = has_voucher
                || p.voucher_attachment_ids
                    .as_ref()
                    .is_some_and(|ids| !ids.is_empty());
            records.push(ProcurementExpenditureView {
                id,
                order_id,
                payee_name: p.payee_name,
                currency: p.currency,
                amount_minor: p.amount_minor,
                payment_date: p.payment_date,
                payment_type: p.payment_type,
                status: p.status,
                voucher_reference: p.voucher_reference,
                notes: p.notes,
                corrects_expenditure_id: p.corrects_expenditure_id,
                has_voucher,
                voucher_warning: !has_voucher,
            });
        }
    }
    records.sort_by(|a, b| a.payment_date.cmp(&b.payment_date).then(a.id.cmp(&b.id)));
    Ok(records)
}

#[cfg(test)]
mod resolution_tests {
    use super::*;
    fn login(service: &LocalAuthService, actor: Uuid, role: Role, now: SystemTime) {
        service
            .cache_verified_account(
                CachedAccount {
                    id: actor,
                    username: actor.to_string(),
                    roles: vec![role],
                    enabled: true,
                    requires_password_change: false,
                },
                "synthetic-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        let answer = captcha
            .question
            .split_whitespace()
            .filter_map(|s| s.parse::<u8>().ok())
            .sum();
        service
            .offline_login(
                &actor.to_string(),
                "synthetic-password",
                captcha.id,
                answer,
                now,
            )
            .unwrap();
    }
    fn fixture(path: &Path, actor: Uuid, now: SystemTime) -> (LocalAuthService, PaymentPayload) {
        let service = LocalAuthService::open(
            Connection::open(path).unwrap(),
            Box::new(MemoryCredentialVault::new()),
            path.with_extension("media"),
            None,
        )
        .unwrap();
        login(&service, actor, Role::Administrator, now);
        let country = Uuid::new_v4();
        tests::grant_new_test_scope(&service, actor, country, now);
        let order = Uuid::new_v4();
        let c = service.connection.lock().unwrap();
        let (project,department,team):(String,String,String)=c.query_row("SELECT project_id,department_id,team_id FROM local_authorization_snapshots WHERE account_id=?1",[actor.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        c.execute("INSERT INTO local_purchase_orders(id,display_no,country_id,project_id,site,department_id,team_id,applicant_id,currency,primary_currency,language_pair,status,workflow_status,urgency,order_date,delivery_address,subtotal_minor,line_discount_minor,order_discount_minor,freight_minor,tax_rate_basis_points,tax_minor,total_minor,version,created_at,updated_at,procurement_mode) VALUES(?1,'PAYMENT',?2,?3,'fixture',?4,?5,?6,'XOF','XOF','zh_fr','pending_confirmation','executing','normal','2026-10-24','fixture',1000,0,0,0,0,0,1000,1,0,0,'honsen_self_purchase')",params![order.to_string(),country.to_string(),project,department,team,actor.to_string()]).unwrap();
        drop(c);
        let p:PaymentPayload=serde_json::from_value(serde_json::json!({"id":Uuid::new_v4(),"orderId":order,"projectId":project,"countryId":country,"payeeName":"Synthetic payee","currency":"XOF","amountMinor":"100","paymentDate":"2026-10-24","paymentType":"progress","paymentMethod":"cash","paymentHandlerId":actor,"status":"recorded","createdBy":actor,"createdAt":unix_seconds(now)})).unwrap();
        let mut c = service.connection.lock().unwrap();
        let tx = c.transaction().unwrap();
        insert_payment(&tx, &p).unwrap();
        tx.commit().unwrap();
        drop(c);
        (service, p)
    }
    fn cloud(local: &PaymentPayload, winner: &PaymentPayload) -> CloudConflict {
        CloudConflict {
            conflict_id: Uuid::new_v4(),
            event_id: Uuid::new_v4(),
            entity_id: local.id,
            server_version: 1,
            local_payload: serde_json::to_value(local).unwrap(),
            server_payload: serde_json::to_value(winner).unwrap(),
            origin_account_id: local.created_by,
            origin_installation_id: Uuid::new_v4(),
            created_at: "2026-10-24T00:00:00Z".into(),
            resolution: None,
        }
    }
    fn decision(row: &CloudConflict, winner: &PaymentPayload, actor: Uuid) -> Decision {
        Decision {
            id: Uuid::new_v4(),
            conflict_id: row.conflict_id,
            event_id: row.event_id,
            action: "use_server".into(),
            reason: "Verified original records".into(),
            entity_id: row.entity_id,
            canonical_entity_id: winner.id,
            server_version: 1,
            local_payload: row.local_payload.clone(),
            server_payload: row.server_payload.clone(),
            canonical_payload: winner.clone(),
            origin_account_id: row.origin_account_id,
            origin_installation_id: row.origin_installation_id,
            order_id: winner.order_id,
            project_id: winner.project_id,
            country_id: winner.country_id,
            resolved_by: actor,
            resolved_at: "2026-10-24T00:00:00Z".into(),
        }
    }
    fn stage(service: &LocalAuthService, d: &Decision, cursor: &str) -> Result<(), AuthError> {
        service.apply_sync_pull_page(
            SyncPullPageInput {
                next_cursor: cursor.into(),
                changes: vec![SyncPullChangeInput {
                    cursor: cursor.into(),
                    entity_type: "payment_conflict_resolution".into(),
                    entity_id: d.id,
                    operation: "upsert".into(),
                    version: 1,
                    payload: serde_json::to_value(d).unwrap(),
                    changed_at: d.resolved_at.clone(),
                }],
            },
            SystemTime::now(),
        )
    }
    #[test]
    fn payment_conflict_queue_other_creator_pending_restart_role_scope_and_rollback() {
        let now = SystemTime::now();
        let actor = Uuid::new_v4();
        let path =
            std::env::temp_dir().join(format!("payment-resolution-{}.test.sqlite", Uuid::new_v4()));
        let (service, local) = fixture(&path, actor, now);
        let mut winner = local.clone();
        winner.amount_minor = "200".into();
        let mut row = cloud(&local, &winner);
        row.origin_account_id = Uuid::new_v4();
        row.local_payload["createdBy"] = serde_json::json!(row.origin_account_id);
        {
            let mut c = service.connection.lock().unwrap();
            let tx = c.transaction().unwrap();
            cache_conflicts(&tx, actor, vec![row.clone()], now).unwrap();
            tx.commit().unwrap();
        }
        let request = ResolvePaymentConflictInput {
            conflict_id: row.conflict_id,
            event_id: row.event_id,
            reason: "Verified records".into(),
        };
        assert!(
            service
                .reverse_procurement_expenditure(
                    ReverseProcurementExpenditureInput {
                        id: Uuid::new_v4(),
                        expenditure_id: local.id,
                        reason: "Unresolved original".into()
                    },
                    now
                )
                .is_err()
        );
        service
            .resolve_payment_sync_conflict(request.clone(), now)
            .unwrap();
        assert_eq!(
            cached_conflicts(&*service.connection.lock().unwrap(), now).unwrap()[0]
                .payment_resolution_state
                .as_deref(),
            Some("pending")
        );
        assert!(
            service
                .resolve_payment_sync_conflict(request.clone(), now)
                .is_err()
        );
        assert_eq!(
            read_payment(&*service.connection.lock().unwrap(), local.id)
                .unwrap()
                .unwrap()
                .amount_minor,
            "100"
        );
        let events = service.pending_sync_events(100, now).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].entity_type, "payment_conflict_resolution");
        service
            .apply_sync_acknowledgements(
                vec![SyncAcknowledgementInput {
                    event_id: events[0].event_id,
                    status: "accepted".into(),
                    server_version: Some(1),
                    server_payload: None,
                    server_operation: None,
                    error_code: None,
                }],
                now,
            )
            .unwrap();
        assert_eq!(
            cached_conflicts(&*service.connection.lock().unwrap(), now).unwrap()[0]
                .payment_resolution_state
                .as_deref(),
            Some("pending")
        );
        drop(service);
        let service = LocalAuthService::open(
            Connection::open(&path).unwrap(),
            Box::new(MemoryCredentialVault::new()),
            path.with_extension("media"),
            None,
        )
        .unwrap();
        login(&service, actor, Role::Administrator, now);
        assert_eq!(
            cached_conflicts(&*service.connection.lock().unwrap(), now).unwrap()[0]
                .payment_resolution_state
                .as_deref(),
            Some("pending")
        );
        let voucher = Uuid::new_v4();
        {
            let c = service.connection.lock().unwrap();
            c.execute("INSERT INTO local_order_attachments(id,order_id,original_name,content_type,byte_length,local_path,created_at) VALUES(?1,?2,'synthetic.pdf','application/pdf',1,'synthetic',0)",params![voucher.to_string(),local.order_id.to_string()]).unwrap();
            c.execute("INSERT INTO local_procurement_expenditure_vouchers(expenditure_id,attachment_id) VALUES(?1,?2)",params![local.id.to_string(),voucher.to_string()]).unwrap();
        }
        let d = decision(&row, &winner, actor);
        *service.test_fail_before_pull_cursor_write.lock().unwrap() = true;
        assert!(stage(&service, &d, "1").is_err());
        assert_eq!(
            read_payment(&*service.connection.lock().unwrap(), local.id)
                .unwrap()
                .unwrap()
                .amount_minor,
            "100"
        );
        stage(&service, &d, "1").unwrap();
        stage(&service, &d, "1").unwrap();
        assert_eq!(
            read_payment(&*service.connection.lock().unwrap(), local.id)
                .unwrap()
                .unwrap()
                .amount_minor,
            "200"
        );
        assert_eq!(
            cached_conflicts(&*service.connection.lock().unwrap(), now).unwrap()[0]
                .payment_resolution_state
                .as_deref(),
            Some("confirmed")
        );
        {
            let c = service.connection.lock().unwrap();
            assert_eq!(
                c.query_row(
                    "SELECT amount_minor FROM local_procurement_expenditures WHERE id=?1",
                    [local.id.to_string()],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
                100
            );
            assert!(
                c.execute(
                    "UPDATE local_payment_conflict_decisions SET payload_json='{}'",
                    []
                )
                .is_err()
            );
            assert!(
                c.execute("DELETE FROM local_payment_conflict_decisions", [])
                    .is_err()
            );
        }
        service
            .reverse_procurement_expenditure(
                ReverseProcurementExpenditureInput {
                    id: Uuid::new_v4(),
                    expenditure_id: local.id,
                    reason: "Correct actual payment".into(),
                },
                now,
            )
            .unwrap();
        assert_eq!(
            service.list_confirmed_procurement_orders(now).unwrap()[0]
                .payment_summary
                .paid_minor,
            "0"
        );
        assert_eq!(service.connection.lock().unwrap().query_row("SELECT attachment_id FROM local_procurement_expenditure_vouchers WHERE expenditure_id=?1",[local.id.to_string()],|r|r.get::<_,String>(0)).unwrap(),voucher.to_string());
        {
            let mut c = service.connection.lock().unwrap();
            let tx = c.transaction().unwrap();
            cache_conflicts(&tx, actor, vec![], now).unwrap();
            tx.commit().unwrap();
            assert!(cached_conflicts(&c, now).unwrap().is_empty());
        }
        let mut tampered = d.clone();
        tampered.canonical_payload.amount_minor = "999".into();
        assert!(stage(&service, &tampered, "2").is_err());
        let outsider = Uuid::new_v4();
        login(&service, outsider, Role::Administrator, now);
        assert!(
            cached_conflicts(&*service.connection.lock().unwrap(), now)
                .unwrap()
                .is_empty()
        );
        assert!(
            service
                .resolve_payment_sync_conflict(request.clone(), now)
                .is_err()
        );
        login(&service, actor, Role::Purchaser, now);
        assert!(
            service
                .resolve_payment_sync_conflict(request.clone(), now)
                .is_err()
        );
        login(&service, actor, Role::Administrator, now);
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "DELETE FROM local_authorization_snapshots WHERE account_id=?1",
                [actor.to_string()],
            )
            .unwrap();
        assert!(
            cached_conflicts(&*service.connection.lock().unwrap(), now)
                .unwrap()
                .is_empty()
        );
        assert!(service.resolve_payment_sync_conflict(request, now).is_err());
        drop(service);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn payment_conflict_distinct_reversal_owned_retry_once_and_two_sqlite_effective_ledger() {
        let actor = Uuid::new_v4();
        let now = SystemTime::now();
        let path = std::env::temp_dir().join(format!("payment-two-{}.test.sqlite", Uuid::new_v4()));
        let (service, base) = fixture(&path, actor, now);
        let reversal = service
            .reverse_procurement_expenditure(
                ReverseProcurementExpenditureInput {
                    id: Uuid::new_v4(),
                    expenditure_id: base.id,
                    reason: "Synthetic correction".into(),
                },
                now,
            )
            .unwrap();
        let local = read_payment(&*service.connection.lock().unwrap(), reversal.id)
            .unwrap()
            .unwrap();
        let mut winner = local.clone();
        winner.id = Uuid::new_v4();
        let event = service.pending_sync_events(100, now).unwrap()[0].event_id;
        service
            .apply_sync_acknowledgements(
                vec![SyncAcknowledgementInput {
                    event_id: event,
                    status: "validation_error".into(),
                    server_version: None,
                    server_payload: None,
                    server_operation: None,
                    error_code: None,
                }],
                now,
            )
            .unwrap();
        service
            .apply_sync_pull_page(
                SyncPullPageInput {
                    next_cursor: "1".into(),
                    changes: vec![SyncPullChangeInput {
                        cursor: "1".into(),
                        entity_type: "procurement_expenditure".into(),
                        entity_id: winner.id,
                        operation: "upsert".into(),
                        version: 1,
                        payload: serde_json::to_value(&winner).unwrap(),
                        changed_at: "2026-10-24T00:00:00Z".into(),
                    }],
                },
                now,
            )
            .unwrap();
        assert_eq!(
            service.pending_sync_events(100, now).unwrap()[0].event_id,
            event
        );
        service
            .apply_sync_acknowledgements(
                vec![SyncAcknowledgementInput {
                    event_id: event,
                    status: "conflict".into(),
                    server_version: Some(1),
                    server_payload: Some(serde_json::to_value(&winner).unwrap()),
                    server_operation: Some("upsert".into()),
                    error_code: None,
                }],
                now,
            )
            .unwrap();
        assert!(service.pending_sync_events(100, now).unwrap().is_empty());
        let mut row = cloud(&local, &winner);
        row.event_id = event;
        let d = decision(&row, &winner, actor);
        stage(&service, &d, "2").unwrap();
        let targets = service.list_attachment_targets(base.order_id, now).unwrap();
        assert!(targets.iter().any(|target| target.owner_id == winner.id));
        assert!(!targets.iter().any(|target| target.owner_id == local.id));
        let voucher = Uuid::new_v4();
        service
            .import_attachment(
                attachments::AttachmentInput {
                    id: voucher,
                    order_id: base.order_id,
                    owner_type: "procurement_expenditure".into(),
                    owner_id: winner.id,
                    original_name: "reconciled-voucher.pdf".into(),
                    content_type: "application/pdf".into(),
                    data_base64: BASE64.encode(b"%PDF-1.4 synthetic reconciled voucher"),
                },
                now,
            )
            .unwrap();
        assert!(
            read_payment(&*service.connection.lock().unwrap(), local.id)
                .unwrap()
                .is_none()
        );
        assert_eq!(
            service.list_confirmed_procurement_orders(now).unwrap()[0]
                .payment_summary
                .paid_minor,
            "0"
        );
        let c = service.connection.lock().unwrap();
        assert_eq!(
            c.query_row(
                "SELECT COUNT(*) FROM local_procurement_expenditures",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            2
        );
        assert_eq!(
            c.query_row(
                "SELECT COUNT(*) FROM local_payment_conflict_recovery",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        drop(c);
        let other = path.with_extension("second.sqlite");
        let first_installation = service.test_installation_id().unwrap();
        drop(service);
        std::fs::copy(&path, &other).unwrap();
        {
            let c = Connection::open(&other).unwrap();
            c.execute(
                "UPDATE local_sync_state SET installation_id=?1",
                [Uuid::new_v4().to_string()],
            )
            .unwrap();
        }
        let second = LocalAuthService::open(
            Connection::open(&other).unwrap(),
            Box::new(MemoryCredentialVault::new()),
            other.with_extension("media"),
            None,
        )
        .unwrap();
        login(&second, actor, Role::Administrator, now);
        assert_ne!(first_installation, second.test_installation_id().unwrap());
        stage(&second, &d, "2").unwrap();
        assert_eq!(
            second.list_confirmed_procurement_orders(now).unwrap()[0]
                .payment_summary
                .paid_minor,
            "0"
        );
        drop(second);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_file(other).unwrap();
    }
    #[test]
    fn payment_conflict_migration_is_additive_and_immutable() {
        let actor = Uuid::new_v4();
        let now = SystemTime::now();
        let path =
            std::env::temp_dir().join(format!("payment-upgrade-{}.test.sqlite", Uuid::new_v4()));
        let (service, payment) = fixture(&path, actor, now);
        {
            let mut c = service.connection.lock().unwrap();
            c.execute_batch("DROP TRIGGER local_expenditures_validate_reversal; DROP TABLE local_payment_conflict_decisions; DROP TABLE local_payment_conflict_discovery; DROP TABLE local_payment_conflict_recovery; DELETE FROM local_schema_migrations WHERE version='0059_payment_conflict_decisions';").unwrap();
            let original = include_str!("../migrations/0033_expenditure_immutability.sql");
            let trigger = original
                .find("CREATE TRIGGER local_expenditures_validate_reversal")
                .unwrap();
            c.execute_batch(&original[trigger..]).unwrap();
            let before = read_payment(&c, payment.id).unwrap().unwrap();
            migrate(&mut c).unwrap();
            migrate(&mut c).unwrap();
            assert_eq!(read_payment(&c, payment.id).unwrap().unwrap(), before);
            assert!(c.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='local_payment_conflict_decisions')",[],|r|r.get::<_,bool>(0)).unwrap());
            assert!(
                c.execute(
                    "UPDATE local_procurement_expenditures SET amount_minor=1",
                    []
                )
                .is_err()
            );
        }
        drop(service);
        std::fs::remove_file(path).unwrap();
    }
}
