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
