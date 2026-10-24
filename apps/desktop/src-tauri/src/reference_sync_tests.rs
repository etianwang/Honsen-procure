// Adopted from independent evidence 4d486cdf; builder regression, not independent acceptance.
#[test]

fn reference_sync_postgres_history_replays_after_restart() {
    let source = std::env::var("PR17_QA_TRANSCRIPT").unwrap_or_else(|_| {
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../tests/sync/fixtures/pr17-authorized-history.json"
        )
        .into()
    });
    let data: serde_json::Value = serde_json::from_slice(&std::fs::read(source).unwrap()).unwrap();
    let path = std::env::temp_dir().join(format!("independent-pr17-{}.sqlite", Uuid::new_v4()));
    let now = SystemTime::now();
    let mut identity = account();
    identity.id = Uuid::parse_str(data["reader"].as_str().unwrap()).unwrap();
    let open = || {
        let service = LocalAuthService::open(
            Connection::open(&path).unwrap(),
            Box::new(MemoryCredentialVault::new()),
            path.with_extension("media"),
            None,
        )
        .unwrap();
        service
            .cache_verified_account(identity.clone(), "correct-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                &identity.username,
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        service
    };
    let cursor = data["before"]["nextCursor"].as_str().unwrap();
    let version = data["expanded"]["authorizationVersion"].as_str().unwrap();
    let until = data["expanded"]["replayUntil"].as_str().unwrap();
    let service = open();
    // The real B-only Pull has already passed the filtered A history.
    service
        .apply_sync_pull_page_for_account(
            serde_json::from_value(data["before"].clone()).unwrap(),
            now,
            identity.id,
            None,
        )
        .unwrap();
    service
        .observe_sync_authorization(
            identity.id,
            data["before"]["authorizationVersion"].as_str().unwrap(),
            data["before"]["replayUntil"].as_str().unwrap(),
            None,
        )
        .unwrap();
    let event_id = Uuid::new_v4().to_string();
    {
        let connection = service.connection.lock().unwrap();
        connection
            .execute(
                "UPDATE local_sync_authorization_replay SET completed=1 WHERE account_id=?1",
                [identity.id.to_string()],
            )
            .unwrap();
        connection.execute("INSERT INTO local_sync_outbox(event_id,entity_type,entity_id,operation,base_version,payload_json,created_at,owner_account_id) VALUES(?1,'material',?2,'upsert',0,'{\"notes\":\"retained pending evidence\"}',1,?3)",params![event_id,Uuid::new_v4().to_string(),identity.id.to_string()]).unwrap();
        seed_expenditure_migration_order(&connection);
        connection.execute("INSERT INTO local_purchase_orders(id,display_no,country_id,project_id,site,department_id,team_id,applicant_id,currency,primary_currency,language_pair,status,workflow_status,order_date,delivery_address,version,created_at,updated_at,document_type,formal_document_no,formal_installation_id,formal_sequence,formally_issued_at,formal_snapshot_json) SELECT 'reference-frozen','REFERENCE-FROZEN',country_id,project_id,site,department_id,team_id,applicant_id,currency,primary_currency,language_pair,status,'formally_issued',order_date,delivery_address,version,created_at,updated_at,'HPA','REFERENCE-FROZEN','fixture-install',1,1,'{\"currency\":\"EUR\",\"unitPriceMinor\":\"987654\"}' FROM local_purchase_orders WHERE id='mig-order'",[]).unwrap();
        connection.execute("INSERT INTO local_purchase_order_items(id,order_id,material_snapshot_json,supplier_snapshot_json,quantity_decimal,unit,unit_price_minor,line_total_minor,sort_order,created_at,updated_at) VALUES('reference-frozen-line','reference-frozen','{\"nameZh\":\"frozen material\"}','{\"name\":\"frozen supplier\"}','1','pcs',987654,987654,0,1,1)",[]).unwrap();
        connection.execute("INSERT INTO local_master_data_audit_entries(id,actor_id,entity_type,entity_id,action,previous_json,next_json,created_at) VALUES('reference-audit','fixture-actor','country','mig-country','create',NULL,'{\"name\":\"retained history\"}',1)",[]).unwrap();
    }
    assert!(
        service
            .observe_sync_authorization(identity.id, version, until, None)
            .unwrap()
    );
    let retained = reference_sync_retained(&service);
    let first: SyncPullPageInput = serde_json::from_value(data["replay"][0].clone()).unwrap();
    assert_eq!(first.changes.len(), 500);
    service
        .apply_sync_pull_page_with_replay(first, now, identity.id, None, Some(version))
        .unwrap();
    let checkpoint = service.pending_sync_replay(identity.id).unwrap().unwrap();
    assert_ne!(checkpoint.1, "0");
    drop(service);
    let service = open();
    assert_eq!(
        service.pending_sync_replay(identity.id).unwrap().unwrap(),
        checkpoint
    );
    assert!(
        !service
            .observe_sync_authorization(identity.id, version, "999999", None)
            .unwrap()
    );
    assert_eq!(
        service.pending_sync_replay(identity.id).unwrap().unwrap(),
        checkpoint
    );
    for value in data["replay"].as_array().unwrap().iter().skip(1) {
        service
            .apply_sync_pull_page_with_replay(
                serde_json::from_value(value.clone()).unwrap(),
                now,
                identity.id,
                None,
                Some(version),
            )
            .unwrap();
    }
    assert!(service.pending_sync_replay(identity.id).unwrap().is_none());
    assert_eq!(
        service.pull_cursor_for_account(identity.id).unwrap(),
        cursor
    );
    for _ in 0..2 {
        service
            .apply_sync_pull_page_for_account(
                serde_json::from_value(data["incremental"].clone()).unwrap(),
                now,
                identity.id,
                None,
            )
            .unwrap();
    }
    if let Some(pages) = data["restoredReplay"].as_array() {
        let restored = data["restored"]["authorizationVersion"].as_str().unwrap();
        assert!(
            service
                .observe_sync_authorization(
                    identity.id,
                    restored,
                    data["restored"]["replayUntil"].as_str().unwrap(),
                    None
                )
                .unwrap()
        );
        for page in pages {
            service
                .apply_sync_pull_page_with_replay(
                    serde_json::from_value(page.clone()).unwrap(),
                    now,
                    identity.id,
                    None,
                    Some(restored),
                )
                .unwrap();
        }
        assert!(service.pending_sync_replay(identity.id).unwrap().is_none());
    }
    assert_eq!(
        service.pull_cursor_for_account(identity.id).unwrap(),
        data["incremental"]["nextCursor"].as_str().unwrap()
    );
    for name in ["badPage", "repairedPage"] {
        service
            .apply_sync_pull_page_for_account(
                serde_json::from_value(data[name].clone()).unwrap(),
                now,
                identity.id,
                None,
            )
            .unwrap();
    }
    assert_eq!(reference_sync_retained(&service), retained);
    let connection = service.connection.lock().unwrap();
    let (supplier, amount, active): (String, i64, bool) = connection
        .query_row(
            "SELECT supplier_id,unit_price_minor,is_active FROM local_material_prices WHERE id=?1",
            [data["late"].as_str().unwrap()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(supplier, data["sa"].as_str().unwrap());
    assert_eq!(amount, 27);
    assert!(active);
    let foreign_keys: i64 = connection
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(foreign_keys, 0);
    let recovered: i64 = connection
        .query_row(
            "SELECT recovered_version FROM local_sync_catalog_quarantine WHERE entity_id=?1",
            [data["broken"].as_str().unwrap()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(recovered, 2);
}

fn reference_sync_retained(service: &LocalAuthService) -> Vec<Vec<Vec<rusqlite::types::Value>>> {
    let connection = service.connection.lock().unwrap();
    [
        "local_sync_outbox",
        "local_purchase_orders",
        "local_purchase_order_items",
        "local_master_data_audit_entries",
    ]
    .into_iter()
    .map(|table| {
        let mut statement = connection
            .prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))
            .unwrap();
        let columns = statement.column_count();
        statement
            .query_map([], |row| {
                (0..columns)
                    .map(|i| row.get(i))
                    .collect::<Result<Vec<_>, _>>()
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    })
    .collect()
}

fn reference_sync_change(kind: &str, id: Uuid, payload: serde_json::Value) -> SyncPullChangeInput {
    SyncPullChangeInput {
        cursor: "1".into(),
        entity_type: kind.into(),
        entity_id: id,
        operation: "upsert".into(),
        version: 7,
        payload,
        changed_at: "2026-10-23T00:00:00Z".into(),
    }
}

#[test]
fn reference_sync_accepts_both_contracts_with_trusted_envelope_metadata() {
    let country = Uuid::new_v4();
    let project = Uuid::new_v4();
    let department = Uuid::new_v4();
    let records = [
        reference_sync_change(
            "country",
            country,
            serde_json::json!({"id":country,"businessCode":"C","name":"Country","timeZone":"UTC","isActive":true}),
        ),
        reference_sync_change(
            "project",
            project,
            serde_json::json!({"id":project,"countryId":country,"businessCode":"P","name":"Project","site":"Site","departmentName":"Department","defaultCurrency":"USD","defaultLanguagePair":"zh_en","isActive":true}),
        ),
        reference_sync_change(
            "department",
            department,
            serde_json::json!({"id":department,"businessCode":"D","name":"Department","isActive":true}),
        ),
        reference_sync_change(
            "team",
            Uuid::new_v4(),
            serde_json::json!({"departmentId":department,"businessCode":"T","name":"Team","isActive":true}),
        ),
        reference_sync_change(
            "site",
            Uuid::new_v4(),
            serde_json::json!({"projectId":project,"businessCode":"S","name":"Site","isActive":true}),
        ),
        reference_sync_change(
            "unit",
            Uuid::new_v4(),
            serde_json::json!({"businessCode":"U","name":"Unit","isActive":true}),
        ),
    ];
    for mut change in records {
        change.payload["id"] = serde_json::json!(change.entity_id);
        change.payload["version"] = serde_json::json!("untrusted legacy metadata");
        let canonical = serde_json::to_value(parse_remote_reference(&change).unwrap()).unwrap();
        assert_eq!(canonical["version"], 7);
        assert_eq!(canonical["kind"], change.entity_type);
        let mut legacy = change.clone();
        legacy.payload = canonical.clone();
        legacy.payload.as_object_mut().unwrap().remove("version");
        assert_eq!(
            serde_json::to_value(parse_remote_reference(&legacy).unwrap()).unwrap(),
            canonical
        );
        legacy
            .payload
            .as_object_mut()
            .unwrap()
            .extend(change.payload.as_object().unwrap().clone());
        assert_eq!(
            serde_json::to_value(parse_remote_reference(&legacy).unwrap()).unwrap(),
            canonical
        );
    }
    let mut duplicate = reference_sync_change(
        "project",
        project,
        serde_json::json!({"id":project,"countryId":country.to_string().to_uppercase(),"country_id":country,"businessCode":"P","name":"Project","site":"Site","departmentName":"Department","defaultCurrency":"USD","defaultLanguagePair":"zh_en","isActive":true}),
    );
    assert!(parse_remote_reference(&duplicate).is_ok());
    duplicate.payload["country_id"] = serde_json::json!(Uuid::new_v4());
    assert_eq!(
        parse_remote_reference(&duplicate),
        Err(AuthError::InvalidInput)
    );
}

#[test]
fn reference_sync_rejects_ambiguous_fields_and_forged_metadata() {
    let id = Uuid::new_v4();
    let valid = reference_sync_change(
        "country",
        id,
        serde_json::json!({"kind":"country","id":id,"businessCode":"C","name":"Country","timeZone":"UTC","isActive":true}),
    );
    for (camel, snake) in [
        ("businessCode", "business_code"),
        ("timeZone", "time_zone"),
        ("isActive", "is_active"),
        ("countryId", "country_id"),
        ("projectId", "project_id"),
        ("departmentId", "department_id"),
        ("departmentName", "department_name"),
        ("defaultCurrency", "default_currency"),
        ("defaultLanguagePair", "default_language_pair"),
    ] {
        let mut change = valid.clone();
        change.payload[camel] = serde_json::json!("first");
        change.payload[snake] = serde_json::json!("second");
        assert_eq!(
            parse_remote_reference(&change),
            Err(AuthError::InvalidInput),
            "{camel}/{snake}"
        );
    }
    for version in [0, -1] {
        let mut change = valid.clone();
        change.version = version;
        assert_eq!(
            parse_remote_reference(&change),
            Err(AuthError::InvalidInput)
        );
    }
    for field in ["id", "kind"] {
        let mut change = valid.clone();
        change.payload[field] = serde_json::json!(Uuid::new_v4());
        assert_eq!(
            parse_remote_reference(&change),
            Err(AuthError::InvalidInput)
        );
    }
}

#[test]
fn reference_sync_invalid_contract_rolls_back_page_and_keeps_real_references() {
    let service = LocalAuthService::open_in_memory().unwrap();
    let now = SystemTime::now();
    let identity = account();
    service
        .cache_verified_account(identity.clone(), "correct-password", now)
        .unwrap();
    let captcha = service.issue_captcha(now).unwrap();
    service
        .offline_login(
            &identity.username,
            "correct-password",
            captcha.id,
            answer(&captcha.question),
            now,
        )
        .unwrap();
    let country = Uuid::new_v4();
    let project = Uuid::new_v4();
    let country_change = reference_sync_change(
        "country",
        country,
        serde_json::json!({"id":country,"businessCode":"C","name":"Country","timeZone":"UTC","isActive":true,"version":0}),
    );
    let mut project_change = reference_sync_change(
        "project",
        project,
        serde_json::json!({"id":project,"countryId":country,"businessCode":"P","name":"Project","site":"Site","departmentName":"Department","defaultCurrency":"USD","defaultLanguagePair":"zh_en","isActive":true}),
    );
    project_change.cursor = "2".into();
    service
        .apply_sync_pull_page_for_account(
            SyncPullPageInput {
                changes: vec![country_change.clone(), project_change.clone()],
                next_cursor: "2".into(),
            },
            now,
            identity.id,
            None,
        )
        .unwrap();
    let version: i64 = service
        .connection
        .lock()
        .unwrap()
        .query_row(
            "SELECT version FROM local_countries WHERE id=?1",
            [country.to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, 7);
    let mut conflicts = country_change.clone();
    conflicts.cursor = "3".into();
    conflicts.version = 8;
    conflicts.payload["is_active"] = serde_json::json!(false);
    let mut forged = conflicts.clone();
    forged.payload = country_change.payload.clone();
    forged.payload["id"] = serde_json::json!(Uuid::new_v4());
    let mut zero_version = country_change.clone();
    zero_version.version = 0;
    let mut negative_version = country_change.clone();
    negative_version.version = -1;
    for mut invalid in [conflicts, forged, zero_version, negative_version] {
        invalid.cursor = "3".into();
        assert_eq!(
            service.apply_sync_pull_page_for_account(
                SyncPullPageInput {
                    changes: vec![invalid],
                    next_cursor: "3".into()
                },
                now,
                identity.id,
                None
            ),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(service.pull_cursor_for_account(identity.id).unwrap(), "2");
    }
    let missing = Uuid::new_v4();
    project_change.entity_id = Uuid::new_v4();
    project_change.payload["id"] = serde_json::json!(project_change.entity_id);
    project_change.payload["businessCode"] = serde_json::json!("MISSING");
    project_change.payload["countryId"] = serde_json::json!(missing);
    project_change.cursor = "3".into();
    assert_eq!(
        service.apply_sync_pull_page_for_account(
            SyncPullPageInput {
                changes: vec![project_change],
                next_cursor: "3".into()
            },
            now,
            identity.id,
            None
        ),
        Err(AuthError::Database)
    );
    assert_eq!(service.pull_cursor_for_account(identity.id).unwrap(), "2");
    let connection = service.connection.lock().unwrap();
    let fabricated: i64 = connection
        .query_row(
            "SELECT count(*) FROM local_countries WHERE id=?1",
            [missing.to_string()],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(fabricated, 0);
    let valid_projects: i64 = connection
        .query_row("SELECT count(*) FROM local_projects", [], |row| row.get(0))
        .unwrap();
    assert_eq!(valid_projects, 1);
}
