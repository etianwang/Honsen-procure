use super::*;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PaymentPayload {
    pub id: Uuid,
    pub order_id: Uuid,
    pub project_id: Uuid,
    pub country_id: Uuid,
    pub supplier_id: Option<Uuid>,
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

fn read_payment(connection: &Connection, id: Uuid) -> Result<Option<PaymentPayload>, AuthError> {
    let value: Option<String> = connection.query_row(
        "SELECT json_object('id',e.id,'orderId',e.order_id,'projectId',e.project_id,'countryId',o.country_id,'supplierId',e.supplier_id,'payeeName',e.payee_name,'currency',e.currency,'amountMinor',CAST(e.amount_minor AS TEXT),'paymentDate',e.payment_date,'paymentType',e.payment_type,'paymentMethod',e.payment_method,'paymentHandlerId',e.payment_handler_id,'voucherReference',e.voucher_reference,'notes',e.notes,'status',e.status,'correctsExpenditureId',e.corrects_expenditure_id,'correctionReason',e.correction_reason,'createdBy',e.created_by,'createdAt',e.created_at) FROM local_procurement_expenditures e JOIN local_purchase_orders o ON o.id=e.order_id WHERE e.id=?1",
        [id.to_string()], |row| row.get(0),
    ).optional().map_err(|_| AuthError::Database)?;
    value
        .map(|json| serde_json::from_str(&json).map_err(|_| AuthError::Database))
        .transpose()
}

fn validate(payment: &PaymentPayload) -> Result<i64, AuthError> {
    let amount = as_i64(parse_non_negative_minor(&payment.amount_minor)?)?;
    if amount <= 0
        || amount.to_string() != payment.amount_minor
        || !valid_currency(&payment.currency)
        || !valid_required_text(&payment.payee_name, 255)
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
        || payment.created_at < 0
        || payment.payment_handler_id != payment.created_by
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
            .is_some_and(|v| Some(v) != supplier)
    {
        return Err(AuthError::InvalidInput);
    }
    if let Some(existing) = read_payment(transaction, payment.id)? {
        let mut incoming = payment.clone();
        incoming.supplier_id = existing.supplier_id;
        return if existing == incoming {
            Ok(true)
        } else {
            Err(AuthError::InvalidInput)
        };
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
        {
            return Err(AuthError::InvalidInput);
        }
    }
    transaction.execute("INSERT INTO local_procurement_expenditures (id,order_id,project_id,supplier_id,payee_name,currency,amount_minor,payment_date,payment_type,payment_method,payment_handler_id,voucher_reference,notes,status,corrects_expenditure_id,correction_reason,created_by,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",params![payment.id.to_string(),payment.order_id.to_string(),project,supplier,payment.payee_name,payment.currency,amount,payment.payment_date,payment.payment_type,payment.payment_method,payment.payment_handler_id.to_string(),payment.voucher_reference,payment.notes,payment.status,payment.corrects_expenditure_id.map(|v|v.to_string()),payment.correction_reason,payment.created_by.to_string(),payment.created_at]).map_err(|_|AuthError::InvalidInput)?;
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

pub(super) fn project_staged(transaction: &Transaction<'_>) -> Result<(), AuthError> {
    let rows = transaction.prepare("SELECT entity_id,operation,payload_json FROM local_sync_remote_entities WHERE entity_type='procurement_expenditure' ORDER BY json_extract(payload_json,'$.status'),entity_id").map_err(|_|AuthError::Database)?.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?))).map_err(|_|AuthError::Database)?.collect::<Result<Vec<_>,_>>().map_err(|_|AuthError::Database)?;
    for (id, operation, json) in rows {
        let payment: PaymentPayload =
            serde_json::from_str(&json).map_err(|_| AuthError::InvalidInput)?;
        if operation != "upsert" || payment.id.to_string() != id {
            return Err(AuthError::InvalidInput);
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
    payment.payment_handler_id = actor;
    payment.created_at = unix_seconds(now);
    payment.voucher_reference = None;
    payment.notes = None;
    let mut connection = service.connection.lock().map_err(|_| AuthError::Database)?;
    let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
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
