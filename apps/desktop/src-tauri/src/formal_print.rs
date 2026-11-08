use super::*;

impl LocalAuthService {
    /// A read-only, allowlisted view; never expose the raw owner pricing bundle.
    pub fn get_formal_print_document(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<serde_json::Value, AuthError> {
        self.read_export_document(order_id, now, true)
    }
    pub fn get_internal_export_document(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<serde_json::Value, AuthError> {
        self.read_export_document(order_id, now, false)
    }
    fn read_export_document(
        &self,
        order_id: Uuid,
        now: SystemTime,
        strict_translation: bool,
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
        project_for_export(&number, &kind, &raw, strict_translation)
    }
}

fn project(number: &str, kind: &str, raw: &str) -> Result<serde_json::Value, AuthError> {
    project_for_export(number, kind, raw, true)
}
fn project_for_export(
    number: &str,
    kind: &str,
    raw: &str,
    strict_translation: bool,
) -> Result<serde_json::Value, AuthError> {
    let mut snapshot: RemotePurchaseOrderPayload =
        serde_json::from_str(raw).map_err(|_| AuthError::InvalidInput)?;
    if !matches!(snapshot.language_pair.as_str(), "zh_fr" | "zh_en")
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
    if kind == "OPA" && snapshot.owner_print_totals_json.is_some() {
        let discount: AdjustmentInput = serde_json::from_str(
            snapshot
                .order_discount_json
                .as_deref()
                .ok_or(AuthError::InvalidInput)?,
        )
        .map_err(|_| AuthError::InvalidInput)?;
        let freight: AdjustmentInput = serde_json::from_str(
            snapshot
                .order_freight_json
                .as_deref()
                .ok_or(AuthError::InvalidInput)?,
        )
        .map_err(|_| AuthError::InvalidInput)?;
        let totals =
            owner_print_totals::calculate_owner_print_totals(&snapshot, &discount, &freight)?;
        let saved: serde_json::Value =
            serde_json::from_str(snapshot.owner_print_totals_json.as_deref().unwrap())
                .map_err(|_| AuthError::InvalidInput)?;
        if totals != saved {
            return Err(AuthError::InvalidInput);
        }
        // Reuse only the allowlisted supplier projection after replacing every
        // money value with independently checked frozen owner-facing amounts.
        for (line, total) in snapshot
            .lines
            .iter_mut()
            .zip(totals["lines"].as_array().ok_or(AuthError::InvalidInput)?)
        {
            line.currency = snapshot.primary_currency.clone();
            line.unit_price_minor = line
                .owner_final_unit_price_minor
                .clone()
                .ok_or(AuthError::InvalidInput)?;
            line.line_total_minor = total["totalMinor"]
                .as_str()
                .ok_or(AuthError::InvalidInput)?
                .to_owned();
        }
        snapshot.currency = snapshot.primary_currency.clone();
        snapshot.supplier_snapshot_json = None;
        snapshot.subtotal_minor = totals["subtotalMinor"].as_str().unwrap().to_owned();
        snapshot.line_discount_minor = totals["lineDiscountMinor"].as_str().unwrap().to_owned();
        snapshot.order_discount_minor = totals["orderDiscountMinor"].as_str().unwrap().to_owned();
        snapshot.freight_minor = totals["freightMinor"].as_str().unwrap().to_owned();
        snapshot.tax_minor = totals["taxMinor"].as_str().unwrap().to_owned();
        snapshot.total_minor = totals["totalMinor"].as_str().unwrap().to_owned();
        let mut projected = project_for_export(
            number,
            "HPA",
            &serde_json::to_string(&snapshot).map_err(|_| AuthError::InvalidInput)?,
            strict_translation,
        )?;
        projected["documentType"] = serde_json::json!("OPA");
        projected["supplier"] = serde_json::Value::Null;
        return Ok(projected);
    }
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
        Ok(serde_json::json!({"nameZh":required("nameZh")?, "nameFr": if snapshot.language_pair == "zh_fr" { if strict_translation { Some(required("nameFr")?) } else { material.get("nameFr").and_then(serde_json::Value::as_str).filter(|s| !s.trim().is_empty()).map(str::to_owned) } } else { None }, "nameEn": if snapshot.language_pair == "zh_en" { if strict_translation { Some(required("nameEn")?) } else { material.get("nameEn").and_then(serde_json::Value::as_str).filter(|s| !s.trim().is_empty()).map(str::to_owned) } } else { None }, "model":material.get("model"), "specification":material.get("specification"), "quantity":line.quantity, "unit":line.unit, "currency":if kind == "OPA" { &snapshot.primary_currency } else { &snapshot.currency }, "unitPriceMinor":if kind == "OPA" { line.owner_final_unit_price_minor.as_ref().ok_or(AuthError::InvalidInput)? } else { &line.unit_price_minor }, "lineTotalMinor":owner_totals.as_ref().map(|v| &v.0[index]).unwrap_or(&line.line_total_minor)}))
    }).collect::<Result<Vec<_>,AuthError>>()?;
    if let Some(profile) = &snapshot.print_profile {
        profile.validate()?;
    }
    let mut result = serde_json::json!({"formalDocumentNo":number,"documentType":kind,"languagePair":snapshot.language_pair,"projectId":snapshot.project_id,"site":snapshot.site,"orderDate":snapshot.order_date,"deliveryAddress":snapshot.delivery_address,"expectedDeliveryDate":snapshot.expected_delivery_date,"notes":snapshot.notes,"currency":if kind == "SPO" { &snapshot.currency } else { &snapshot.primary_currency },"subtotalMinor":owner_totals.as_ref().map(|v| &v.1).unwrap_or(&snapshot.subtotal_minor),"taxMinor":owner_totals.as_ref().map(|v| &v.2).unwrap_or(&snapshot.tax_minor),"totalMinor":owner_totals.as_ref().map(|v| &v.3).unwrap_or(&snapshot.total_minor),"supplier":supplier,"lineDiscountMinor":snapshot.line_discount_minor,"orderDiscountMinor":snapshot.order_discount_minor,"freightMinor":snapshot.freight_minor,"taxRateBasisPoints":snapshot.tax_rate_basis_points,"selfApproved":snapshot.self_approved,"lines":lines});
    if let Some(stamp) = &snapshot.manual_stamp_duty_minor {
        result["manualStampDutyMinor"] = serde_json::json!(stamp);
    }
    if let Some(profile) = snapshot.print_profile {
        result["printProfile"] =
            serde_json::to_value(profile).map_err(|_| AuthError::InvalidInput)?;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn formal_print_english_uses_frozen_translation_and_rejects_missing() {
        let id = "10000000-0000-4000-8000-000000000001";
        let mut raw = serde_json::json!({
            "displayNo":"draft", "countryId":id,"projectId":id,"site":"test",
            "departmentId":id,"teamId":id,"applicantId":id,
            "currency":"EUR","primaryCurrency":"EUR","languagePair":"zh_en",
            "status":"sent","workflowStatus":"sent","urgency":"normal",
            "orderDate":"2026-11-05","deliveryAddress":"test",
            "subtotalMinor":"250","lineDiscountMinor":"0","orderDiscountMinor":"0",
            "freightMinor":"0","taxRateBasisPoints":0,"taxMinor":"0","totalMinor":"250",
            "selfApproved":false,"lines":[{"id":id,
                "materialSnapshotJson":"{\"nameZh\":\"冻结材料\",\"nameEn\":\"Frozen material\"}",
                "currency":"EUR","quantity":"2.5","unit":"m","unitPriceMinor":"100",
                "lineDiscountJson":"{}","lineFreightJson":"{}","freightIncluded":false,
                "lineTotalMinor":"250","sortOrder":0,"createdAt":1,"updatedAt":1
            }]
        });
        let legacy_print = project("TEST-SPO-1", "SPO", &raw.to_string()).unwrap();
        assert!(legacy_print.get("printProfile").is_none());
        raw["printProfile"] =
            serde_json::from_str(&print_profile::approved_profile_json().unwrap()).unwrap();
        let print = project("TEST-SPO-1", "SPO", &raw.to_string()).unwrap();
        assert_eq!(print["printProfile"], raw["printProfile"]);
        assert_eq!(print["languagePair"], "zh_en");
        assert_eq!(print["lines"][0]["nameEn"], "Frozen material");
        assert!(print["lines"][0]["nameFr"].is_null());
        let mut owner_raw = raw.clone();
        owner_raw["lines"][0]["ownerFinalUnitPriceMinor"] = serde_json::json!("1000");
        owner_raw["lines"][0]["ownerLockedExchangeRateDecimal"] = serde_json::json!("0.5");
        owner_raw["lines"][0]["currency"] = serde_json::json!("USD");
        owner_raw["lines"][0]["lineDiscountJson"] =
            serde_json::json!(r#"{"kind":"fixed_minor","minor":"100"}"#);
        owner_raw["lines"][0]["lineFreightJson"] =
            serde_json::json!(r#"{"kind":"percent_basis_points","basisPoints":1000}"#);
        owner_raw["orderDiscountJson"] =
            serde_json::json!(r#"{"kind":"percent_basis_points","basisPoints":1000}"#);
        owner_raw["orderFreightJson"] = serde_json::json!(r#"{"kind":"fixed_minor","minor":"20"}"#);
        owner_raw["taxRateBasisPoints"] = serde_json::json!(500);
        let parsed: RemotePurchaseOrderPayload = serde_json::from_value(owner_raw.clone()).unwrap();
        assert!(validate_issue_translations(&parsed).is_ok());
        for pair in ["zh_fr", "zh_en"] {
            let mut missing = raw.clone();
            missing["languagePair"] = serde_json::json!(pair);
            missing["lines"][0]["materialSnapshotJson"] =
                serde_json::json!(r#"{"nameZh":"Frozen source","nameFr":null,"nameEn":null}"#);
            let missing_payload: RemotePurchaseOrderPayload =
                serde_json::from_value(missing.clone()).unwrap();
            assert_eq!(
                validate_issue_translations(&missing_payload),
                Err(AuthError::MissingDocumentTranslation)
            );
            assert_eq!(
                project("TEST-HPA", "HPA", &missing.to_string()),
                Err(AuthError::InvalidInput)
            );
            let internal =
                project_for_export("TEST-HPA", "HPA", &missing.to_string(), false).unwrap();
            assert!(internal["lines"][0]["nameFr"].is_null());
            assert!(internal["lines"][0]["nameEn"].is_null());
            assert_eq!(missing["totalMinor"], internal["totalMinor"]);
        }
        let totals = owner_print_totals::calculate_owner_print_totals(
            &parsed,
            &AdjustmentInput::PercentBasisPoints { basis_points: 1000 },
            &AdjustmentInput::FixedMinor { minor: "20".into() },
        )
        .unwrap();
        assert_eq!(totals["totalMinor"], "2594");
        owner_raw["ownerPrintTotalsJson"] = serde_json::json!(totals.to_string());
        let owner = project("TEST-OPA-1", "OPA", &owner_raw.to_string()).unwrap();
        assert_eq!(owner["totalMinor"], "2594");
        assert_eq!(owner["lineDiscountMinor"], "50");
        assert_eq!(owner["freightMinor"], "265");
        assert_eq!(owner["lines"][0]["currency"], "EUR");
        assert_eq!(owner["lines"][0]["unitPriceMinor"], "1000");
        assert!(owner["supplier"].is_null());
        assert!(!owner.to_string().contains("USD"));
        assert!(!owner.to_string().contains("ownerLockedExchangeRateDecimal"));
        for language in ["zh_fr", "zh_en"] {
            let mut missing_owner = owner_raw.clone();
            missing_owner["languagePair"] = serde_json::json!(language);
            missing_owner["lines"][0]["materialSnapshotJson"] = serde_json::json!(
                r#"{"nameZh":"Frozen owner material","nameFr":null,"nameEn":null}"#
            );
            let frozen_missing = missing_owner.to_string();
            assert_eq!(
                project("TEST-OPA-1", "OPA", &frozen_missing),
                Err(AuthError::InvalidInput)
            );
            let internal = project_for_export("TEST-OPA-1", "OPA", &frozen_missing, false).unwrap();
            assert!(internal["lines"][0]["nameFr"].is_null());
            assert!(internal["lines"][0]["nameEn"].is_null());
            assert_eq!(internal["documentType"], "OPA");
            assert_eq!(internal["totalMinor"], "2594");
            assert_eq!(internal["lines"][0]["unitPriceMinor"], "1000");
            assert_eq!(internal["currency"], "EUR");
            assert!(internal["supplier"].is_null());
            assert!(!internal.to_string().contains("USD"));
            assert!(
                !internal
                    .to_string()
                    .contains("ownerLockedExchangeRateDecimal")
            );
            assert_eq!(missing_owner.to_string(), frozen_missing);
        }
        let frozen = owner_raw.to_string();
        assert_eq!(project("TEST-OPA-1", "OPA", &frozen).unwrap(), owner);
        owner_raw["ownerPrintTotalsJson"] = serde_json::json!("{}");
        assert!(project("TEST-OPA-1", "OPA", &owner_raw.to_string()).is_err());
        raw["lines"][0]["materialSnapshotJson"] =
            serde_json::json!("{\"nameZh\":\"冻结材料\",\"nameFr\":\"Matériau\"}");
        assert_eq!(
            project("TEST-SPO-1", "SPO", &raw.to_string()),
            Err(AuthError::InvalidInput)
        );
    }
}

/// Validate only frozen language fields before irreversible formal-number allocation.
pub(super) fn validate_issue_translations(
    snapshot: &RemotePurchaseOrderPayload,
) -> Result<(), AuthError> {
    let key = match snapshot.language_pair.as_str() {
        "zh_fr" => "nameFr",
        "zh_en" => "nameEn",
        _ => return Err(AuthError::InvalidInput),
    };
    if snapshot.lines.is_empty() {
        return Err(AuthError::InvalidInput);
    }
    for line in &snapshot.lines {
        let material: serde_json::Value = serde_json::from_str(&line.material_snapshot_json)
            .map_err(|_| AuthError::InvalidInput)?;
        for field in ["nameZh", key] {
            if !material
                .get(field)
                .and_then(serde_json::Value::as_str)
                .is_some_and(|name| !name.trim().is_empty())
            {
                return Err(AuthError::MissingDocumentTranslation);
            }
        }
    }
    Ok(())
}
