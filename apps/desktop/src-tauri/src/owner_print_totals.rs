use super::*;

/// Versioned owner-facing amounts calculated from frozen final prices. Fixed
/// line adjustments retain their source currency and frozen directed rate.
pub(super) fn calculate_owner_print_totals(
    snapshot: &RemotePurchaseOrderPayload,
    order_discount: &AdjustmentInput,
    order_freight: &AdjustmentInput,
) -> Result<serde_json::Value, AuthError> {
    validate_adjustment(order_discount)?;
    validate_adjustment(order_freight)?;
    let mut subtotal = 0i128;
    let mut discounts = 0i128;
    let mut line_freight_total = 0i128;
    let mut lines = Vec::new();
    for line in &snapshot.lines {
        let price = parse_non_negative_minor(
            line.owner_final_unit_price_minor
                .as_deref()
                .ok_or(AuthError::InvalidInput)?,
        )?;
        let base = divide_half_up(
            price
                .checked_mul(parse_quantity_hundredths(&line.quantity)?)
                .ok_or(AuthError::InvalidInput)?,
            100,
        )?;
        let rate = line
            .owner_locked_exchange_rate_decimal
            .as_deref()
            .ok_or(AuthError::InvalidInput)?;
        let convert = |raw: &str| -> Result<AdjustmentInput, AuthError> {
            let adjustment: AdjustmentInput =
                serde_json::from_str(raw).map_err(|_| AuthError::InvalidInput)?;
            validate_adjustment(&adjustment)?;
            match adjustment {
                AdjustmentInput::FixedMinor { minor } => Ok(AdjustmentInput::FixedMinor {
                    minor: convert_minor_by_rate(
                        as_i64(parse_non_negative_minor(&minor)?)?,
                        &line.currency,
                        &snapshot.primary_currency,
                        rate,
                    )?
                    .to_string(),
                }),
                other => Ok(other),
            }
        };
        let discount = adjustment_amount(base, &convert(&line.line_discount_json)?, true)?;
        let freight = if line.freight_included {
            0
        } else {
            adjustment_amount(base - discount, &convert(&line.line_freight_json)?, false)?
        };
        subtotal = subtotal.checked_add(base).ok_or(AuthError::InvalidInput)?;
        discounts = discounts
            .checked_add(discount)
            .ok_or(AuthError::InvalidInput)?;
        line_freight_total = line_freight_total
            .checked_add(freight)
            .ok_or(AuthError::InvalidInput)?;
        lines.push(serde_json::json!({"id":line.id,"subtotalMinor":as_i64(base)?.to_string(),"discountMinor":as_i64(discount)?.to_string(),"freightMinor":as_i64(freight)?.to_string(),"totalMinor":as_i64(base-discount+freight)?.to_string()}));
    }
    let order_discount_minor = adjustment_amount(subtotal - discounts, order_discount, true)?;
    let order_freight_minor = adjustment_amount(
        subtotal - discounts - order_discount_minor,
        order_freight,
        false,
    )?;
    let freight = line_freight_total
        .checked_add(order_freight_minor)
        .ok_or(AuthError::InvalidInput)?;
    let taxable = (subtotal - discounts - order_discount_minor)
        .checked_add(freight)
        .ok_or(AuthError::InvalidInput)?;
    if !(0..=100_000).contains(&snapshot.tax_rate_basis_points) {
        return Err(AuthError::InvalidInput);
    }
    let tax = divide_half_up(
        taxable
            .checked_mul(i128::from(snapshot.tax_rate_basis_points))
            .ok_or(AuthError::InvalidInput)?,
        10_000,
    )?;
    let stamp = parse_manual_stamp(snapshot.manual_stamp_duty_minor.as_deref().unwrap_or("0"))?;
    let mut result = serde_json::json!({"version":1,"currency":snapshot.primary_currency,"lines":lines,"subtotalMinor":as_i64(subtotal)?.to_string(),"lineDiscountMinor":as_i64(discounts)?.to_string(),"orderDiscountMinor":as_i64(order_discount_minor)?.to_string(),"freightMinor":as_i64(freight)?.to_string(),"taxMinor":as_i64(tax)?.to_string(),"totalMinor":as_i64(taxable.checked_add(tax).and_then(|v|v.checked_add(stamp)).ok_or(AuthError::InvalidInput)?)?.to_string()});
    if let Some(value) = &snapshot.manual_stamp_duty_minor {
        result["manualStampDutyMinor"] = serde_json::json!(value);
    }
    Ok(result)
}
#[cfg(test)]
mod migration_tests {
    use super::*;
    #[test]
    fn owner_print_migration_preserves_previous_schema_rows_and_keeps_rules_unknown() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        c.execute_batch("PRAGMA foreign_keys=OFF; ALTER TABLE local_purchase_orders DROP COLUMN owner_print_totals_json; ALTER TABLE local_purchase_orders DROP COLUMN order_freight_json; ALTER TABLE local_purchase_orders DROP COLUMN order_discount_json; DELETE FROM local_schema_migrations WHERE version='0060_owner_print_snapshot';").unwrap();
        c.execute_batch("INSERT INTO local_purchase_orders (id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, currency, primary_currency, language_pair, status, workflow_status, urgency, order_date, delivery_address, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, version, created_at, updated_at) VALUES ('legacy','LEGACY','c','p','site','d','t','a','EUR','EUR','zh_fr','draft','draft','normal','2026-11-05','address',123,1,2,3,500,6,129,7,1,2);").unwrap();
        let before: String = c.query_row("SELECT display_no || ':' || total_minor || ':' || version FROM local_purchase_orders WHERE id='legacy'", [], |r| r.get(0)).unwrap();
        migrate(&mut c).unwrap();
        let after: (String,Option<String>,Option<String>,Option<String>) = c.query_row("SELECT display_no || ':' || total_minor || ':' || version,order_discount_json,order_freight_json,owner_print_totals_json FROM local_purchase_orders WHERE id='legacy'", [], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).unwrap();
        assert_eq!(after, (before, None, None, None));
        migrate(&mut c).unwrap();
    }
}
