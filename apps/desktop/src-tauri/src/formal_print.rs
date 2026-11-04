use super::*;

impl LocalAuthService {
    /// A read-only, allowlisted view; never expose the raw owner pricing bundle.
    pub fn get_formal_print_document(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<serde_json::Value, AuthError> {
        let mut connection = self.historical_order_connection(order_id, now)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let current: RemotePurchaseOrderPayload =
            serde_json::from_str(&order_sync_payload(&transaction, order_id)?)
                .map_err(|_| AuthError::InvalidInput)?;
        current.formal_snapshot()?.ok_or(AuthError::Forbidden)?;
        validate_remote_formal_number(&transaction, &current)?;
        let number = current.formal_document_no.ok_or(AuthError::InvalidInput)?;
        let kind = current.document_type.ok_or(AuthError::InvalidInput)?;
        let raw = current
            .formal_snapshot_json
            .ok_or(AuthError::InvalidInput)?;
        project(&number, &kind, &raw)
    }
}

fn project(number: &str, kind: &str, raw: &str) -> Result<serde_json::Value, AuthError> {
    let snapshot: RemotePurchaseOrderPayload =
        serde_json::from_str(raw).map_err(|_| AuthError::InvalidInput)?;
    if snapshot.language_pair != "zh_fr"
        || !matches!(kind, "OPA" | "HPA" | "SPO")
        || snapshot.lines.is_empty()
    {
        return Err(AuthError::InvalidInput);
    }
    let supplier = if kind == "OPA" {
        serde_json::Value::Null
    } else {
        let value: serde_json::Value = snapshot
            .supplier_snapshot_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(|_| AuthError::InvalidInput)?
            .unwrap_or(serde_json::Value::Null);
        serde_json::json!({"name": value.get("name"), "contactName": value.get("contactName"), "address": value.get("address"), "phone": value.get("phone"), "email": value.get("email")})
    };
    // Owner historical line/header totals may still be source-price totals. Derive
    // final-facing amounts solely from frozen final unit prices and quantities.
    // Non-zero adjustments lack a frozen primary-currency derivation contract.
    let owner_totals = if kind == "OPA" {
        if [
            &snapshot.line_discount_minor,
            &snapshot.order_discount_minor,
            &snapshot.freight_minor,
        ]
        .iter()
        .any(|n| n.as_str() != "0")
        {
            return Err(AuthError::InvalidInput);
        }
        let mut subtotal = 0i128;
        let mut totals = Vec::new();
        for line in &snapshot.lines {
            let discount: AdjustmentInput = serde_json::from_str(&line.line_discount_json)
                .map_err(|_| AuthError::InvalidInput)?;
            let freight: AdjustmentInput = serde_json::from_str(&line.line_freight_json)
                .map_err(|_| AuthError::InvalidInput)?;
            if !is_zero_adjustment(&discount) || !is_zero_adjustment(&freight) {
                return Err(AuthError::InvalidInput);
            }
            let price = parse_non_negative_minor(
                line.owner_final_unit_price_minor
                    .as_deref()
                    .ok_or(AuthError::InvalidInput)?,
            )?;
            let total = divide_half_up(
                price
                    .checked_mul(parse_quantity_hundredths(&line.quantity)?)
                    .ok_or(AuthError::InvalidInput)?,
                100,
            )?;
            subtotal = subtotal.checked_add(total).ok_or(AuthError::InvalidInput)?;
            totals.push(as_i64(total)?.to_string());
        }
        let tax = divide_half_up(
            subtotal
                .checked_mul(i128::from(snapshot.tax_rate_basis_points))
                .ok_or(AuthError::InvalidInput)?,
            10_000,
        )?;
        Some((
            totals,
            as_i64(subtotal)?.to_string(),
            as_i64(tax)?.to_string(),
            as_i64(subtotal.checked_add(tax).ok_or(AuthError::InvalidInput)?)?.to_string(),
        ))
    } else {
        None
    };
    let lines = snapshot.lines.iter().enumerate().map(|(index,line)| {
        let material: serde_json::Value = serde_json::from_str(&line.material_snapshot_json).map_err(|_| AuthError::InvalidInput)?;
        let required = |key| material.get(key).and_then(serde_json::Value::as_str).filter(|s| !s.trim().is_empty()).map(str::to_owned).ok_or(AuthError::InvalidInput);
        Ok(serde_json::json!({"nameZh":required("nameZh")?, "nameFr":required("nameFr")?, "model":material.get("model"), "specification":material.get("specification"), "quantity":line.quantity, "unit":line.unit, "currency":if kind == "OPA" { &snapshot.primary_currency } else { &snapshot.currency }, "unitPriceMinor":if kind == "OPA" { line.owner_final_unit_price_minor.as_ref().ok_or(AuthError::InvalidInput)? } else { &line.unit_price_minor }, "lineTotalMinor":owner_totals.as_ref().map(|v| &v.0[index]).unwrap_or(&line.line_total_minor)}))
    }).collect::<Result<Vec<_>,AuthError>>()?;
    Ok(
        serde_json::json!({"formalDocumentNo":number,"documentType":kind,"languagePair":"zh_fr","projectId":snapshot.project_id,"site":snapshot.site,"orderDate":snapshot.order_date,"deliveryAddress":snapshot.delivery_address,"expectedDeliveryDate":snapshot.expected_delivery_date,"notes":snapshot.notes,"currency":if kind == "SPO" { &snapshot.currency } else { &snapshot.primary_currency },"subtotalMinor":owner_totals.as_ref().map(|v| &v.1).unwrap_or(&snapshot.subtotal_minor),"taxMinor":owner_totals.as_ref().map(|v| &v.2).unwrap_or(&snapshot.tax_minor),"totalMinor":owner_totals.as_ref().map(|v| &v.3).unwrap_or(&snapshot.total_minor),"supplier":supplier,"lineDiscountMinor":snapshot.line_discount_minor,"orderDiscountMinor":snapshot.order_discount_minor,"freightMinor":snapshot.freight_minor,"taxRateBasisPoints":snapshot.tax_rate_basis_points,"selfApproved":snapshot.self_approved,"lines":lines}),
    )
}
