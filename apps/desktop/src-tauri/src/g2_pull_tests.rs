use super::*;
use serde_json::{Value, json};

const HEADER_FIELDS: [&str; 6] = [
    "documentType",
    "formalDocumentNo",
    "formalInstallationId",
    "formalSequence",
    "formallyIssuedAt",
    "formalSnapshotJson",
];
const LINE_FIELDS: [&str; 10] = [
    "ownerQuoteSource",
    "ownerCatalogPriceId",
    "ownerManualReferenceReason",
    "ownerManualReferenceActorId",
    "ownerManualReferenceAt",
    "ownerSourceUnitPriceMinor",
    "ownerLockedExchangeRateDecimal",
    "ownerConvertedReferenceUnitMinor",
    "ownerMarkupJson",
    "ownerFinalUnitPriceMinor",
];

fn id(n: u128) -> Uuid {
    Uuid::from_u128(0x10000000000040008000000000000000 + n)
}

fn service() -> (LocalAuthService, PathBuf, SystemTime) {
    let path = std::env::temp_dir().join(format!("honsen-g2-{}.sqlite", Uuid::new_v4()));
    let service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
    let now = SystemTime::now();
    service
        .cache_verified_account(
            CachedAccount {
                id: id(1),
                username: "g2".into(),
                roles: vec![Role::Purchaser],
                enabled: true,
                requires_password_change: false,
            },
            "synthetic-password",
            now,
        )
        .unwrap();
    service
        .activate_online_session(id(1), &"x".repeat(32), now)
        .unwrap();
    (service, path, now)
}

fn dependencies(service: &LocalAuthService, quote: bool) {
    let connection = service.connection.lock().unwrap();
    connection.execute("INSERT INTO local_countries (id,business_code,name,time_zone,is_active,version) VALUES (?1,'G2C','synthetic','UTC',1,1)", [id(2).to_string()]).unwrap();
    connection.execute("INSERT INTO local_projects (id,country_id,business_code,name,site,department_name,default_currency,default_language_pair,is_active,version) VALUES (?1,?2,'G2P','synthetic','site','department','XOF','zh_fr',1,1)", params![id(3).to_string(),id(2).to_string()]).unwrap();
    connection.execute("INSERT INTO local_departments (id,business_code,name,is_active,version) VALUES (?1,'G2D','department',1,1)", [id(4).to_string()]).unwrap();
    connection.execute("INSERT INTO local_teams (id,department_id,business_code,name,is_active,version) VALUES (?1,?2,'G2T','team',1,1)", params![id(5).to_string(),id(4).to_string()]).unwrap();
    connection.execute("INSERT INTO local_materials (id,name_zh,model,specification,unit,is_active,version) VALUES (?1,'current material','new','new','pcs',1,1)", [id(6).to_string()]).unwrap();
    connection.execute("INSERT INTO local_suppliers (id,business_code,name,country_id,is_active,version) VALUES (?1,'G2S','current supplier',?2,0,2)", params![id(7).to_string(),id(2).to_string()]).unwrap();
    if quote {
        add_quote(&connection);
    }
}

fn add_quote(connection: &Connection) {
    // Current revoked/changed quotes must not replace frozen prices.
    connection.execute("INSERT INTO local_material_prices (id,material_id,supplier_id,currency,unit_price_minor,unit,effective_at,is_active,version,deleted_at) VALUES (?1,?2,?3,'CNY',999999,'pcs','2026-10-19',0,2,1)", params![id(8).to_string(),id(6).to_string(),id(7).to_string()]).unwrap();
}

fn approved() -> Value {
    let mut lines = Vec::new();
    for (n, source, source_price, rate, converted, markup, final_price) in [
        (
            10,
            "catalog_price",
            "1234",
            "76.5",
            "944",
            r#"{"kind":"fixed_minor","minor":"20"}"#,
            "964",
        ),
        (
            11,
            "manual_reference",
            "1000",
            "1",
            "1000",
            r#"{"kind":"percent_basis_points","basisPoints":1000}"#,
            "1100",
        ),
    ] {
        let manual = source == "manual_reference";
        lines.push(json!({ "id":id(n), "materialId":id(6), "materialSnapshotJson":r#"{"nameZh":"frozen material","model":"old","specification":"old"}"#,
            "supplierSnapshotJson": if manual {None} else {Some(format!(r#"{{"id":"{}","name":"frozen supplier"}}"#,id(7)))},
            "currency":if manual {"XOF"} else {"CNY"}, "quantity":"1", "unit":"pcs", "unitPriceMinor":"100", "lineDiscountJson":r#"{"kind":"fixed_minor","minor":"0"}"#,
            "lineFreightJson":r#"{"kind":"fixed_minor","minor":"0"}"#, "freightIncluded":false, "lineTotalMinor":"100", "sortOrder":n-10, "createdAt":1,"updatedAt":1,
            "ownerQuoteSource":source,"ownerCatalogPriceId":if manual {None} else {Some(id(8))},"ownerManualReferenceReason":if manual {Some("synthetic exception")} else {None},
            "ownerManualReferenceActorId":if manual {Some(id(1))} else {None},"ownerManualReferenceAt":if manual {Some(1)} else {None},"ownerSourceUnitPriceMinor":source_price,
            "ownerLockedExchangeRateDecimal":rate,"ownerConvertedReferenceUnitMinor":converted,"ownerMarkupJson":markup,"ownerFinalUnitPriceMinor":final_price }));
    }
    let mut payload = json!({"parentOrderId":null,"procurementMode":"owner_self_purchase","displayNo":"G2-TEMP","countryId":id(2),"projectId":id(3),"site":"site","departmentId":id(4),"teamId":id(5),"applicantId":id(1),"supplierId":null,"supplierSnapshotJson":null,
        "currency":"XOF","primaryCurrency":"XOF","lockedExchangeRateDecimal":null,"languagePair":"zh_fr","status":"pending_confirmation","workflowStatus":"approved","urgency":"normal","urgencyReason":null,"orderDate":"2026-10-19","deliveryAddress":"synthetic address","expectedDeliveryDate":null,"notes":null});
    payload.as_object_mut().unwrap().extend(json!({
        "subtotalMinor":"200","lineDiscountMinor":"0","orderDiscountMinor":"0","freightMinor":"0","taxRateBasisPoints":0,"taxMinor":"0","totalMinor":"200","confirmedBy":id(12),"confirmedAt":1,"rejectionReason":null,"selfApproved":false,"supplierTermsCompletedAt":null,
        "documentType":null,"formalDocumentNo":null,"formalInstallationId":null,"formalSequence":null,"formallyIssuedAt":null,"formalSnapshotJson":null,"lines":lines}).as_object().unwrap().clone());
    payload
}

fn issued() -> Value {
    let mut payload = approved();
    payload["formalSnapshotJson"] = json!(payload.to_string());
    payload["workflowStatus"] = json!("formally_issued");
    payload["documentType"] = json!("OPA");
    payload["formalDocumentNo"] = json!("G2C-G2P-20261019-OPA-00000001-7");
    payload["formalInstallationId"] = json!("00000000-0000-4000-8000-000000000001");
    payload["formalSequence"] = json!("7");
    payload["formallyIssuedAt"] = json!(1);
    payload
}

#[test]
fn hpa_pull_freezes_the_complete_honsen_snapshot_and_advances_to_receiving() {
    let (service, path, now) = service();
    dependencies(&service, true);
    let mut payload = approved();
    payload["procurementMode"] = json!("honsen_self_purchase");
    for line in payload["lines"].as_array_mut().unwrap() {
        for field in LINE_FIELDS {
            line[field] = Value::Null;
        }
    }
    service
        .apply_sync_pull_page(page(payload.clone(), 1, 1), now)
        .unwrap();
    payload["formalSnapshotJson"] = json!(payload.to_string());
    payload["workflowStatus"] = json!("executing");
    payload["documentType"] = json!("HPA");
    payload["formalDocumentNo"] = json!("G2C-G2P-20261019-HPA-00000001-7");
    payload["formalInstallationId"] = json!("00000000-0000-4000-8000-000000000001");
    payload["formalSequence"] = json!("7");
    payload["formallyIssuedAt"] = json!(1);
    service
        .apply_sync_pull_page(page(payload.clone(), 2, 2), now)
        .unwrap();
    assert_eq!(stored(&service), payload);
    payload["workflowStatus"] = json!("receiving");
    service
        .apply_sync_pull_page(page(payload.clone(), 3, 3), now)
        .unwrap();
    assert_eq!(stored(&service), payload);
    drop(service);
    let service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
    service
        .activate_online_session(id(1), &"x".repeat(32), now)
        .unwrap();
    service
        .apply_sync_pull_page(page(payload.clone(), 3, 3), now)
        .unwrap();
    assert_eq!(stored(&service), payload);
    let mut bad = payload.clone();
    bad["lines"][0]["unitPriceMinor"] = json!("101");
    assert!(service.apply_sync_pull_page(page(bad, 4, 4), now).is_err());
    assert_eq!(stored(&service), payload);
    assert_eq!(service.pull_cursor_for_account(id(1)).unwrap(), "3");
}

fn page(payload: Value, cursor: i64, version: i64) -> SyncPullPageInput {
    SyncPullPageInput {
        changes: vec![SyncPullChangeInput {
            cursor: cursor.to_string(),
            entity_type: "purchase_order".into(),
            entity_id: id(9),
            operation: "upsert".into(),
            version,
            payload,
            changed_at: "2026-10-19T00:00:00Z".into(),
        }],
        next_cursor: cursor.to_string(),
    }
}

fn stored(service: &LocalAuthService) -> Value {
    let mut connection = service.connection.lock().unwrap();
    let tx = connection.transaction().unwrap();
    serde_json::from_str(&order_sync_payload(&tx, id(9)).unwrap()).unwrap()
}

fn assert_fields(service: &LocalAuthService, expected: &Value) {
    let actual = stored(service);
    for name in HEADER_FIELDS {
        assert_eq!(actual[name], expected[name], "header {name}");
    }
    assert_eq!(
        actual["lines"].as_array().unwrap().len(),
        expected["lines"].as_array().unwrap().len()
    );
    for (actual, expected) in actual["lines"]
        .as_array()
        .unwrap()
        .iter()
        .zip(expected["lines"].as_array().unwrap())
    {
        for name in LINE_FIELDS {
            assert_eq!(actual[name], expected[name], "line {name}");
        }
        for name in ["currency", "materialSnapshotJson", "supplierSnapshotJson"] {
            assert_eq!(actual[name], expected[name], "frozen {name}");
        }
    }
    assert_eq!(actual["workflowStatus"], expected["workflowStatus"]);
}

#[test]
fn g2_pull_cold_file_preserves_all_fields_and_replay_after_restart() {
    let (service, path, now) = service();
    dependencies(&service, true);
    let allocator: (String, i64) = service
        .connection
        .lock()
        .unwrap()
        .query_row(
            "SELECT installation_id,next_formal_sequence FROM local_sync_state",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    service
        .apply_sync_pull_page(page(issued(), 1, 1), now)
        .unwrap();
    assert_fields(&service, &issued());
    drop(service);
    let service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
    service
        .activate_online_session(id(1), &"x".repeat(32), now)
        .unwrap();
    service
        .apply_sync_pull_page(page(issued(), 1, 1), now)
        .unwrap();
    assert_fields(&service, &issued());
    let after: (String, i64) = service
        .connection
        .lock()
        .unwrap()
        .query_row(
            "SELECT installation_id,next_formal_sequence FROM local_sync_state",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(allocator, after);
    assert_eq!(service.pull_cursor_for_account(id(1)).unwrap(), "1");
}

#[test]
fn g2_pull_approved_and_confirmed_advance_without_rewriting_frozen_lines() {
    for status in ["approved", "confirmed"] {
        let (service, _, now) = service();
        dependencies(&service, true);
        let mut payload = approved();
        payload["workflowStatus"] = json!(status);
        service
            .apply_sync_pull_page(page(payload, 1, 1), now)
            .unwrap();
        service
            .apply_sync_pull_page(page(issued(), 2, 2), now)
            .unwrap();
        assert_fields(&service, &issued());
        let mut receiving = issued();
        receiving["workflowStatus"] = json!("receiving");
        service
            .apply_sync_pull_page(page(receiving.clone(), 3, 3), now)
            .unwrap();
        assert_fields(&service, &receiving);
        service
            .apply_sync_pull_page(page(issued(), 4, 2), now)
            .unwrap();
        assert_fields(&service, &receiving);
    }
}

#[test]
fn g2_pull_staged_snapshot_waits_for_revoked_quote_without_losing_cursor_evidence() {
    let (service, path, now) = service();
    dependencies(&service, false);
    service
        .apply_sync_pull_page(page(issued(), 1, 1), now)
        .unwrap();
    assert_eq!(
        service
            .connection
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM local_purchase_orders", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(service.pull_cursor_for_account(id(1)).unwrap(), "1");
    drop(service);
    let service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
    service
        .activate_online_session(id(1), &"x".repeat(32), now)
        .unwrap();
    add_quote(&service.connection.lock().unwrap());
    service
        .apply_sync_pull_page(
            SyncPullPageInput {
                changes: vec![],
                next_cursor: "1".into(),
            },
            now,
        )
        .unwrap();
    assert_fields(&service, &issued());
}

#[test]
fn g2_pull_rejects_incomplete_or_invalid_formal_dto_without_advancing_cursor() {
    let (service, _, now) = service();
    dependencies(&service, true);
    let mut invalid = Vec::new();
    for field in HEADER_FIELDS {
        let mut p = issued();
        p.as_object_mut().unwrap().remove(field);
        invalid.push(p);
    }
    for field in LINE_FIELDS {
        let mut p = issued();
        let index = if field.starts_with("ownerManualReference") {
            1
        } else {
            0
        };
        p["lines"][index].as_object_mut().unwrap().remove(field);
        replace_snapshot_lines(&mut p);
        invalid.push(p);
    }
    for (field, value) in [
        ("ownerSourceUnitPriceMinor", json!("-1")),
        ("ownerLockedExchangeRateDecimal", json!("0")),
        ("ownerConvertedReferenceUnitMinor", json!("945")),
        ("ownerFinalUnitPriceMinor", json!("965")),
        ("ownerMarkupJson", json!("{}")),
        ("ownerQuoteSource", json!("unknown")),
    ] {
        let mut p = issued();
        p["lines"][0][field] = value;
        replace_snapshot_lines(&mut p);
        invalid.push(p);
    }
    let mut p = issued();
    p["formalDocumentNo"] = json!("wrong-number");
    invalid.push(p);
    let mut p = issued();
    p["formalSnapshotJson"] = json!("{}");
    invalid.push(p);
    let mut p = issued();
    p["formalSequence"] = json!("9223372036854775808");
    invalid.push(p);
    for p in invalid {
        assert_eq!(
            service.apply_sync_pull_page(page(p, 1, 1), now),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(service.pull_cursor_for_account(id(1)).unwrap(), "0");
        let counts:(i64,i64)=service.connection.lock().unwrap().query_row("SELECT (SELECT COUNT(*) FROM local_purchase_orders),(SELECT COUNT(*) FROM local_sync_remote_entities)",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
        assert_eq!(counts, (0, 0));
    }
}

fn replace_snapshot_lines(payload: &mut Value) {
    let mut snapshot: Value =
        serde_json::from_str(payload["formalSnapshotJson"].as_str().unwrap()).unwrap();
    snapshot["lines"] = payload["lines"].clone();
    payload["formalSnapshotJson"] = json!(snapshot.to_string());
}

#[test]
fn g2_pull_review_postapproval_pricing_timestamp_can_advance_to_issue() {
    let (service, _, now) = service();
    dependencies(&service, true);
    service
        .apply_sync_pull_page(page(approved(), 1, 1), now)
        .unwrap();
    let mut repriced = approved();
    repriced["lines"][0]["updatedAt"] = json!(2);
    repriced["lines"][0]["ownerSourceUnitPriceMinor"] = json!("1235");
    repriced["lines"][0]["ownerConvertedReferenceUnitMinor"] = json!("945");
    repriced["lines"][0]["ownerFinalUnitPriceMinor"] = json!("965");
    service
        .apply_sync_pull_page(page(repriced.clone(), 2, 2), now)
        .unwrap();
    let mut payload = issued();
    payload["lines"] = repriced["lines"].clone();
    replace_snapshot_lines(&mut payload);
    service
        .apply_sync_pull_page(page(payload.clone(), 3, 3), now)
        .unwrap();
    assert_fields(&service, &payload);
    assert_eq!(stored(&service)["lines"][0]["updatedAt"], json!(2));
}

#[test]
fn g2_pull_review_first_issue_replaces_clean_editable_line_set() {
    let (service, _, now) = service();
    dependencies(&service, true);
    let mut draft = approved();
    draft["workflowStatus"] = json!("draft");
    service
        .apply_sync_pull_page(page(draft, 1, 1), now)
        .unwrap();
    let mut payload = issued();
    payload["lines"].as_array_mut().unwrap().truncate(1);
    payload["subtotalMinor"] = json!("100");
    payload["totalMinor"] = json!("100");
    let mut snapshot = approved();
    snapshot["lines"] = payload["lines"].clone();
    snapshot["subtotalMinor"] = json!("100");
    snapshot["totalMinor"] = json!("100");
    payload["formalSnapshotJson"] = json!(snapshot.to_string());
    service
        .apply_sync_pull_page(page(payload.clone(), 2, 2), now)
        .unwrap();
    assert_fields(&service, &payload);
    service
        .apply_sync_pull_page(page(payload.clone(), 2, 2), now)
        .unwrap();
    assert_fields(&service, &payload);
}

#[test]
fn g2_pull_review_noncanonical_frozen_line_order_survives_replay_and_serialization() {
    let (service, _, now) = service();
    dependencies(&service, true);
    let mut payload = issued();
    payload["lines"].as_array_mut().unwrap().reverse();
    replace_snapshot_lines(&mut payload);
    service
        .apply_sync_pull_page(page(payload.clone(), 1, 1), now)
        .unwrap();
    assert_fields(&service, &payload);
    service
        .apply_sync_pull_page(
            SyncPullPageInput {
                changes: vec![],
                next_cursor: "1".into(),
            },
            now,
        )
        .unwrap();
    let mut receiving = payload.clone();
    receiving["workflowStatus"] = json!("receiving");
    service
        .apply_sync_pull_page(page(receiving.clone(), 2, 2), now)
        .unwrap();
    assert_fields(&service, &receiving);
    assert_eq!(stored(&service)["lines"], payload["lines"]);
}

#[test]
fn g2_pull_backfills_prior_projector_missing_fields_at_same_version() {
    let (service, _, now) = service();
    dependencies(&service, true);
    let mut old = approved();
    for line in old["lines"].as_array_mut().unwrap() {
        for field in LINE_FIELDS {
            line.as_object_mut().unwrap().remove(field);
        }
        line["supplierSnapshotJson"] = Value::Null;
    }
    service.apply_sync_pull_page(page(old, 1, 1), now).unwrap();
    // Reproduce an older projector's issued-status-only row, before any formal lock exists.
    service.connection.lock().unwrap().execute("UPDATE local_purchase_orders SET workflow_status = 'formally_issued', version = 2 WHERE id = ?1", [id(9).to_string()]).unwrap();
    service
        .apply_sync_pull_page(page(issued(), 2, 2), now)
        .unwrap();
    assert_fields(&service, &issued());
}

#[test]
fn g2_pull_production_issue_outbox_reaches_second_file_without_changing_issuer_namespace() {
    let (producer, _, now) = service();
    dependencies(&producer, true);
    producer
        .apply_sync_pull_page(page(approved(), 1, 1), now)
        .unwrap();
    {
        let c = producer.connection.lock().unwrap();
        c.execute(
            "UPDATE local_suppliers SET is_active = 1 WHERE id = ?1",
            [id(7).to_string()],
        )
        .unwrap();
        c.execute("UPDATE local_material_prices SET is_active = 1, deleted_at = NULL, unit_price_minor = 1234 WHERE id = ?1", [id(8).to_string()]).unwrap();
        c.execute("INSERT INTO local_authorization_snapshots (account_id,project_id,department_id,team_id,verified_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6)", params![id(1).to_string(),id(3).to_string(),id(4).to_string(),id(5).to_string(),unix_seconds(now),unix_seconds(now+AUTHORIZATION_CACHE_WINDOW)]).unwrap();
        c.execute("INSERT INTO local_exchange_rates (id,from_currency,to_currency,rate_decimal,effective_at,source,version) VALUES (?1,'CNY','XOF','76.5','2026-10-19','public_daily',1)", [id(30).to_string()]).unwrap();
    }
    let issued = producer.issue_owner_formal_order(id(9), now).unwrap();
    let wire: String = producer
        .connection
        .lock()
        .unwrap()
        .query_row(
            "SELECT payload_json FROM local_sync_outbox WHERE entity_id = ?1",
            [id(9).to_string()],
            |r| r.get(0),
        )
        .unwrap();
    let payload: Value = serde_json::from_str(&wire).unwrap();
    assert_eq!(
        payload["formalDocumentNo"],
        json!(issued.formal_document_no)
    );
    let (consumer, _, _) = service();
    dependencies(&consumer, true);
    consumer
        .apply_sync_pull_page(page(payload.clone(), 1, 2), now)
        .unwrap();
    assert_fields(&consumer, &payload);
    assert_eq!(
        consumer
            .connection
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM local_sync_outbox", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn g2_pull_sqlite_collision_and_cursor_failure_roll_back_complete_page() {
    for cursor_failure in [false, true] {
        let (service, _, now) = service();
        dependencies(&service, true);
        let mut batch = page(issued(), 1, 1);
        if cursor_failure {
            *service.test_fail_before_pull_cursor_write.lock().unwrap() = true;
        } else {
            let mut other = page(issued(), 2, 1).changes.remove(0);
            other.entity_id = id(20);
            for line in other.payload["lines"].as_array_mut().unwrap() {
                line["id"] = json!(Uuid::new_v4());
            }
            let mut snapshot: Value =
                serde_json::from_str(other.payload["formalSnapshotJson"].as_str().unwrap())
                    .unwrap();
            snapshot["lines"] = other.payload["lines"].clone();
            other.payload["formalSnapshotJson"] = json!(snapshot.to_string());
            batch.changes.push(other);
            batch.next_cursor = "2".into();
        }
        assert_eq!(
            service.apply_sync_pull_page(batch, now),
            Err(AuthError::Database)
        );
        assert_eq!(service.pull_cursor_for_account(id(1)).unwrap(), "0");
        let counts:(i64,i64,i64)=service.connection.lock().unwrap().query_row("SELECT (SELECT COUNT(*) FROM local_purchase_orders),(SELECT COUNT(*) FROM local_purchase_order_items),(SELECT COUNT(*) FROM local_sync_remote_entities)",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        assert_eq!(counts, (0, 0, 0));
    }
}

#[test]
fn g2_pull_divergent_issued_snapshot_cannot_overwrite_or_advance_cursor() {
    let (service, _, now) = service();
    dependencies(&service, true);
    service
        .apply_sync_pull_page(page(issued(), 1, 1), now)
        .unwrap();
    let mut changed = issued();
    changed["deliveryAddress"] = json!("changed frozen address");
    let mut snapshot: Value =
        serde_json::from_str(changed["formalSnapshotJson"].as_str().unwrap()).unwrap();
    snapshot["deliveryAddress"] = changed["deliveryAddress"].clone();
    changed["formalSnapshotJson"] = json!(snapshot.to_string());
    assert_eq!(
        service.apply_sync_pull_page(page(changed, 2, 2), now),
        Err(AuthError::InvalidInput)
    );
    assert_fields(&service, &issued());
    assert_eq!(service.pull_cursor_for_account(id(1)).unwrap(), "1");
}

#[test]
fn g2_pull_dirty_order_preserves_outbox_and_conflict_instead_of_projecting_stage() {
    let (service, _, now) = service();
    dependencies(&service, true);
    service
        .apply_sync_pull_page(page(approved(), 1, 1), now)
        .unwrap();
    {
        let mut connection = service.connection.lock().unwrap();
        let tx = connection.transaction().unwrap();
        insert_local_sync_outbox(&tx, "purchase_order", id(9), &approved().to_string(), now)
            .unwrap();
        tx.commit().unwrap();
    }
    service
        .apply_sync_pull_page(page(issued(), 2, 2), now)
        .unwrap();
    assert_eq!(stored(&service)["formalDocumentNo"], Value::Null);
    let counts:(i64,i64)=service.connection.lock().unwrap().query_row("SELECT (SELECT COUNT(*) FROM local_sync_outbox WHERE acknowledged_at IS NULL AND superseded_at IS NULL),(SELECT COUNT(*) FROM local_sync_conflicts WHERE resolved_at IS NULL)",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
    assert_eq!(counts, (1, 1));
}
