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
        if let Some(original_id) = payment.corrects_expenditure_id {
            let losing:Option<(String,String,i64,String)>=transaction.query_row("SELECT e.id,o.event_id,o.base_version,o.payload_json FROM local_procurement_expenditures e JOIN local_sync_outbox o ON o.entity_type='procurement_expenditure' AND o.entity_id=e.id AND o.acknowledged_at IS NULL AND o.superseded_at IS NULL WHERE e.corrects_expenditure_id=?1 AND e.id<>?2 ORDER BY o.created_at,o.event_id LIMIT 1",params![original_id.to_string(),payment.id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|_|AuthError::Database)?;
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
