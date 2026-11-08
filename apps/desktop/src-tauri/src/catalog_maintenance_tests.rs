use super::*;

fn fixture(role: Role) -> (LocalAuthService, Uuid, SystemTime) {
    let service = LocalAuthService::open_in_memory().unwrap();
    fixture_service(service, role)
}

fn fixture_service(service: LocalAuthService, role: Role) -> (LocalAuthService, Uuid, SystemTime) {
    let now = SystemTime::now();
    let account = Uuid::new_v4();
    service
        .cache_verified_account(
            CachedAccount {
                id: account,
                username: "synthetic-catalog".into(),
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
            "synthetic-catalog",
            "synthetic-password",
            captcha.id,
            answer,
            now,
        )
        .unwrap();
    crate::tests::grant_new_test_scope(&service, account, Uuid::new_v4(), now);
    (service, account, now)
}

fn supplier(
    id: Uuid,
    country: Uuid,
    notes: Option<serde_json::Value>,
    version: i64,
) -> SupplierInput {
    let mut value = serde_json::json!({"id":id,"countryId":country,"businessCode":"SYNTH-NOTES","name":"Synthetic supplier","isPreferred":false,"isBlacklisted":false,"isActive":true,"version":version});
    if let Some(notes) = notes {
        value["notes"] = notes;
    }
    serde_json::from_value(value).unwrap()
}

fn country(service: &LocalAuthService) -> Uuid {
    service
        .connection
        .lock()
        .unwrap()
        .query_row("SELECT country_id FROM local_projects LIMIT 1", [], |r| {
            r.get::<_, String>(0)
        })
        .unwrap()
        .parse()
        .unwrap()
}

#[test]
fn supplier_notes_migration_preserves_existing_rows_and_legacy_payload_shape() {
    let database = Connection::open_in_memory().unwrap();
    database
        .execute_batch(include_str!("../migrations/0004_local_catalog.sql"))
        .unwrap();
    database.execute("INSERT INTO local_suppliers(id,business_code,name,is_active,version) VALUES('legacy','LEGACY','Synthetic legacy',1,1)", []).unwrap();
    database
        .execute_batch(include_str!("../migrations/0064_supplier_notes.sql"))
        .unwrap();
    assert_eq!(
        database
            .query_row(
                "SELECT name,notes FROM local_suppliers WHERE id='legacy'",
                [],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
            )
            .unwrap(),
        ("Synthetic legacy".into(), None)
    );
    let legacy = supplier(Uuid::new_v4(), Uuid::new_v4(), None, 1);
    assert!(legacy.notes.is_none());
    assert!(serde_json::to_value(legacy).unwrap().get("notes").is_none());
    assert_eq!(
        supplier(
            Uuid::new_v4(),
            Uuid::new_v4(),
            Some(serde_json::Value::Null),
            1
        )
        .notes,
        Some(None)
    );
}

#[test]
fn supplier_notes_trusted_write_restart_and_failed_outbox_preserve_data() {
    let path =
        std::env::temp_dir().join(format!("honsen-supplier-notes-{}.sqlite", Uuid::new_v4()));
    let (mut service, _, now) = fixture_service(
        LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap(),
        Role::Purchaser,
    );
    let country = country(&service);
    let id = Uuid::new_v4();
    service
        .save_supplier(
            supplier(
                id,
                country,
                Some(serde_json::json!("Synthetic 中文 note")),
                1,
            ),
            now,
        )
        .unwrap();
    assert_eq!(
        service.list_suppliers(now).unwrap()[0].notes.as_deref(),
        Some("Synthetic 中文 note")
    );
    service
        .save_supplier(supplier(id, country, None, 2), now)
        .unwrap();
    assert_eq!(
        service.list_suppliers(now).unwrap()[0].notes.as_deref(),
        Some("Synthetic 中文 note")
    );
    let before = service.pending_sync_events(100, now).unwrap();
    service.connection.lock().unwrap().execute_batch("CREATE TRIGGER fail_supplier_notes BEFORE INSERT ON local_sync_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    assert!(matches!(
        service.save_supplier(supplier(id, country, Some(serde_json::Value::Null), 3), now),
        Err(AuthError::Database)
    ));
    assert_eq!(
        service.list_suppliers(now).unwrap()[0].notes.as_deref(),
        Some("Synthetic 中文 note")
    );
    assert_eq!(service.pending_sync_events(100, now).unwrap(), before);
    service
        .connection
        .lock()
        .unwrap()
        .execute_batch("DROP TRIGGER fail_supplier_notes")
        .unwrap();
    assert!(matches!(
        service.save_supplier(
            supplier(id, country, Some(serde_json::json!("x".repeat(1001))), 3),
            now
        ),
        Err(AuthError::InvalidInput)
    ));
    let vault = std::mem::replace(
        &mut service.credential_vault,
        Box::new(MemoryCredentialVault::new()),
    );
    drop(service);
    let reopened = LocalAuthService::open(
        Connection::open(&path).unwrap(),
        vault,
        path.with_extension("media"),
        None,
    )
    .unwrap();
    let captcha = reopened.issue_captcha(now).unwrap();
    let answer = captcha
        .question
        .split_whitespace()
        .filter_map(|s| s.parse::<u8>().ok())
        .sum();
    reopened
        .offline_login(
            "synthetic-catalog",
            "synthetic-password",
            captcha.id,
            answer,
            now,
        )
        .unwrap();
    assert_eq!(
        reopened.list_suppliers(now).unwrap()[0].notes.as_deref(),
        Some("Synthetic 中文 note")
    );
    assert_eq!(reopened.pending_sync_events(100, now).unwrap(), before);
    reopened
        .save_supplier(supplier(id, country, Some(serde_json::Value::Null), 3), now)
        .unwrap();
    assert_eq!(reopened.list_suppliers(now).unwrap()[0].notes, None);
    drop(reopened);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn supplier_notes_project_to_second_sqlite_keep_omitted_and_clear_explicit_null() {
    let (source, _, now) = fixture(Role::Purchaser);
    let country = country(&source);
    let supplier_id = Uuid::new_v4();
    source
        .save_supplier(
            supplier(
                supplier_id,
                country,
                Some(serde_json::json!("Synthetic retained note")),
                1,
            ),
            now,
        )
        .unwrap();
    let payload: serde_json::Value =
        serde_json::from_str(&source.pending_sync_events(100, now).unwrap()[0].payload_json)
            .unwrap();
    let (destination, account, _) = fixture(Role::Purchaser);
    crate::tests::grant_new_test_scope(&destination, account, country, now);
    for (version, notes) in [
        (1, Some(serde_json::json!("Synthetic retained note"))),
        (2, None),
        (3, Some(serde_json::Value::Null)),
    ] {
        let mut next = payload.clone();
        next["version"] = serde_json::json!(version);
        if let Some(notes) = notes {
            next["notes"] = notes;
        } else {
            next.as_object_mut().unwrap().remove("notes");
        }
        destination
            .apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![SyncPullChangeInput {
                        cursor: version.to_string(),
                        entity_type: "supplier".into(),
                        entity_id: supplier_id,
                        operation: "upsert".into(),
                        version,
                        payload: next,
                        changed_at: "2026-11-07T00:00:00Z".into(),
                    }],
                    next_cursor: version.to_string(),
                },
                now,
            )
            .unwrap();
        assert_eq!(
            destination.list_suppliers(now).unwrap()[0].notes.as_deref(),
            if version < 3 {
                Some("Synthetic retained note")
            } else {
                None
            }
        );
    }
    assert!(
        destination
            .pending_sync_events(100, now)
            .unwrap()
            .is_empty()
    );
}

fn material(id: Uuid, active: bool, version: i64) -> MaterialInput {
    serde_json::from_value(serde_json::json!({"id":id,"nameZh":"Synthetic maintenance material","aliases":[],"model":"M","specification":"S","unit":"pcs","isActive":active,"version":version})).unwrap()
}

#[test]
fn inactive_material_maintenance_reactivates_same_uuid_with_transactional_outbox() {
    let (service, _, now) = fixture(Role::Purchaser);
    let id = Uuid::new_v4();
    service.save_material(material(id, true, 1), now).unwrap();
    service.save_material(material(id, false, 2), now).unwrap();
    assert!(
        service
            .search_catalog("Synthetic maintenance", None, now)
            .unwrap()
            .is_empty()
    );
    let rows = service
        .search_catalog_with_inactive("Synthetic maintenance", None, true, now)
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id, id);
    assert!(!rows[0].is_active);
    assert_eq!(rows[0].version, 2);
    assert_eq!(serde_json::to_value(&rows[0]).unwrap()["isActive"], false);
    service.save_material(material(id, true, 3), now).unwrap();
    let active = service
        .search_catalog("Synthetic maintenance", None, now)
        .unwrap();
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].id, id);
    assert!(active[0].is_active);
    let events = service.pending_sync_events(100, now).unwrap();
    assert_eq!(events.len(), 3);
    assert!(
        events
            .iter()
            .all(|event| event.entity_id == id && event.entity_type == "material")
    );
    let connection = service.connection.lock().unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT count(*) FROM local_materials WHERE id=?1 AND deleted_at IS NULL",
                [id.to_string()],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
}

#[test]
fn catalog_edit_deactivate_and_reactivate_preserve_existing_material_category() {
    let (service, _, now) = fixture(Role::Administrator);
    let category_id = Uuid::new_v4();
    service
        .save_reference_master_data(
            ReferenceMasterDataInput::MaterialCategory {
                id: category_id,
                business_code: "SYNTH-CATEGORY".into(),
                name: "Synthetic category".into(),
                is_active: true,
                version: 1,
            },
            now,
        )
        .unwrap();
    let id = Uuid::new_v4();
    let mut value = material(id, true, 1);
    value.category_id = Some(category_id);
    service.save_material(value.clone(), now).unwrap();
    for (version, active) in [(2, true), (3, false), (4, true)] {
        let view = service
            .search_catalog_with_inactive("Synthetic maintenance", None, true, now)
            .unwrap()
            .remove(0);
        assert_eq!(view.category_id, Some(category_id));
        assert_eq!(
            serde_json::to_value(&view).unwrap()["categoryId"],
            category_id.to_string()
        );
        value.category_id = view.category_id;
        value.is_active = active;
        value.version = version;
        service.save_material(value.clone(), now).unwrap();
    }
    let pending = service.pending_sync_events(100, now).unwrap();
    for event in pending.iter().filter(|event| event.entity_id == id) {
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&event.payload_json).unwrap()["categoryId"],
            category_id.to_string()
        );
    }
    assert_eq!(
        service
            .search_catalog("Synthetic maintenance", None, now)
            .unwrap()[0]
            .category_id,
        Some(category_id)
    );
}

#[test]
fn inactive_material_read_cannot_bypass_role_or_scope_and_does_not_mutate_history() {
    for role in [Role::Engineer, Role::Viewer, Role::SuperAdministrator] {
        let (service, _, now) = fixture(role);
        assert!(matches!(
            service.search_catalog_with_inactive("", None, true, now),
            Err(AuthError::Forbidden)
        ));
        assert!(service.search_catalog("", None, now).is_ok());
    }
    let (service, account, now) = fixture(Role::Administrator);
    let id = Uuid::new_v4();
    service.save_material(material(id, false, 1), now).unwrap();
    let pending = service.pending_sync_events(100, now).unwrap();
    assert_eq!(
        service
            .search_catalog_with_inactive("", None, true, now)
            .unwrap()
            .len(),
        1
    );
    assert_eq!(service.pending_sync_events(100, now).unwrap(), pending);
    service
        .connection
        .lock()
        .unwrap()
        .execute(
            "DELETE FROM local_authorization_snapshots WHERE account_id=?1",
            [account.to_string()],
        )
        .unwrap();
    assert!(matches!(
        service.search_catalog_with_inactive("", None, true, now),
        Err(AuthError::Forbidden)
    ));
}

#[test]
fn failed_material_reactivation_keeps_disabled_row_and_pending_outbox_unchanged() {
    let (service, _, now) = fixture(Role::Purchaser);
    let id = Uuid::new_v4();
    service.save_material(material(id, false, 1), now).unwrap();
    let before = service.pending_sync_events(100, now).unwrap();
    service.connection.lock().unwrap().execute_batch("CREATE TRIGGER fail_material_outbox BEFORE INSERT ON local_sync_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").unwrap();
    assert!(matches!(
        service.save_material(material(id, true, 2), now),
        Err(AuthError::Database)
    ));
    assert!(service.search_catalog("", None, now).unwrap().is_empty());
    assert!(
        !service
            .search_catalog_with_inactive("", None, true, now)
            .unwrap()[0]
            .is_active
    );
    assert_eq!(service.pending_sync_events(100, now).unwrap(), before);
}

#[test]
fn material_picker_pages_multilingual_combinations_and_bounds_without_mutation() {
    let (service, _, now) = fixture(Role::Engineer);
    let mut db = service.connection.lock().unwrap();
    let transaction = db.transaction().unwrap();
    for index in 0..10050 {
        transaction.execute("INSERT INTO local_materials(id,sku,name_zh,name_fr,name_en,aliases_json,model,specification,unit,is_active,version) VALUES(?1,?2,'测试电缆','Câble synthétique','Copper cable','[\"wire\"]','M-25','3x25','m',1,1)", params![Uuid::new_v4().to_string(), format!("SYNTH-{index:05}")]).unwrap();
    }
    transaction.execute("INSERT INTO local_materials(id,sku,name_zh,aliases_json,model,specification,unit,is_active,version) VALUES(?1,'SYNTH-INACTIVE','测试电缆','[]','M-25','3x25','m',0,1)", [Uuid::new_v4().to_string()]).unwrap();
    transaction.commit().unwrap();
    let before: i64 = db
        .query_row("SELECT COUNT(*) FROM local_sync_outbox", [], |row| {
            row.get(0)
        })
        .unwrap();
    drop(db);
    let started = std::time::Instant::now();
    let first = service
        .search_catalog_page("电缆 Copper wire M-25", None, None, now)
        .unwrap();
    println!(
        "material_picker synthetic rows=10050 first_page_ms={} records={}",
        started.elapsed().as_millis(),
        first.records.len()
    );
    assert_eq!(first.records.len(), 50);
    assert_eq!(first.records[0].name_en.as_deref(), Some("Copper cable"));
    let second = service
        .search_catalog_page(
            "电缆 Copper wire M-25",
            None,
            first.next_cursor.clone(),
            now,
        )
        .unwrap();
    assert_eq!(second.records.len(), 50);
    assert!(
        second
            .records
            .iter()
            .all(|record| !first.records.iter().any(|old| old.id == record.id))
    );
    let all_started = std::time::Instant::now();
    let mut seen = std::collections::HashSet::new();
    let mut cursor = None;
    let mut pages = 0;
    loop {
        let page = service
            .search_catalog_page("电缆 Copper wire M-25", None, cursor, now)
            .unwrap();
        assert!(page.records.len() <= 50);
        for record in page.records {
            assert!(
                seen.insert(record.id),
                "duplicate across stable cursor pages"
            );
        }
        pages += 1;
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(seen.len(), 10050);
    assert_eq!(pages, 201);
    println!(
        "material_picker full_scan rows={} pages={} bounded_page=50 elapsed_ms={}",
        seen.len(),
        pages,
        all_started.elapsed().as_millis()
    );
    let single = service
        .search_catalog_page("Câble SYNTH-10049", None, None, now)
        .unwrap();
    assert_eq!(single.records.len(), 1);
    assert!(single.next_cursor.is_none());
    assert!(
        service
            .search_catalog_page("%", None, None, now)
            .unwrap()
            .records
            .is_empty()
    );
    assert!(
        service
            .search_catalog_page("_", None, None, now)
            .unwrap()
            .records
            .is_empty()
    );
    assert!(
        service
            .search_catalog_page("' OR 1=1 --", None, None, now)
            .unwrap()
            .records
            .is_empty()
    );
    assert!(matches!(
        service.search_catalog_page(&"x".repeat(256), None, None, now),
        Err(AuthError::InvalidInput)
    ));
    assert!(matches!(
        service.search_catalog_page("a b c d e f g h i", None, None, now),
        Err(AuthError::InvalidInput)
    ));
    assert!(matches!(
        service.search_catalog_page("", Some(Uuid::new_v4()), None, now),
        Err(AuthError::InvalidInput)
    ));
    let cursor = CatalogSearchCursor {
        name_zh: "x".repeat(1025),
        model: String::new(),
        id: Uuid::new_v4(),
    };
    assert!(matches!(
        service.search_catalog_page("", None, Some(cursor), now),
        Err(AuthError::InvalidInput)
    ));
    let after: i64 = service
        .connection
        .lock()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM local_sync_outbox", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(before, after);
    assert!(
        LocalAuthService::open_in_memory()
            .unwrap()
            .search_catalog_page("", None, None, now)
            .is_err()
    );
}

#[test]
fn material_catalog_inactive_pagination_requires_maintenance_role_and_preserves_read_only_state() {
    let (service, _, now) = fixture(Role::Purchaser);
    let mut connection = service.connection.lock().unwrap();
    let transaction = connection.transaction().unwrap();
    for index in 0..140 {
        transaction.execute("INSERT INTO local_materials(id,sku,name_zh,name_fr,name_en,aliases_json,model,specification,unit,is_active,version) VALUES(?1,?2,?3,'Matériau','Material','[]','M','S','pcs',?4,1)", params![Uuid::new_v4().to_string(),format!("CAT-{index:03}"),format!("材料{index:03}"),index<120]).unwrap();
    }
    transaction.commit().unwrap();
    let before: i64 = connection
        .query_row("SELECT COUNT(*) FROM local_sync_outbox", [], |row| {
            row.get(0)
        })
        .unwrap();
    drop(connection);
    for (include_inactive, expected) in [(false, 120), (true, 140)] {
        let mut cursor = None;
        let mut seen = std::collections::HashSet::new();
        loop {
            let page = service
                .search_catalog_page_with_inactive("", None, cursor, include_inactive, now)
                .unwrap();
            assert!(page.records.len() <= 50);
            for record in page.records {
                assert!(include_inactive || record.is_active);
                assert!(seen.insert(record.id));
            }
            cursor = page.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        assert_eq!(seen.len(), expected);
    }
    assert!(
        service
            .search_catalog_page("CAT-139", None, None, now)
            .unwrap()
            .records
            .is_empty()
    );
    let inactive = service
        .search_catalog_page_with_inactive("CAT-139", None, None, true, now)
        .unwrap();
    assert_eq!(inactive.records.len(), 1);
    assert!(!inactive.records[0].is_active);
    assert!(inactive.next_cursor.is_none());
    assert_eq!(
        service
            .search_catalog_page_with_inactive("CAT-139", None, None, true, now)
            .unwrap(),
        inactive
    );
    let after: i64 = service
        .connection
        .lock()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM local_sync_outbox", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(before, after);
    let (engineer, _, time) = fixture(Role::Engineer);
    assert!(matches!(
        engineer.search_catalog_page_with_inactive("", None, None, true, time),
        Err(AuthError::Forbidden)
    ));
    assert!(engineer.search_catalog_page("", None, None, time).is_ok());
}

#[test]
fn supplier_search_pages_are_bounded_stable_country_scoped_and_read_only() {
    let (service, account, now) = fixture(Role::Engineer);
    let allowed_country = country(&service);
    let denied_country = Uuid::new_v4();
    let mut db = service.connection.lock().unwrap();
    let transaction = db.transaction().unwrap();
    transaction.execute("INSERT INTO local_countries(id,business_code,name,time_zone,is_active,version) VALUES(?1,'OTHER','Other synthetic country','UTC',1,1)",[denied_country.to_string()]).unwrap();
    let mut selectable_count = 0;
    for index in 0..10050 {
        let active = index % 13 != 0;
        let blacklisted = index % 17 == 0;
        if active && !blacklisted {
            selectable_count += 1;
        }
        transaction.execute("INSERT INTO local_suppliers(id,country_id,business_code,name,contact_name,address,city,is_active,is_blacklisted,is_preferred,version) VALUES(?1,?2,?3,'Synthetic supplier','Synthetic contact','Synthetic address','Synthetic city',?4,?5,0,1)",params![Uuid::new_v4().to_string(),allowed_country.to_string(),format!("SYNTH-{index:05}"),active,blacklisted]).unwrap();
    }
    transaction.execute("INSERT INTO local_suppliers(id,country_id,business_code,name,is_active,is_blacklisted,version) VALUES(?1,?2,'OTHER-SUP','Other country supplier',1,0,1)",params![Uuid::new_v4().to_string(),denied_country.to_string()]).unwrap();
    transaction.commit().unwrap();
    let before: i64 = db
        .query_row("SELECT COUNT(*) FROM local_sync_outbox", [], |row| {
            row.get(0)
        })
        .unwrap();
    drop(db);
    for (selectable_only, expected) in [(false, 10050), (true, selectable_count)] {
        let start = std::time::Instant::now();
        let mut cursor = None;
        let mut seen = std::collections::HashSet::new();
        let mut pages = 0;
        loop {
            let page = service
                .search_suppliers_page("", allowed_country, cursor, selectable_only, now)
                .unwrap();
            if pages == 0 {
                println!(
                    "supplier_search rows=10050 selectable_only={} first_page_ms={} bounded_page={}",
                    selectable_only,
                    start.elapsed().as_millis(),
                    page.records.len()
                );
            }
            assert!(page.records.len() <= 50);
            for record in page.records {
                assert_eq!(record.country_id, allowed_country);
                assert!(!selectable_only || record.is_active && !record.is_blacklisted);
                assert!(seen.insert(record.id));
            }
            pages += 1;
            cursor = page.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        println!(
            "supplier_search selectable_only={} records={} pages={} elapsed_ms={}",
            selectable_only,
            seen.len(),
            pages,
            start.elapsed().as_millis()
        );
        assert_eq!(seen.len(), expected);
    }
    assert_eq!(service.list_suppliers(now).unwrap().len(), 10050);
    let combined = service
        .search_suppliers_page(
            "contact city SYNTH-10049",
            allowed_country,
            None,
            false,
            now,
        )
        .unwrap();
    assert_eq!(combined.records.len(), 1);
    assert!(combined.next_cursor.is_none());
    assert_eq!(
        combined,
        service
            .search_suppliers_page(
                "contact city SYNTH-10049",
                allowed_country,
                None,
                false,
                now
            )
            .unwrap()
    );
    assert!(
        service
            .search_suppliers_page("", denied_country, None, false, now)
            .unwrap()
            .records
            .is_empty()
    );
    for query in ["%", "_", "' OR 1=1 --"] {
        assert!(
            service
                .search_suppliers_page(query, allowed_country, None, false, now)
                .unwrap()
                .records
                .is_empty()
        );
    }
    assert!(matches!(
        service.search_suppliers_page(&"x".repeat(256), allowed_country, None, false, now),
        Err(AuthError::InvalidInput)
    ));
    assert!(matches!(
        service.search_suppliers_page("a b c d e f g h i", allowed_country, None, false, now),
        Err(AuthError::InvalidInput)
    ));
    let long_cursor = SupplierSearchCursor {
        is_active: true,
        name: "x".repeat(1025),
        id: Uuid::new_v4(),
    };
    assert!(matches!(
        service.search_suppliers_page("", allowed_country, Some(long_cursor), false, now),
        Err(AuthError::InvalidInput)
    ));
    let db = service.connection.lock().unwrap();
    assert_eq!(
        before,
        db.query_row("SELECT COUNT(*) FROM local_sync_outbox", [], |row| row
            .get::<_, i64>(0))
            .unwrap()
    );
    db.execute(
        "UPDATE local_authorization_snapshots SET expires_at=?2, verified_at=?2-100 WHERE account_id=?1",
        params![account.to_string(), unix_seconds(now) - 1],
    )
    .unwrap();
    drop(db);
    assert!(
        service
            .search_suppliers_page("", allowed_country, None, false, now)
            .unwrap()
            .records
            .is_empty()
    );
    assert!(
        LocalAuthService::open_in_memory()
            .unwrap()
            .search_suppliers_page("", allowed_country, None, false, now)
            .is_err()
    );
}

#[test]
fn execution_read_exposes_each_parent_country_without_changing_scope_or_money() {
    let (service, account, now) = fixture(Role::Purchaser);
    let first_country = country(&service);
    let second_country = Uuid::new_v4();
    crate::tests::grant_new_test_scope(&service, account, second_country, now);
    let third_country = Uuid::new_v4();
    let third_project = Uuid::new_v4();
    let db = service.connection.lock().unwrap();
    let first_scope:(String,String,String)=db.query_row("SELECT p.id,a.department_id,a.team_id FROM local_projects p JOIN local_authorization_snapshots a ON a.project_id=p.id WHERE p.country_id=?1 AND a.account_id=?2",params![first_country.to_string(),account.to_string()],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
    let second_scope:(String,String,String)=db.query_row("SELECT p.id,a.department_id,a.team_id FROM local_projects p JOIN local_authorization_snapshots a ON a.project_id=p.id WHERE p.country_id=?1 AND a.account_id=?2",params![second_country.to_string(),account.to_string()],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
    db.execute("INSERT INTO local_countries(id,business_code,name,time_zone,is_active,version) VALUES(?1,'SYNTH-OTHER','Synthetic other country','UTC',1,1)",[third_country.to_string()]).unwrap();
    db.execute("INSERT INTO local_projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair,is_active,version) VALUES(?1,?2,'SYNTH-OTHER-P','Synthetic other project','site','department','XOF','zh_fr',1,1)",params![third_project.to_string(),third_country.to_string()]).unwrap();
    let ids = [Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()];
    let scopes = [
        (first_country, first_scope.clone()),
        (second_country, second_scope),
        (
            third_country,
            (third_project.to_string(), first_scope.1, first_scope.2),
        ),
    ];
    for (index, (country, scope)) in scopes.iter().enumerate() {
        db.execute("INSERT INTO local_purchase_orders(id,display_no,country_id,project_id,site,department_id,team_id,applicant_id,currency,primary_currency,language_pair,status,workflow_status,procurement_mode,order_date,delivery_address,total_minor,version,created_at,updated_at) VALUES(?1,?2,?3,?4,'Synthetic site',?5,?6,?7,'XOF','XOF','zh_fr','draft','confirmed','honsen_self_purchase','2026-11-09','Synthetic delivery',9007199254740993,7,1,1)",params![ids[index].to_string(),format!("SYNTH-ORDER-{index}"),country.to_string(),scope.0,scope.1,scope.2,account.to_string()]).unwrap();
    }
    let before: Vec<(String, String, i64, i64)> = db
        .prepare("SELECT id,country_id,total_minor,version FROM local_purchase_orders ORDER BY id")
        .unwrap()
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .map(Result::unwrap)
        .collect();
    drop(db);
    let orders = service.list_confirmed_procurement_orders(now).unwrap();
    assert_eq!(orders.len(), 2);
    for (id, expected_country) in [(ids[0], first_country), (ids[1], second_country)] {
        let order = orders.iter().find(|order| order.id == id).unwrap();
        assert_eq!(order.country_id, expected_country);
        assert_eq!(order.payment_summary.payable_minor, "9007199254740993");
        assert_eq!(order.payment_summary.remaining_minor, "9007199254740993");
        assert_eq!(
            serde_json::to_value(order).unwrap()["countryId"],
            expected_country.to_string()
        );
    }
    assert!(orders.iter().all(|order| order.id != ids[2]));
    service.connection.lock().unwrap().execute("UPDATE local_authorization_snapshots SET expires_at=?2,verified_at=?2-100 WHERE account_id=?1 AND project_id=?3",params![account.to_string(),unix_seconds(now)-1,scopes[1].1.0]).unwrap();
    assert_eq!(
        service
            .list_confirmed_procurement_orders(now)
            .unwrap()
            .iter()
            .map(|order| order.id)
            .collect::<Vec<_>>(),
        vec![ids[0]]
    );
    let after: Vec<(String, String, i64, i64)> = service
        .connection
        .lock()
        .unwrap()
        .prepare("SELECT id,country_id,total_minor,version FROM local_purchase_orders ORDER BY id")
        .unwrap()
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(before, after);
    let (engineer, _, time) = fixture(Role::Engineer);
    assert!(matches!(
        engineer.list_confirmed_procurement_orders(time),
        Err(AuthError::Forbidden)
    ));
}
