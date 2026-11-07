use super::*;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

struct FailingVerifierVault {
    inner: Arc<MemoryCredentialVault>,
    fail_after_write: Arc<AtomicBool>,
}

impl CredentialVault for FailingVerifierVault {
    fn save_verifier(&self, id: Uuid, value: &str) -> Result<(), AuthError> {
        self.inner.save_verifier(id, value)?;
        if self.fail_after_write.load(Ordering::SeqCst) {
            return Err(AuthError::SecureStorage);
        }
        Ok(())
    }
    fn load_verifier(&self, id: Uuid) -> Result<Option<String>, AuthError> {
        self.inner.load_verifier(id)
    }
    fn save_sync_token(&self, id: Uuid, value: &str) -> Result<(), AuthError> {
        self.inner.save_sync_token(id, value)
    }
    fn load_sync_token(&self, id: Uuid) -> Result<Option<String>, AuthError> {
        self.inner.load_sync_token(id)
    }
}

fn guarded_refresh_fixture() -> (
    LocalAuthService,
    Uuid,
    Uuid,
    Uuid,
    Arc<AtomicBool>,
    SystemTime,
) {
    let flag = Arc::new(AtomicBool::new(false));
    let service = LocalAuthService::open(
        Connection::open_in_memory().unwrap(),
        Box::new(FailingVerifierVault {
            inner: Arc::new(MemoryCredentialVault::new()),
            fail_after_write: flag.clone(),
        }),
        std::env::temp_dir().join(format!("honsen-identity-{}", Uuid::new_v4())),
        None,
    )
    .unwrap();
    let now = SystemTime::now();
    let id = Uuid::new_v4();
    let other = Uuid::new_v4();
    let event = Uuid::new_v4();
    service
        .accept_cloud_login(
            "StableUser1",
            "synthetic-old-password",
            response(id, "StableUser1", Some("旧资料")),
            now,
        )
        .unwrap();
    service
        .cache_verified_account(
            account(other, "OtherUser1"),
            "synthetic-other-password",
            now,
        )
        .unwrap();
    {
        let connection = service.connection.lock().unwrap();
        connection
            .execute(
                "UPDATE local_accounts SET failed_attempts=2 WHERE id=?1",
                [id.to_string()],
            )
            .unwrap();
        connection.execute("INSERT INTO local_sync_outbox(event_id,entity_type,entity_id,operation,base_version,payload_json,created_at,owner_account_id) VALUES(?1,'material',?2,'upsert',0,'{\"syntheticHistory\":true}',1,?3)",params![event.to_string(),Uuid::new_v4().to_string(),id.to_string()]).unwrap();
    }
    assert!(service.require_catalog_read(now).is_ok());
    (service, id, other, event, flag, now)
}

fn assert_refresh_failure_closed(
    service: &LocalAuthService,
    id: Uuid,
    other: Uuid,
    event: Uuid,
    now: SystemTime,
) {
    assert!(matches!(
        service.require_catalog_read(now),
        Err(AuthError::NoActiveSession)
    ));
    assert!(matches!(
        service.sync_request(now),
        Err(AuthError::NoActiveSession)
    ));
    {
        let connection = service.connection.lock().unwrap();
        assert!(connection.session_invalidated);
        assert!(connection.online_session.is_none());
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM local_session WHERE user_id=?1",
                    [id.to_string()],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
        let profile=connection.query_row("SELECT username,display_name,cached_verified_at,failed_attempts FROM local_accounts WHERE id=?1",[id.to_string()],|r|Ok((r.get::<_,String>(0)?,r.get::<_,Option<String>>(1)?,r.get::<_,i64>(2)?,r.get::<_,i64>(3)?))).unwrap();
        assert_eq!(profile, ("StableUser1".into(), Some("旧资料".into()), 0, 2));
        assert_eq!(
            connection
                .query_row(
                    "SELECT cached_verified_at FROM local_accounts WHERE id=?1",
                    [other.to_string()],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            unix_seconds(now)
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT payload_json FROM local_sync_outbox WHERE event_id=?1",
                    [event.to_string()],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "{\"syntheticHistory\":true}"
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM local_accounts", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            2
        );
    }
    // The provider really did replace the verifier before the injected failure.
    let verifier = service.credential_vault.load_verifier(id).unwrap().unwrap();
    assert!(verify_password(&verifier, "synthetic-new-password"));
    for password in ["synthetic-old-password", "synthetic-new-password"] {
        assert!(matches!(
            offline(service, "stableuser1", password, now),
            Err(AuthError::OfflineWindowExpired)
        ));
    }
    let other_session = offline(service, "OTHERUSER1", "synthetic-other-password", now).unwrap();
    assert_eq!(other_session.user_id, other);
}

fn assert_refresh_recovers(service: &LocalAuthService, id: Uuid, event: Uuid, now: SystemTime) {
    let online = service
        .accept_cloud_login(
            "STABLEUSER1",
            "synthetic-new-password",
            response(id, "StableUser1", Some("新资料")),
            now,
        )
        .unwrap();
    assert_eq!(online.user_id, id);
    assert_eq!(online.display_name.as_deref(), Some("新资料"));
    let local = offline(service, "sTaBlEuSeR1", "synthetic-new-password", now).unwrap();
    assert_eq!(local.user_id, id);
    assert_eq!(local.username, "StableUser1");
    assert!(service.require_catalog_read(now).is_ok());
    assert_eq!(
        service
            .connection
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM local_sync_outbox WHERE event_id=?1",
                [event.to_string()],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
}

#[test]
fn cache_refresh_sql_failure_after_verifier_write_closes_old_window_and_recovers() {
    let (service, id, other, event, _, now) = guarded_refresh_fixture();
    service.connection.lock().unwrap().execute_batch("CREATE TEMP TRIGGER identity_profile_write_failure BEFORE UPDATE OF display_name ON local_accounts BEGIN SELECT RAISE(ABORT,'synthetic profile write failure'); END;").unwrap();
    assert!(matches!(
        service.accept_cloud_login(
            "StableUser1",
            "synthetic-new-password",
            response(id, "StableUser1", Some("新资料")),
            now
        ),
        Err(AuthError::Database)
    ));
    assert_refresh_failure_closed(&service, id, other, event, now);
    service
        .connection
        .lock()
        .unwrap()
        .execute_batch("DROP TRIGGER identity_profile_write_failure;")
        .unwrap();
    assert_refresh_recovers(&service, id, event, now);
}

#[test]
fn cache_refresh_commit_failure_after_verifier_write_closes_old_window_and_recovers() {
    let (service, id, other, event, _, now) = guarded_refresh_fixture();
    service.connection.lock().unwrap().execute_batch("CREATE TABLE identity_commit_parent(id INTEGER PRIMARY KEY); CREATE TABLE identity_commit_child(parent_id INTEGER REFERENCES identity_commit_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TEMP TRIGGER identity_profile_commit_failure AFTER UPDATE OF display_name ON local_accounts WHEN NEW.cached_verified_at>0 BEGIN INSERT INTO identity_commit_child(parent_id) VALUES(1); END;").unwrap();
    assert!(matches!(
        service.accept_cloud_login(
            "StableUser1",
            "synthetic-new-password",
            response(id, "StableUser1", Some("新资料")),
            now
        ),
        Err(AuthError::Database)
    ));
    assert_refresh_failure_closed(&service, id, other, event, now);
    assert_eq!(
        service
            .connection
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM identity_commit_child", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    service
        .connection
        .lock()
        .unwrap()
        .execute_batch("DROP TRIGGER identity_profile_commit_failure;")
        .unwrap();
    assert_refresh_recovers(&service, id, event, now);
}

#[test]
fn cache_refresh_vault_failure_after_partial_write_closes_old_window_and_recovers() {
    let (service, id, other, event, flag, now) = guarded_refresh_fixture();
    flag.store(true, Ordering::SeqCst);
    assert!(matches!(
        service.accept_cloud_login(
            "StableUser1",
            "synthetic-new-password",
            response(id, "StableUser1", Some("新资料")),
            now
        ),
        Err(AuthError::SecureStorage)
    ));
    assert_refresh_failure_closed(&service, id, other, event, now);
    flag.store(false, Ordering::SeqCst);
    assert_refresh_recovers(&service, id, event, now);
}

fn account(id: Uuid, username: &str) -> CachedAccount {
    CachedAccount {
        id,
        username: username.into(),
        roles: vec![Role::Engineer],
        enabled: true,
        requires_password_change: false,
    }
}

fn response(id: Uuid, username: &str, display_name: Option<&str>) -> CloudLoginResponse {
    let mut user = serde_json::json!({ "id": id, "username": username, "roles": ["engineer"], "requiresPasswordChange": false });
    if let Some(display_name) = display_name {
        user["displayName"] = display_name.into();
    }
    serde_json::from_value(serde_json::json!({ "accessToken": "synthetic-identity-session-token-never-real", "user": user })).unwrap()
}

fn offline(
    service: &LocalAuthService,
    username: &str,
    password: &str,
    now: SystemTime,
) -> Result<AuthenticatedSession, AuthError> {
    let captcha = service.issue_captcha(now).unwrap();
    let answer = captcha
        .question
        .split_whitespace()
        .filter_map(|word| word.parse::<u8>().ok())
        .sum();
    service.offline_login(username, password, captcha.id, answer, now)
}

#[test]
fn online_identity_case_variants_keep_one_canonical_account_and_display_name() {
    let service = LocalAuthService::open_in_memory().unwrap();
    let now = SystemTime::now();
    let id = Uuid::new_v4();
    let first = service
        .accept_cloud_login(
            "SYNTHETICUSER1",
            "synthetic-password",
            response(id, "SyntheticUser1", Some("合成姓名")),
            now,
        )
        .unwrap();
    assert_eq!(first.username, "SyntheticUser1");
    assert_eq!(first.display_name.as_deref(), Some("合成姓名"));
    service
        .accept_cloud_login(
            "syntheticuser1",
            "synthetic-password",
            response(id, "SyntheticUser1", Some("合成姓名")),
            now,
        )
        .unwrap();
    let local = offline(&service, "sYnThEtIcUsEr1", "synthetic-password", now).unwrap();
    assert_eq!(local.user_id, id);
    assert_eq!(local.username, "SyntheticUser1");
    assert_eq!(local.display_name.as_deref(), Some("合成姓名"));
    assert!(matches!(
        offline(&service, "合成姓名", "synthetic-password", now),
        Err(AuthError::InvalidCredentials)
    ));
    assert_eq!(
        service
            .connection
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM local_accounts", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert!(
        service
            .credential_vault
            .load_verifier(id)
            .unwrap()
            .is_some()
    );
}

#[test]
fn legacy_unicode_and_missing_display_name_stay_compatible_without_password_casefold() {
    let service = LocalAuthService::open_in_memory().unwrap();
    let now = SystemTime::now();
    let id = Uuid::new_v4();
    let old = service
        .accept_cloud_login(
            "测试DEV",
            "Synthetic-PassWord",
            response(id, "测试Dev", None),
            now,
        )
        .unwrap();
    assert_eq!(old.username, "测试Dev");
    assert!(old.display_name.is_none());
    assert!(matches!(
        offline(&service, "测试dev", "synthetic-password", now),
        Err(AuthError::InvalidCredentials)
    ));
    let legacy = offline(&service, "测试dEV", "Synthetic-PassWord", now).unwrap();
    assert_eq!(legacy.user_id, id);
    assert_eq!(legacy.username, "测试Dev");
    assert!(legacy.display_name.is_none());
    let serialized = serde_json::to_value(&legacy).unwrap();
    assert_eq!(serialized["username"], "测试Dev");
    assert!(serialized["display_name"].is_null());
    assert!(!"ÉDev".eq_ignore_ascii_case("édev"));
}

#[test]
fn response_for_another_login_name_never_populates_the_cache() {
    let service = LocalAuthService::open_in_memory().unwrap();
    assert!(matches!(
        service.accept_cloud_login(
            "DifferentUser",
            "synthetic-password",
            response(Uuid::new_v4(), "OtherUser", None),
            SystemTime::now()
        ),
        Err(AuthError::SyncTransport)
    ));
    assert_eq!(
        service
            .connection
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM local_accounts", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn legacy_cached_case_collision_is_not_merged_deleted_or_counted_as_wrong_password() {
    let service = LocalAuthService::open_in_memory().unwrap();
    let now = SystemTime::now();
    let id = Uuid::new_v4();
    let other = Uuid::new_v4();
    service
        .cache_verified_account(account(id, "LegacyUser"), "synthetic-password", now)
        .unwrap();
    {
        let connection = service.connection.lock().unwrap();
        connection
            .execute(
                "UPDATE local_accounts SET failed_attempts=2 WHERE id=?1",
                [id.to_string()],
            )
            .unwrap();
        connection.execute("INSERT INTO local_accounts(id,username,roles_json,enabled,requires_password_change,cached_verified_at,failed_attempts) SELECT ?1,'legacyuser',roles_json,enabled,requires_password_change,cached_verified_at,3 FROM local_accounts WHERE id=?2",params![other.to_string(),id.to_string()]).unwrap();
    }
    assert!(matches!(
        offline(&service, "LegacyUser", "synthetic-password", now),
        Err(AuthError::AccountNameCollision)
    ));
    let connection = service.connection.lock().unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*),SUM(failed_attempts) FROM local_accounts",
                [],
                |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
            )
            .unwrap(),
        (2, 5)
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT username FROM local_accounts WHERE id=?1",
                [id.to_string()],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        "LegacyUser"
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM local_session", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn new_case_alias_cannot_create_a_second_cache_or_replace_another_accounts_verifier() {
    let service = LocalAuthService::open_in_memory().unwrap();
    let now = SystemTime::now();
    let id = Uuid::new_v4();
    let other = Uuid::new_v4();
    service
        .cache_verified_account(account(id, "ExistingUser"), "synthetic-password", now)
        .unwrap();
    let before = service.credential_vault.load_verifier(id).unwrap();
    assert!(matches!(
        service.cache_verified_account(
            account(other, "existinguser"),
            "different-synthetic-password",
            now
        ),
        Err(AuthError::AccountNameCollision)
    ));
    assert!(before == service.credential_vault.load_verifier(id).unwrap());
    assert!(
        service
            .credential_vault
            .load_verifier(other)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        service
            .connection
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM local_accounts", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn migration_0063_preserves_previous_accounts_case_collisions_and_pending_history() {
    let mut connection = Connection::open_in_memory().unwrap();
    migrate(&mut connection).unwrap();
    connection.execute_batch("ALTER TABLE local_accounts DROP COLUMN display_name; DELETE FROM local_schema_migrations WHERE version='0063_account_display_name';").unwrap();
    let id = Uuid::new_v4();
    let other = Uuid::new_v4();
    let event = Uuid::new_v4();
    for (id, name) in [(id, "LegacyName"), (other, "legacyname")] {
        connection.execute("INSERT INTO local_accounts(id,username,roles_json,enabled,requires_password_change,cached_verified_at) VALUES(?1,?2,'[\"engineer\"]',1,0,1)",params![id.to_string(),name]).unwrap();
    }
    connection.execute("INSERT INTO local_sync_outbox(event_id,entity_type,entity_id,operation,base_version,payload_json,created_at,owner_account_id) VALUES(?1,'material',?2,'upsert',0,'{\"synthetic\":true}',1,?3)",params![event.to_string(),Uuid::new_v4().to_string(),id.to_string()]).unwrap();
    migrate(&mut connection).unwrap();
    migrate(&mut connection).unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT COUNT(*),COUNT(display_name) FROM local_accounts",
                [],
                |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
            )
            .unwrap(),
        (2, 0)
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT payload_json FROM local_sync_outbox WHERE event_id=?1",
                [event.to_string()],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        "{\"synthetic\":true}"
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT username FROM local_accounts WHERE id=?1",
                [id.to_string()],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        "LegacyName"
    );
    assert_eq!(connection.query_row("SELECT COUNT(*) FROM local_schema_migrations WHERE version='0063_account_display_name'",[],|r|r.get::<_,i64>(0)).unwrap(),1);
}

#[test]
fn new_account_ascii_login_and_chinese_display_name_are_separate() {
    use crate::account_management::CreateManagedAccount;
    let service = LocalAuthService::open_in_memory().unwrap();
    let input = |username: &str, display_name: &str| CreateManagedAccount {
        username: username.into(),
        display_name: display_name.into(),
        temporary_password: "synthetic-temporary".into(),
        roles: vec![Role::Engineer],
        ui_locale: "zh-CN".into(),
        employee_photo_key: "builtin:default-avatar:v1".into(),
        scope: ManagedAuthorizationBinding {
            project_id: Uuid::new_v4(),
            department_id: Uuid::new_v4(),
            team_id: Uuid::new_v4(),
        },
    };
    tauri::async_runtime::block_on(async {
        for username in ["测试1", "bad user", "bad-user", "bad_user"] {
            assert!(matches!(
                service
                    .create_managed_account(input(username, "合成姓名"), SystemTime::now())
                    .await,
                Err(AuthError::InvalidInput)
            ));
        }
        assert!(matches!(
            service
                .create_managed_account(input("ValidUser1", "合成姓名"), SystemTime::now())
                .await,
            Err(AuthError::NoActiveSession)
        ));
        assert!(matches!(
            service
                .create_managed_account(input("ValidUser1", "  "), SystemTime::now())
                .await,
            Err(AuthError::InvalidInput)
        ));
    });
}
