#[cfg(debug_assertions)]
use honsen_materials_desktop_core::test_profile_sync_credential_service;
use honsen_materials_desktop_core::{
    AdjustmentInput, AuthError, AuthenticatedSession, LocalAuthService, MaterialSnapshotInput,
    RequisitionDraftInput, RequisitionLineInput, commands,
};
#[cfg(debug_assertions)]
use keyring::Entry;
#[cfg(debug_assertions)]
use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf, time::SystemTime};
#[cfg(debug_assertions)]
use std::{thread, time::Duration};
use tauri::Manager;
use uuid::Uuid;

fn profile_path() -> Result<(PathBuf, bool), String> {
    match env::var("HONSEN_PROCURE_PROFILE").as_deref() {
        Ok("test") => {
            let path = env::var("HONSEN_PROCURE_TEST_DB_PATH")
                .map(PathBuf::from)
                .map_err(|_| "test profile requires HONSEN_PROCURE_TEST_DB_PATH".to_owned())?;
            if !path.is_absolute() || !path.to_string_lossy().ends_with(".test.sqlite") {
                return Err(
                    "test database must be an absolute path ending in .test.sqlite".to_owned(),
                );
            }
            Ok((path, true))
        }
        Ok("") | Err(_) => {
            let root = env::var_os("LOCALAPPDATA")
                .map(PathBuf::from)
                .ok_or_else(|| "LOCALAPPDATA is unavailable".to_owned())?;
            Ok((
                root.join("Honsen Program")
                    .join("honsen.procure")
                    .join("honsen.procure.sqlite"),
                false,
            ))
        }
        Ok(_) => Err("HONSEN_PROCURE_PROFILE must be omitted or set to test".to_owned()),
    }
}

fn main() {
    let (database_path, is_test_profile) =
        profile_path().unwrap_or_else(|message| panic!("{message}"));
    let native_smoke = env::var("HONSEN_PROCURE_NATIVE_SMOKE").ok();
    if native_smoke.is_some() && !is_test_profile {
        panic!("native smoke requires HONSEN_PROCURE_PROFILE=test");
    }
    if !matches!(
        native_smoke.as_deref(),
        None | Some("online-login")
            | Some("ab-login-switch")
            | Some("ab-sync-security")
            | Some("push-partial-batch")
            | Some("cursor-write-recovery")
            | Some("push-termination-recovery")
            | Some("pull-page-recovery")
            | Some("offline-push-recovery")
            | Some("pull-recovery")
            | Some("vault-readback")
    ) {
        panic!("unknown native smoke mode");
    }
    fs::create_dir_all(database_path.parent().expect("database path has a parent"))
        .expect("create local SQLite directory");
    let auth = if is_test_profile {
        LocalAuthService::open_test_path(database_path.to_str().expect("UTF-8 database path"))
    } else {
        LocalAuthService::open_path(database_path.to_str().expect("UTF-8 database path"))
    }
    .expect("open local SQLite database");

    if let Some(mode) = native_smoke.as_deref() {
        match mode {
            "online-login" => {
                run_native_online_login_smoke(&auth).expect("run native online login smoke")
            }
            "ab-login-switch" => run_native_ab_login_switch_smoke(&auth, &database_path)
                .expect("run native A/B login switch smoke"),
            "ab-sync-security" => {
                if let Err(error) = run_native_ab_sync_security_smoke(&auth, &database_path) {
                    write_native_smoke_failure("ab-sync-security", &error);
                    panic!("run native A/B sync security smoke: {error}");
                }
            }
            "push-partial-batch" => {
                if let Err(error) = run_native_push_partial_batch_smoke(&auth, &database_path) {
                    write_native_smoke_failure("push-partial-batch", &error);
                    panic!("run native partial Push batch smoke: {error}");
                }
            }
            "pull-recovery" => {
                if let Err(error) = run_native_pull_recovery_smoke(&auth, &database_path) {
                    write_native_smoke_failure("pull-recovery", &error);
                    panic!("run native Pull recovery smoke: {error}");
                }
            }
            "pull-page-recovery" => {
                if let Err(error) = run_native_pull_page_recovery_smoke(&auth, &database_path) {
                    write_native_smoke_failure("pull-page-recovery", &error);
                    panic!("run native paged Pull recovery smoke: {error}");
                }
            }
            "cursor-write-recovery" => {
                if let Err(error) = run_native_cursor_write_recovery_smoke(&auth, &database_path) {
                    write_native_smoke_failure("cursor-write-recovery", &error);
                    panic!("run native Cursor write recovery smoke: {error}");
                }
            }
            "push-termination-recovery" => {
                if let Err(error) = run_native_push_termination_smoke(&auth, &database_path) {
                    write_native_smoke_failure("push-termination-recovery", &error);
                    panic!("run native Push termination smoke: {error}");
                }
            }
            "offline-push-recovery" => {
                if let Err(error) = run_native_offline_push_recovery_smoke(&auth, &database_path) {
                    write_native_smoke_failure("offline-push-recovery", &error);
                    panic!("run native offline Push recovery smoke: {error}");
                }
            }
            "vault-readback" => {
                if let Err(error) = run_native_vault_readback_smoke(&auth, &database_path) {
                    write_native_smoke_failure("vault-readback", &error);
                    panic!("run native vault readback smoke: {error}");
                }
            }
            _ => unreachable!("validated native smoke mode"),
        }
        return;
    }

    tauri::Builder::default()
        .manage(auth)
        .setup(move |app| {
            if is_test_profile {
                app.get_webview_window("main")
                    .expect("main window")
                    .set_title("Honsen Procure — TEST PROFILE")
                    .expect("set test profile title");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_requisition_detail,
            commands::withdraw_requisition,
            commands::list_requisition_history,
            commands::list_confirmed_procurement_orders,
            commands::start_honsen_market_execution,
            commands::allocate_supplier_child_orders,
            commands::close_supplier_order_with_conditions,
            commands::push_pending_sync,
            commands::pull_sync,
            commands::sync_status,
            commands::list_sync_conflicts,
            commands::list_local_category_conflicts,
            commands::list_pending_remote_category_repairs,
            commands::repair_local_category_conflict,
            commands::list_remote_category_quarantine,
            commands::repair_remote_category,
            commands::resolve_sync_conflict,
            commands::resolve_purchase_order_conflict,
            commands::create_rfq,
            commands::list_rfqs,
            commands::send_rfq,
            commands::close_rfq,
            commands::save_owner_purchase_pricing,
            commands::set_procurement_mode,
            commands::issue_owner_formal_order,
            commands::record_receipt,
            commands::record_procurement_expenditure,
            commands::save_supplier_child_terms,
            commands::send_supplier_order,
            commands::issue_local_captcha,
            commands::issue_cloud_captcha,
            commands::online_login,
            commands::offline_login,
            commands::lock_session,
            commands::get_authorization_context,
            commands::refresh_authorization,
            commands::list_managed_authorizations,
            commands::change_managed_authorization,
            commands::replace_managed_authorization,
            commands::list_authorization_contexts,
            commands::select_authorization_context,
            commands::authorize_material_mutation,
            commands::confirm_requisition,
            commands::get_approval_policy,
            commands::set_approval_policy,
            commands::reject_requisition,
            commands::add_order_comment,
            commands::list_order_comments,
            commands::list_order_audits,
            commands::save_requisition_draft,
            commands::revise_confirmed_requisition,
            commands::submit_requisition_draft,
            commands::save_material,
            commands::save_supplier,
            commands::add_material_price,
            commands::save_material_image,
            commands::get_material_square_image,
            commands::search_catalog,
            commands::list_catalog_prices,
            commands::list_suppliers,
            commands::save_project_defaults,
            commands::list_project_defaults,
            commands::save_reference_master_data,
            commands::list_reference_master_data,
            commands::save_tax_template,
            commands::list_tax_templates,
            commands::save_exchange_rate,
            commands::list_exchange_rates
        ])
        .run(tauri::generate_context!())
        .expect("run Honsen Procure desktop");
}

fn run_native_online_login_smoke(auth: &LocalAuthService) -> Result<(), String> {
    let username = required_test_value("HONSEN_PROCURE_NATIVE_SMOKE_USERNAME")?;
    let password = required_test_value("HONSEN_PROCURE_NATIVE_SMOKE_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();
    let session = native_online_login(auth, &username, &password, now)?;
    fs::write(
        result_path,
        serde_json::json!({
            "mode": "online-login",
            "username": session.username,
            "userId": session.user_id,
        })
        .to_string(),
    )
    .map_err(|_| "cannot write native smoke result".to_owned())
}

#[cfg(debug_assertions)]
fn run_native_vault_readback_smoke(
    auth: &LocalAuthService,
    database_path: &PathBuf,
) -> Result<(), String> {
    const ACCOUNT_ID: &str = "10000000-0000-4000-8000-000000000011";
    const CONTROLLED_TOKEN: &str = "native-vault-readback-control-token-0123456789";

    let account_id = Uuid::parse_str(ACCOUNT_ID).expect("fixed test account UUID");
    let service = test_profile_sync_credential_service(database_path);
    let target = format!("{ACCOUNT_ID}.{service}");
    let token_digest = format!("{:x}", Sha256::digest(CONTROLLED_TOKEN.as_bytes()));
    let context = format!(
        "{:x}",
        Sha256::digest(
            [
                env::var("USERDOMAIN").unwrap_or_default(),
                env::var("USERNAME").unwrap_or_default(),
                env::var("SESSIONNAME").unwrap_or_default(),
            ]
            .join("\u{0}")
            .as_bytes(),
        )
    );
    let context = &context[..12];
    let result_path = test_result_path()?;
    let action =
        env::var("HONSEN_PROCURE_NATIVE_VAULT_ACTION").unwrap_or_else(|_| "roundtrip".to_owned());
    if action == "write" {
        let token = format!("native-vault-restart-{}{}", Uuid::new_v4(), Uuid::new_v4());
        auth.cache_sync_access_token(account_id, &token)
            .map_err(|error| format!("target={target}; wrapped-write={error:?}"))?;
        fs::write(
            result_path,
            serde_json::json!({
                "mode": "vault-readback", "action": "write", "result": "PASS",
                "target": target, "service": service, "account": ACCOUNT_ID,
                "tokenSha256Prefix": &format!("{:x}", Sha256::digest(token.as_bytes()))[..12],
                "processId": std::process::id(), "processContextSha256Prefix": context,
            })
            .to_string(),
        )
        .map_err(|_| "cannot write native vault readback result".to_owned())?;
        return Ok(());
    }
    if action == "read" {
        let present = auth
            .test_sync_token_is_present(account_id)
            .map_err(|error| format!("target={target}; wrapped-read={error:?}"))?;
        fs::write(
            result_path,
            serde_json::json!({
                "mode": "vault-readback", "action": "read",
                "result": if present { "PASS" } else { "FAIL" },
                "target": target, "service": service, "account": ACCOUNT_ID,
                "processId": std::process::id(), "processContextSha256Prefix": context,
            })
            .to_string(),
        )
        .map_err(|_| "cannot write native vault readback result".to_owned())?;
        return if present {
            Ok(())
        } else {
            Err(format!("target={target}; restarted-read=absent"))
        };
    }
    if action == "clear" {
        match Entry::new(&service, ACCOUNT_ID)
            .map_err(|error| format!("target={target}; clear-create={error:?}"))?
            .delete_credential()
        {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(format!("target={target}; clear={error:?}")),
        }
        fs::write(
            result_path,
            serde_json::json!({ "mode": "vault-readback", "action": "clear", "result": "PASS", "target": target })
                .to_string(),
        )
        .map_err(|_| "cannot write native vault readback result".to_owned())?;
        return Ok(());
    }
    if action != "roundtrip" {
        return Err(
            "HONSEN_PROCURE_NATIVE_VAULT_ACTION must be write, read, clear or omitted".into(),
        );
    }
    let entry = Entry::new(&service, ACCOUNT_ID)
        .map_err(|error| format!("target={target}; create={error:?}"))?;
    let readback = (|| -> Result<(bool, bool, bool), String> {
        entry
            .set_password(CONTROLLED_TOKEN)
            .map_err(|error| format!("target={target}; direct-write={error:?}"))?;
        let direct_matches = entry
            .get_password()
            .map_err(|error| format!("target={target}; direct-read={error:?}"))?
            == CONTROLLED_TOKEN;
        let reopened_matches = Entry::new(&service, ACCOUNT_ID)
            .map_err(|error| format!("target={target}; direct-reopen={error:?}"))?
            .get_password()
            .map_err(|error| format!("target={target}; direct-reopen-read={error:?}"))?
            == CONTROLLED_TOKEN;
        auth.cache_sync_access_token(account_id, CONTROLLED_TOKEN)
            .map_err(|error| format!("target={target}; wrapped-write={error:?}"))?;
        let wrapped_matches = auth
            .test_sync_token_matches(account_id, CONTROLLED_TOKEN)
            .map_err(|error| format!("target={target}; wrapped-read={error:?}"))?;
        Ok((direct_matches, reopened_matches, wrapped_matches))
    })();
    let _ = entry.delete_credential();
    let (direct_matches, reopened_matches, wrapped_matches) = readback?;
    fs::write(
        result_path,
        serde_json::json!({
            "mode": "vault-readback",
            "result": if direct_matches && reopened_matches && wrapped_matches { "PASS" } else { "FAIL" },
            "target": target,
            "service": service,
            "account": ACCOUNT_ID,
            "directWrite": "PASS",
            "directRead": if direct_matches { "PASS" } else { "FAIL" },
            "directReopenRead": if reopened_matches { "PASS" } else { "FAIL" },
            "wrappedWrite": "PASS",
            "wrappedRead": if wrapped_matches { "PASS" } else { "FAIL" },
            "tokenSha256Prefix": &token_digest[..12],
            "processId": std::process::id(),
            "processContextSha256Prefix": context,
            "thread": format!("{:?}", std::thread::current().id()),
        })
        .to_string(),
    )
    .map_err(|_| "cannot write native vault readback result".to_owned())?;
    if direct_matches && reopened_matches && wrapped_matches {
        Ok(())
    } else {
        Err(format!(
            "target={target}; directMatches={direct_matches}; reopenedMatches={reopened_matches}; wrappedMatches={wrapped_matches}"
        ))
    }
}

#[cfg(not(debug_assertions))]
fn run_native_vault_readback_smoke(
    _auth: &LocalAuthService,
    _database_path: &PathBuf,
) -> Result<(), String> {
    Err("native vault readback smoke is unavailable outside a debug test build".into())
}

#[cfg(debug_assertions)]
fn run_native_ab_login_switch_smoke(
    account_a: &LocalAuthService,
    account_a_path: &PathBuf,
) -> Result<(), String> {
    let account_b_path = PathBuf::from(required_test_value(
        "HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH",
    )?);
    if !account_b_path.is_absolute()
        || !account_b_path.to_string_lossy().ends_with(".test.sqlite")
        || account_b_path == *account_a_path
    {
        return Err(
            "native A/B second database must be a distinct absolute .test.sqlite path".into(),
        );
    }
    let account_b = LocalAuthService::open_test_path(
        account_b_path
            .to_str()
            .ok_or_else(|| "native A/B second database path must be UTF-8".to_owned())?,
    )
    .map_err(|error| error.to_string())?;
    let engineer_a_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD")?;
    let engineer_b_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_B_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();

    let account_a_session =
        native_online_login(account_a, "engineer-a", &engineer_a_password, now)?;
    if !account_a
        .test_sync_session_state()
        .map_err(|error| error.to_string())?
        .3
    {
        return Err("account A login did not persist its test-profile sync token".into());
    }
    let account_b_session =
        native_online_login(&account_b, "engineer-b", &engineer_b_password, now)?;
    let switched_session =
        native_online_login(&account_b, "engineer-a", &engineer_a_password, now)?;
    if account_a_session.username != "engineer-a"
        || account_b_session.username != "engineer-b"
        || switched_session.username != "engineer-a"
    {
        return Err("native A/B login returned an unexpected account".into());
    }
    if !matches!(
        tauri::async_runtime::block_on(account_a.refresh_authorization_https(now)),
        Err(AuthError::NoActiveSession)
    ) {
        return Err(
            "previous account A token was not rejected after account B switched to A".into(),
        );
    }
    account_b.lock().map_err(|error| error.to_string())?;
    if !matches!(
        tauri::async_runtime::block_on(account_b.refresh_authorization_https(now)),
        Err(AuthError::NoActiveSession)
    ) {
        return Err("logged-out account B retained an online session".into());
    }
    fs::write(
        result_path,
        serde_json::json!({
            "mode": "ab-login-switch",
            "accountALogin": "PASS",
            "accountBLogin": "PASS",
            "accountSwitch": "PASS",
            "oldTokenRejected": "PASS",
            "logoutBlocksClient": "PASS",
        })
        .to_string(),
    )
    .map_err(|_| "cannot write native A/B smoke result".to_owned())
}

fn native_online_login(
    auth: &LocalAuthService,
    username: &str,
    password: &str,
    now: SystemTime,
) -> Result<AuthenticatedSession, String> {
    let local_captcha = auth.issue_captcha(now).map_err(|error| error.to_string())?;
    let cloud_captcha = tauri::async_runtime::block_on(auth.issue_cloud_captcha())
        .map_err(|error| error.to_string())?;
    let cloud_answer = arithmetic_answer(&cloud_captcha.question)?.to_string();
    tauri::async_runtime::block_on(auth.online_login(
        username,
        password,
        local_captcha.id,
        arithmetic_answer(&local_captcha.question)?,
        cloud_captcha.id,
        &cloud_answer,
        now,
    ))
    .map_err(|error| error.to_string())
}

#[cfg(not(debug_assertions))]
fn run_native_ab_login_switch_smoke(
    _account_a: &LocalAuthService,
    _account_a_path: &PathBuf,
) -> Result<(), String> {
    Err("native A/B login smoke is unavailable outside a debug test build".into())
}

#[cfg(debug_assertions)]
fn run_native_ab_sync_security_smoke(
    account_a: &LocalAuthService,
    account_a_path: &PathBuf,
) -> Result<(), String> {
    let account_b_path = PathBuf::from(required_test_value(
        "HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH",
    )?);
    if !account_b_path.is_absolute()
        || !account_b_path.to_string_lossy().ends_with(".test.sqlite")
        || account_b_path == *account_a_path
    {
        return Err(
            "native A/B second database must be a distinct absolute .test.sqlite path".into(),
        );
    }
    let account_b = LocalAuthService::open_test_path(
        account_b_path
            .to_str()
            .ok_or_else(|| "native A/B second database path must be UTF-8".to_owned())?,
    )
    .map_err(|error| error.to_string())?;
    let engineer_a_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD")?;
    let engineer_b_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_B_PASSWORD")?;
    let purchaser_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_PURCHASER_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();

    let account_a_session =
        native_online_login(account_a, "engineer-a", &engineer_a_password, now)?;
    let account_a_state = account_a
        .test_sync_session_state()
        .map_err(|error| error.to_string())?;
    if !account_a_state.3 {
        return Err(format!(
            "account A token was absent immediately after its own native login; loginUser={}; state={account_a_state:?}",
            account_a_session.user_id
        ));
    }
    let account_b_session =
        native_online_login(&account_b, "engineer-b", &engineer_b_password, now)?;
    if !account_b
        .test_sync_session_state()
        .map_err(|error| error.to_string())?
        .3
    {
        return Err("account B token was absent immediately after its own native login".into());
    }
    if account_a_session.username != "engineer-a" || account_b_session.username != "engineer-b" {
        return Err("native A/B sync login returned an unexpected account".into());
    }
    if account_a
        .test_installation_id()
        .map_err(|error| error.to_string())?
        == account_b
            .test_installation_id()
            .map_err(|error| error.to_string())?
    {
        return Err("native A/B profiles unexpectedly share an installation identity".into());
    }
    tauri::async_runtime::block_on(account_a.refresh_authorization_https(now)).map_err(
        |error| {
            let state = account_a.test_sync_session_state();
            format!("account A lost its protected session after login: {error:?}; state={state:?}")
        },
    )?;
    let order_id = Uuid::new_v4();
    account_a
        .save_requisition_draft(native_sync_draft(order_id, account_a_session.user_id), now)
        .map_err(|error| error.to_string())?;
    let forged_installation_id = Uuid::new_v4();
    let trusted_installation_id = account_a
        .replace_test_installation_id(forged_installation_id)
        .map_err(|error| error.to_string())?;
    if trusted_installation_id == forged_installation_id {
        return Err("native test generated an ineffective forged installation ID".into());
    }
    let first_push = tauri::async_runtime::block_on(account_a.push_pending_https(now));
    if !matches!(first_push, Err(AuthError::SyncTransport)) {
        return Err(format!(
            "first native Push did not observe the configured post-commit transport fault: {first_push:?}"
        ));
    }
    let replay = tauri::async_runtime::block_on(account_a.push_pending_https(now))
        .map_err(|error| error.to_string())?;
    if replay.accepted_count != 1 || replay.pending_count != 0 {
        return Err("native Push replay was not idempotently acknowledged".into());
    }
    let isolated_pull = tauri::async_runtime::block_on(account_b.pull_sync_https(now))
        .map_err(|error| error.to_string())?;
    if isolated_pull.applied_count != 0 || isolated_pull.next_cursor != "0" {
        return Err(
            "account B received account A project data without a server authorization binding"
                .into(),
        );
    }
    let empty_b_push = tauri::async_runtime::block_on(account_b.push_pending_https(now))
        .map_err(|error| error.to_string())?;
    if empty_b_push.accepted_count != 0 || empty_b_push.pending_count != 0 {
        return Err("account B Push included an event not owned by account B".into());
    }
    let purchaser_session = native_online_login(&account_b, "purchaser", &purchaser_password, now)?;
    account_b
        .save_requisition_draft(native_sync_draft(order_id, account_a_session.user_id), now)
        .map_err(|error| error.to_string())?;
    let conflict_push = tauri::async_runtime::block_on(account_b.push_pending_https(now))
        .map_err(|error| error.to_string())?;
    if conflict_push.accepted_count != 0 || conflict_push.pending_count != 1 {
        return Err(format!(
            "stale account B Push was not retained for conflict projection: {conflict_push:?}"
        ));
    }
    let conflict_pull = tauri::async_runtime::block_on(account_b.pull_sync_https(now))
        .map_err(|error| error.to_string())?;
    let conflicts = account_b
        .list_sync_conflicts(now)
        .map_err(|error| error.to_string())?;
    let account_b_status = account_b
        .sync_status(now)
        .map_err(|error| error.to_string())?;
    if purchaser_session.username != "purchaser"
        || conflicts.len() != 1
        || conflicts[0].entity_id != order_id
        || account_b_status.conflict_count != 1
        || conflict_pull.applied_count != 1
        || conflict_pull.next_cursor == "0"
    {
        return Err(format!(
            "account B conflict projection was not isolated: pull={conflict_pull:?}; localConflictCount={}; localEntityIds={:?}",
            account_b_status.conflict_count,
            conflicts
                .iter()
                .map(|conflict| conflict.entity_id)
                .collect::<Vec<_>>(),
        ));
    }
    let account_a_status = account_a
        .sync_status(now)
        .map_err(|error| error.to_string())?;
    if account_a_status.conflict_count != 0 {
        return Err("account A observed account B's local synchronization conflict".into());
    }
    fs::write(
        result_path,
        serde_json::json!({
            "mode": "ab-sync-security",
            "independentInstallations": "PASS",
            "forgedDeviceIdTrustedOrigin": "PASS",
            "accountIsolation": "PASS",
            "conflictIsolation": "PASS",
            "pushReplayIdempotency": "PASS",
            "evidence": {
                "accountA": account_a_session.user_id,
                "accountBInitial": account_b_session.user_id,
                "accountBConflictActor": purchaser_session.user_id,
                "accountAInstallation": trusted_installation_id,
                "accountBInstallation": account_b.test_installation_id().map_err(|error| error.to_string())?,
                "forgedClientDeviceId": forged_installation_id,
                "conflictPullAppliedCount": conflict_pull.applied_count,
                "conflictPullNextCursor": conflict_pull.next_cursor,
                "localConflictCount": account_b_status.conflict_count,
                "localConflictEntityIds": conflicts.iter().map(|conflict| conflict.entity_id).collect::<Vec<_>>(),
                "localConflictServerVersions": conflicts.iter().map(|conflict| conflict.server_version).collect::<Vec<_>>(),
            },
        })
        .to_string(),
    )
    .map_err(|_| "cannot write native A/B sync result".to_owned())
}

#[cfg(debug_assertions)]
fn run_native_pull_recovery_smoke(
    auth: &LocalAuthService,
    database_path: &PathBuf,
) -> Result<(), String> {
    let phase = required_test_value("HONSEN_PROCURE_NATIVE_PULL_RECOVERY_PHASE")?;
    let engineer_a_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();

    match phase.as_str() {
        "interrupted" => {
            let session = native_online_login(auth, "engineer-a", &engineer_a_password, now)?;
            let cursor_before = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let entity_id = Uuid::new_v4();
            auth.save_requisition_draft(native_sync_draft(entity_id, session.user_id), now)
                .map_err(|error| error.to_string())?;
            let push = tauri::async_runtime::block_on(auth.push_pending_https(now))
                .map_err(|error| error.to_string())?;
            if push.accepted_count != 1 || push.pending_count != 0 {
                return Err(format!(
                    "recovery fixture Push was not acknowledged: {push:?}"
                ));
            }
            let failed_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now));
            if !matches!(failed_pull, Err(AuthError::SyncTransport)) {
                return Err(format!(
                    "first native Pull did not observe the configured transport fault: {failed_pull:?}"
                ));
            }
            let cursor_after = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            if cursor_after != cursor_before {
                return Err(format!(
                    "failed native Pull advanced the durable cursor: before={cursor_before}; after={cursor_after}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "pull-recovery",
                    "phase": "interrupted",
                    "pullFailure": "PASS",
                    "cursorUnchanged": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "entityId": entity_id,
                    "cursorBefore": cursor_before,
                    "cursorAfterFailure": cursor_after,
                    "projectedCount": 0,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write interrupted Pull recovery result".to_owned())
        }
        "recovered" => {
            let entity_id = Uuid::parse_str(&required_test_value(
                "HONSEN_PROCURE_NATIVE_PULL_RECOVERY_ENTITY_ID",
            )?)
            .map_err(|_| "native Pull recovery entity ID must be a UUID".to_owned())?;
            let session = native_online_login(auth, "engineer-a", &engineer_a_password, now)?;
            let cursor_before = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let recovered_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            let cursor_after_recovery = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            if recovered_pull.applied_count != 1
                || recovered_pull.next_cursor == cursor_before
                || cursor_after_recovery != recovered_pull.next_cursor
                || auth
                    .test_remote_entity_version("purchase_order", entity_id)
                    .map_err(|error| error.to_string())?
                    != Some(1)
            {
                return Err(format!(
                    "native Pull recovery did not durably project the pending entity: pull={recovered_pull:?}; before={cursor_before}; after={cursor_after_recovery}"
                ));
            }
            let replay_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            let cursor_after_replay = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            if replay_pull.applied_count != 0
                || replay_pull.next_cursor != cursor_after_recovery
                || cursor_after_replay != cursor_after_recovery
                || auth
                    .test_remote_entity_version("purchase_order", entity_id)
                    .map_err(|error| error.to_string())?
                    != Some(1)
            {
                return Err(format!(
                    "native Pull replay duplicated projection or cursor movement: pull={replay_pull:?}; before={cursor_after_recovery}; after={cursor_after_replay}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "pull-recovery",
                    "phase": "recovered",
                    "recovery": "PASS",
                    "replay": "PASS",
                    "cursorPersisted": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "entityId": entity_id,
                    "cursorBeforeRecovery": cursor_before,
                    "cursorAfterRecovery": cursor_after_recovery,
                    "cursorAfterReplay": cursor_after_replay,
                    "recoveryProjectedCount": recovered_pull.applied_count,
                    "replayProjectedCount": replay_pull.applied_count,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write recovered Pull recovery result".to_owned())
        }
        _ => Err("native Pull recovery phase must be interrupted or recovered".into()),
    }
}

#[cfg(debug_assertions)]
fn run_native_pull_page_recovery_smoke(
    auth: &LocalAuthService,
    database_path: &PathBuf,
) -> Result<(), String> {
    const PAGE_SIZE: usize = 500;
    const EVENT_COUNT: usize = PAGE_SIZE + 1;
    let phase = required_test_value("HONSEN_PROCURE_NATIVE_PULL_PAGE_RECOVERY_PHASE")?;
    let engineer_a_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD")?;
    let purchaser_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_PURCHASER_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();

    match phase.as_str() {
        "producer" => {
            let session = native_online_login(auth, "purchaser", &purchaser_password, now)?;
            let mut entity_ids = Vec::with_capacity(EVENT_COUNT);
            for _ in 0..EVENT_COUNT {
                let entity_id = Uuid::new_v4();
                auth.save_requisition_draft(native_sync_draft(entity_id, session.user_id), now)
                    .map_err(|error| error.to_string())?;
                entity_ids.push(entity_id);
            }
            let queued = auth
                .test_pending_outbox_count(session.user_id)
                .map_err(|error| error.to_string())?;
            if queued != EVENT_COUNT as i64 {
                return Err(format!(
                    "paged Pull producer queued {queued}, expected {EVENT_COUNT}"
                ));
            }
            let mut accepted_count = 0;
            for _ in 0..=((EVENT_COUNT - 1) / 100) {
                let push = tauri::async_runtime::block_on(auth.push_pending_https(now))
                    .map_err(|error| error.to_string())?;
                accepted_count += push.accepted_count;
                if auth
                    .test_pending_outbox_count(session.user_id)
                    .map_err(|error| error.to_string())?
                    == 0
                {
                    break;
                }
                if push.accepted_count == 0 {
                    return Err("paged Pull producer Push made no progress".into());
                }
            }
            let pending_after_push = auth
                .test_pending_outbox_count(session.user_id)
                .map_err(|error| error.to_string())?;
            if accepted_count != EVENT_COUNT || pending_after_push != 0 {
                return Err(format!(
                    "paged Pull producer did not persist exactly {EVENT_COUNT} remote events: accepted={accepted_count}; pending={pending_after_push}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "pull-page-recovery",
                    "phase": "producer",
                    "producerPush": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "eventCount": EVENT_COUNT,
                    "acceptedCount": accepted_count,
                    "outboxPendingAfterPush": pending_after_push,
                    "firstEntityId": entity_ids.first(),
                    "lastEntityId": entity_ids.last(),
                })
                .to_string(),
            )
            .map_err(|_| "cannot write paged Pull producer result".to_owned())
        }
        "interrupted" => {
            let session = native_online_login(auth, "engineer-a", &engineer_a_password, now)?;
            let cursor_before = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let failed_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now));
            if !matches!(failed_pull, Err(AuthError::SyncTransport)) {
                return Err(format!(
                    "second native Pull page did not observe the configured transport fault: {failed_pull:?}"
                ));
            }
            let cursor_after_failure = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let projected_after_failure = auth
                .test_remote_entity_count("purchase_order")
                .map_err(|error| error.to_string())?;
            let outbox_pending = auth
                .test_pending_outbox_count(session.user_id)
                .map_err(|error| error.to_string())?;
            if cursor_before != "0"
                || cursor_after_failure != PAGE_SIZE.to_string()
                || projected_after_failure != PAGE_SIZE as i64
                || outbox_pending != 0
            {
                return Err(format!(
                    "paged Pull interruption did not preserve the committed first page boundary: before={cursor_before}; after={cursor_after_failure}; projected={projected_after_failure}; outbox={outbox_pending}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "pull-page-recovery",
                    "phase": "interrupted",
                    "firstPageCommitted": "PASS",
                    "secondPageTransportFailure": "PASS",
                    "cursorAtCommittedBoundary": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "cursorBefore": cursor_before,
                    "cursorAfterFailure": cursor_after_failure,
                    "projectedAfterFailure": projected_after_failure,
                    "outboxPending": outbox_pending,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write interrupted paged Pull result".to_owned())
        }
        "recovered" => {
            let session = native_online_login(auth, "engineer-a", &engineer_a_password, now)?;
            let cursor_before_recovery = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let recovered_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            let cursor_after_recovery = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let projected_after_recovery = auth
                .test_remote_entity_count("purchase_order")
                .map_err(|error| error.to_string())?;
            let replay_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            let cursor_after_replay = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let projected_after_replay = auth
                .test_remote_entity_count("purchase_order")
                .map_err(|error| error.to_string())?;
            let outbox_pending = auth
                .test_pending_outbox_count(session.user_id)
                .map_err(|error| error.to_string())?;
            if cursor_before_recovery != PAGE_SIZE.to_string()
                || recovered_pull.applied_count != 1
                || cursor_after_recovery != EVENT_COUNT.to_string()
                || projected_after_recovery != EVENT_COUNT as i64
                || replay_pull.applied_count != 0
                || cursor_after_replay != cursor_after_recovery
                || projected_after_replay != projected_after_recovery
                || outbox_pending != 0
            {
                return Err(format!(
                    "paged Pull recovery did not finish exactly once: recovered={recovered_pull:?}; replay={replay_pull:?}; before={cursor_before_recovery}; after={cursor_after_recovery}; final={cursor_after_replay}; projected={projected_after_replay}; outbox={outbox_pending}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "pull-page-recovery",
                    "phase": "recovered",
                    "restartRecovery": "PASS",
                    "allEventsProjectedOnce": "PASS",
                    "cursorMonotonic": "PASS",
                    "replayEmpty": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "cursorBeforeRecovery": cursor_before_recovery,
                    "cursorAfterRecovery": cursor_after_recovery,
                    "cursorAfterReplay": cursor_after_replay,
                    "recoveryProjectedCount": recovered_pull.applied_count,
                    "replayProjectedCount": replay_pull.applied_count,
                    "projectedAfterRecovery": projected_after_recovery,
                    "projectedAfterReplay": projected_after_replay,
                    "outboxPending": outbox_pending,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write recovered paged Pull result".to_owned())
        }
        _ => Err(
            "native paged Pull recovery phase must be producer, interrupted or recovered".into(),
        ),
    }
}

#[cfg(debug_assertions)]
fn run_native_cursor_write_recovery_smoke(
    auth: &LocalAuthService,
    database_path: &PathBuf,
) -> Result<(), String> {
    let phase = required_test_value("HONSEN_PROCURE_NATIVE_CURSOR_WRITE_RECOVERY_PHASE")?;
    let engineer_a_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD")?;
    let purchaser_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_PURCHASER_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();

    match phase.as_str() {
        "producer" => {
            let session = native_online_login(auth, "purchaser", &purchaser_password, now)?;
            let entity_id = Uuid::new_v4();
            auth.save_requisition_draft(native_sync_draft(entity_id, session.user_id), now)
                .map_err(|error| error.to_string())?;
            let push = tauri::async_runtime::block_on(auth.push_pending_https(now))
                .map_err(|error| error.to_string())?;
            let pending = auth
                .test_pending_outbox_count(session.user_id)
                .map_err(|error| error.to_string())?;
            if push.accepted_count != 1 || pending != 0 {
                return Err(format!(
                    "Cursor write producer did not accept one event: {push:?}; pending={pending}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "cursor-write-recovery",
                    "phase": "producer",
                    "producerPush": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "entityId": entity_id,
                    "acceptedCount": push.accepted_count,
                    "outboxPending": pending,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write Cursor write producer result".to_owned())
        }
        "fault" => {
            let session = native_online_login(auth, "engineer-a", &engineer_a_password, now)?;
            let cursor_before = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let projected_before = auth
                .test_remote_entity_count("purchase_order")
                .map_err(|error| error.to_string())?;
            auth.inject_test_pull_cursor_write_failure_once()
                .map_err(|error| error.to_string())?;
            let failed_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now));
            let fault_triggered = auth
                .test_pull_cursor_write_failure_triggered()
                .map_err(|error| error.to_string())?;
            let cursor_after = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let projected_after = auth
                .test_remote_entity_count("purchase_order")
                .map_err(|error| error.to_string())?;
            let outbox_pending = auth
                .test_pending_outbox_count(session.user_id)
                .map_err(|error| error.to_string())?;
            if !matches!(failed_pull, Err(AuthError::Database))
                || !fault_triggered
                || cursor_before != "0"
                || cursor_after != cursor_before
                || projected_before != 0
                || projected_after != projected_before
                || outbox_pending != 0
            {
                return Err(format!(
                    "Cursor write failure did not roll back the Pull page: fault={fault_triggered}; pull={failed_pull:?}; cursor={cursor_before}->{cursor_after}; projected={projected_before}->{projected_after}; outbox={outbox_pending}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "cursor-write-recovery",
                    "phase": "fault",
                    "cursorWriteFailure": "PASS",
                    "transactionRollback": "PASS",
                    "cursorNotAhead": "PASS",
                    "faultTriggered": fault_triggered,
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "cursorBefore": cursor_before,
                    "cursorAfter": cursor_after,
                    "projectedBefore": projected_before,
                    "projectedAfter": projected_after,
                    "outboxPending": outbox_pending,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write Cursor write fault result".to_owned())
        }
        "recovered" => {
            let session = native_online_login(auth, "engineer-a", &engineer_a_password, now)?;
            let cursor_before = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let recovered_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            let cursor_after_recovery = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let projected_after_recovery = auth
                .test_remote_entity_count("purchase_order")
                .map_err(|error| error.to_string())?;
            let replay_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            let cursor_after_replay = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let projected_after_replay = auth
                .test_remote_entity_count("purchase_order")
                .map_err(|error| error.to_string())?;
            let outbox_pending = auth
                .test_pending_outbox_count(session.user_id)
                .map_err(|error| error.to_string())?;
            if cursor_before != "0"
                || recovered_pull.applied_count != 1
                || cursor_after_recovery != "1"
                || projected_after_recovery != 1
                || replay_pull.applied_count != 0
                || cursor_after_replay != cursor_after_recovery
                || projected_after_replay != projected_after_recovery
                || outbox_pending != 0
            {
                return Err(format!(
                    "Cursor write recovery did not project exactly once: recovery={recovered_pull:?}; replay={replay_pull:?}; cursor={cursor_before}->{cursor_after_recovery}->{cursor_after_replay}; projected={projected_after_recovery}->{projected_after_replay}; outbox={outbox_pending}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "cursor-write-recovery",
                    "phase": "recovered",
                    "restartRecovery": "PASS",
                    "allEventsProjectedOnce": "PASS",
                    "cursorMonotonic": "PASS",
                    "replayEmpty": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "cursorBefore": cursor_before,
                    "cursorAfterRecovery": cursor_after_recovery,
                    "cursorAfterReplay": cursor_after_replay,
                    "recoveryProjectedCount": recovered_pull.applied_count,
                    "replayProjectedCount": replay_pull.applied_count,
                    "projectedAfterRecovery": projected_after_recovery,
                    "projectedAfterReplay": projected_after_replay,
                    "outboxPending": outbox_pending,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write Cursor write recovered result".to_owned())
        }
        _ => Err("native Cursor write recovery phase must be producer, fault or recovered".into()),
    }
}

#[cfg(debug_assertions)]
fn run_native_push_termination_smoke(
    auth: &LocalAuthService,
    database_path: &PathBuf,
) -> Result<(), String> {
    let phase = required_test_value("HONSEN_PROCURE_NATIVE_PUSH_TERMINATION_PHASE")?;
    let password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();
    let session = native_online_login(auth, "engineer-a", &password, now)?;
    match phase.as_str() {
        "inflight" => {
            let entity_id = Uuid::new_v4();
            auth.save_requisition_draft(native_sync_draft(entity_id, session.user_id), now)
                .map_err(|error| error.to_string())?;
            let events = auth
                .pending_sync_events(1, now)
                .map_err(|error| error.to_string())?;
            if events.len() != 1 {
                return Err("termination fixture lacks one pending event".into());
            }
            fs::write(result_path, serde_json::json!({
                "mode": "push-termination-recovery", "phase": "inflight",
                "accountId": session.user_id,
                "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                "profilePath": database_path, "entityId": entity_id, "eventId": events[0].event_id,
                "outboxPending": 1
            }).to_string()).map_err(|_| "cannot write native termination inflight result".to_owned())?;
            let _ = tauri::async_runtime::block_on(auth.push_pending_https(now));
            Err("native termination process was not forcibly terminated".into())
        }
        "recovered" => {
            let event_id = Uuid::parse_str(&required_test_value(
                "HONSEN_PROCURE_NATIVE_PUSH_TERMINATION_EVENT_ID",
            )?)
            .map_err(|_| "termination event ID must be UUID".to_owned())?;
            let pending_before = auth
                .pending_sync_events(10, now)
                .map_err(|error| error.to_string())?;
            if pending_before.len() != 1 || pending_before[0].event_id != event_id {
                return Err("terminated Push event was not retained in Outbox".into());
            }
            let push = tauri::async_runtime::block_on(auth.push_pending_https(now))
                .map_err(|error| error.to_string())?;
            let replay_push = tauri::async_runtime::block_on(auth.push_pending_https(now))
                .map_err(|error| error.to_string())?;
            let pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            let pending_after = auth
                .test_pending_outbox_count(session.user_id)
                .map_err(|error| error.to_string())?;
            if push.accepted_count != 1
                || replay_push.accepted_count != 0
                || pending_after != 0
                || pull.applied_count != 1
            {
                return Err(format!(
                    "terminated Push recovery mismatch: {push:?}; {replay_push:?}; {pull:?}; pending={pending_after}"
                ));
            }
            fs::write(result_path, serde_json::json!({
                "mode": "push-termination-recovery", "phase": "recovered", "recovery": "PASS",
                "accountId": session.user_id, "installationId": auth.test_installation_id().map_err(|error| error.to_string())?, "profilePath": database_path,
                "eventId": event_id, "acceptedCount": push.accepted_count, "replayAcceptedCount": replay_push.accepted_count,
                "pullAppliedCount": pull.applied_count, "outboxPending": pending_after,
                "cursor": auth.test_pull_cursor(session.user_id).map_err(|error| error.to_string())?
            }).to_string()).map_err(|_| "cannot write native termination recovery result".to_owned())
        }
        _ => Err("native Push termination phase must be inflight or recovered".into()),
    }
}

#[cfg(debug_assertions)]
fn run_native_push_partial_batch_smoke(
    account_a: &LocalAuthService,
    account_a_path: &PathBuf,
) -> Result<(), String> {
    let account_b_path = PathBuf::from(required_test_value(
        "HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH",
    )?);
    if !account_b_path.is_absolute()
        || !account_b_path.to_string_lossy().ends_with(".test.sqlite")
        || account_b_path == *account_a_path
    {
        return Err("native partial Push requires a distinct absolute B test database".into());
    }
    let account_b = LocalAuthService::open_test_path(
        account_b_path
            .to_str()
            .ok_or_else(|| "native partial Push B database path must be UTF-8".to_owned())?,
    )
    .map_err(|error| error.to_string())?;
    let engineer_a_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD")?;
    let purchaser_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_PURCHASER_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();

    let account_a_session =
        native_online_login(account_a, "engineer-a", &engineer_a_password, now)?;
    let stale_order_id = Uuid::new_v4();
    account_a
        .save_requisition_draft(
            native_sync_draft(stale_order_id, account_a_session.user_id),
            now,
        )
        .map_err(|error| error.to_string())?;
    let initial_push = tauri::async_runtime::block_on(account_a.push_pending_https(now))
        .map_err(|error| error.to_string())?;
    if initial_push.accepted_count != 1 || initial_push.pending_count != 0 {
        return Err(format!(
            "partial Push fixture was not accepted: {initial_push:?}"
        ));
    }

    let purchaser_session = native_online_login(&account_b, "purchaser", &purchaser_password, now)?;
    let accepted_order_id = Uuid::new_v4();
    account_b
        .save_requisition_draft(
            native_sync_draft(accepted_order_id, purchaser_session.user_id),
            now,
        )
        .map_err(|error| error.to_string())?;
    account_b
        .save_requisition_draft(
            native_sync_draft(stale_order_id, account_a_session.user_id),
            now,
        )
        .map_err(|error| error.to_string())?;
    let pending_before = account_b
        .pending_sync_events(10, now)
        .map_err(|error| error.to_string())?;
    if pending_before.len() != 2
        || pending_before[0].entity_id != accepted_order_id
        || pending_before[1].entity_id != stale_order_id
    {
        return Err("partial Push fixture did not create an ordered valid/stale batch".into());
    }
    let accepted_event_id = pending_before[0].event_id;
    let conflict_event_id = pending_before[1].event_id;
    let partial_push = tauri::async_runtime::block_on(account_b.push_pending_https(now))
        .map_err(|error| error.to_string())?;
    let pending_after = account_b
        .pending_sync_events(10, now)
        .map_err(|error| error.to_string())?;
    if partial_push.accepted_count != 1
        || partial_push.pending_count != 1
        || pending_after.len() != 1
        || pending_after[0].event_id != conflict_event_id
        || account_b
            .test_outbox_acknowledged(accepted_event_id)
            .map_err(|error| error.to_string())?
            != Some(true)
        || account_b
            .test_outbox_acknowledged(conflict_event_id)
            .map_err(|error| error.to_string())?
            != Some(false)
    {
        return Err(format!(
            "partial Push did not acknowledge only the accepted event: {partial_push:?}; pending={pending_after:?}"
        ));
    }

    let cursor_before_pull = account_b
        .test_pull_cursor(purchaser_session.user_id)
        .map_err(|error| error.to_string())?;
    let pull = tauri::async_runtime::block_on(account_b.pull_sync_https(now))
        .map_err(|error| error.to_string())?;
    let cursor_after_pull = account_b
        .test_pull_cursor(purchaser_session.user_id)
        .map_err(|error| error.to_string())?;
    let conflicts = account_b
        .list_sync_conflicts(now)
        .map_err(|error| error.to_string())?;
    if pull.applied_count != 2
        || pull.next_cursor == cursor_before_pull
        || cursor_after_pull != pull.next_cursor
        || conflicts.len() != 1
        || conflicts[0].entity_id != stale_order_id
        || account_b
            .test_remote_entity_version("purchase_order", accepted_order_id)
            .map_err(|error| error.to_string())?
            != Some(1)
    {
        return Err(format!(
            "partial Push conflict Pull did not retain/projection states: pull={pull:?}; conflicts={conflicts:?}"
        ));
    }
    let replay_push = tauri::async_runtime::block_on(account_b.push_pending_https(now))
        .map_err(|error| error.to_string())?;
    let pending_after_replay = account_b
        .pending_sync_events(10, now)
        .map_err(|error| error.to_string())?;
    if replay_push.accepted_count != 0
        || replay_push.pending_count != 1
        || pending_after_replay.len() != 1
        || pending_after_replay[0].event_id != conflict_event_id
    {
        return Err(format!(
            "partial Push replay did not retain only the conflict event: {replay_push:?}"
        ));
    }
    fs::write(
        result_path,
        serde_json::json!({
            "mode": "push-partial-batch",
            "partialBatchAcceptedOnly": "PASS",
            "conflictEventRetained": "PASS",
            "conflictProjected": "PASS",
            "replayRetained": "PASS",
            "accountA": account_a_session.user_id,
            "accountB": purchaser_session.user_id,
            "installationB": account_b.test_installation_id().map_err(|error| error.to_string())?,
            "profileA": account_a_path,
            "profileB": account_b_path,
            "acceptedOrderId": accepted_order_id,
            "staleOrderId": stale_order_id,
            "acceptedEventId": accepted_event_id,
            "conflictEventId": conflict_event_id,
            "partialAcceptedCount": partial_push.accepted_count,
            "partialPendingCount": partial_push.pending_count,
            "pendingAfterPartial": pending_after.len(),
            "pullAppliedCount": pull.applied_count,
            "cursorBeforePull": cursor_before_pull,
            "cursorAfterPull": cursor_after_pull,
            "conflictCount": conflicts.len(),
            "replayAcceptedCount": replay_push.accepted_count,
            "replayPendingCount": replay_push.pending_count,
        })
        .to_string(),
    )
    .map_err(|_| "cannot write native partial Push result".to_owned())
}

#[cfg(debug_assertions)]
fn run_native_offline_push_recovery_smoke(
    auth: &LocalAuthService,
    database_path: &PathBuf,
) -> Result<(), String> {
    let phase = required_test_value("HONSEN_PROCURE_NATIVE_OFFLINE_PUSH_PHASE")?;
    let engineer_a_password = required_test_value("HONSEN_PROCURE_NATIVE_AB_ENGINEER_A_PASSWORD")?;
    let result_path = test_result_path()?;
    let now = SystemTime::now();

    match phase.as_str() {
        "offline" => {
            let session = native_online_login(auth, "engineer-a", &engineer_a_password, now)?;
            let baseline_cursor = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let baseline_pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            if baseline_pull.applied_count != 0 || baseline_pull.next_cursor != baseline_cursor {
                return Err(format!(
                    "online baseline Pull was not empty and stable: {baseline_pull:?}; cursor={baseline_cursor}"
                ));
            }
            let ready_path =
                native_offline_control_path("HONSEN_PROCURE_NATIVE_OFFLINE_READY_PATH")?;
            let continue_path =
                native_offline_control_path("HONSEN_PROCURE_NATIVE_OFFLINE_CONTINUE_PATH")?;
            fs::write(&ready_path, "online baseline complete")
                .map_err(|_| "cannot signal native offline baseline readiness".to_owned())?;
            for _ in 0..300 {
                if continue_path.exists() {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
            if !continue_path.exists() {
                return Err(
                    "native offline harness did not confirm HTTPS endpoint shutdown".into(),
                );
            }
            let order_id = Uuid::new_v4();
            auth.save_requisition_draft(native_sync_draft(order_id, session.user_id), now)
                .map_err(|error| error.to_string())?;
            let pending_before = auth
                .pending_sync_events(10, now)
                .map_err(|error| error.to_string())?;
            if pending_before.len() != 1
                || pending_before[0].entity_type != "purchase_order"
                || pending_before[0].entity_id != order_id
                || auth
                    .test_purchase_order_status(order_id)
                    .map_err(|error| error.to_string())?
                    .as_deref()
                    != Some("draft")
            {
                return Err(
                    "offline draft did not atomically persist one pending order event".into(),
                );
            }
            let event_id = pending_before[0].event_id;
            let failed_push = tauri::async_runtime::block_on(auth.push_pending_https(now));
            if !matches!(failed_push, Err(AuthError::SyncTransport)) {
                return Err(format!(
                    "offline Push did not observe real transport failure: {failed_push:?}"
                ));
            }
            let pending_after = auth
                .pending_sync_events(10, now)
                .map_err(|error| error.to_string())?;
            let status = auth.sync_status(now).map_err(|error| error.to_string())?;
            if pending_after.len() != 1
                || pending_after[0].event_id != event_id
                || status.pending_count != 1
                || auth
                    .test_outbox_acknowledged(event_id)
                    .map_err(|error| error.to_string())?
                    != Some(false)
            {
                return Err("offline Push lost or acknowledged the pending event".into());
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "offline-push-recovery",
                    "phase": "offline",
                    "onlineBaseline": "PASS",
                    "offlineTransportFailure": "PASS",
                    "outboxRetained": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "entityId": order_id,
                    "eventId": event_id,
                    "cursorBefore": baseline_cursor,
                    "cursorAfter": auth.test_pull_cursor(session.user_id).map_err(|error| error.to_string())?,
                    "localEntityStatus": "draft",
                    "outboxPendingBeforePush": 1,
                    "outboxPendingAfterPush": status.pending_count,
                    "serverEventCount": 0,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write offline Push result".to_owned())
        }
        "recovered" => {
            let order_id = Uuid::parse_str(&required_test_value(
                "HONSEN_PROCURE_NATIVE_OFFLINE_ENTITY_ID",
            )?)
            .map_err(|_| "native offline order ID must be a UUID".to_owned())?;
            let event_id = Uuid::parse_str(&required_test_value(
                "HONSEN_PROCURE_NATIVE_OFFLINE_EVENT_ID",
            )?)
            .map_err(|_| "native offline event ID must be a UUID".to_owned())?;
            let session = native_online_login(auth, "engineer-a", &engineer_a_password, now)?;
            let pending_before = auth
                .pending_sync_events(10, now)
                .map_err(|error| error.to_string())?;
            if pending_before.len() != 1
                || pending_before[0].event_id != event_id
                || auth
                    .test_purchase_order_status(order_id)
                    .map_err(|error| error.to_string())?
                    .as_deref()
                    != Some("draft")
            {
                return Err(
                    "restarted client did not retain the offline local order and outbox".into(),
                );
            }
            let recovered_push = tauri::async_runtime::block_on(auth.push_pending_https(now))
                .map_err(|error| error.to_string())?;
            if recovered_push.accepted_count != 1
                || recovered_push.pending_count != 0
                || auth
                    .test_outbox_acknowledged(event_id)
                    .map_err(|error| error.to_string())?
                    != Some(true)
            {
                return Err(format!(
                    "recovered Push did not acknowledge exactly one retained event: {recovered_push:?}"
                ));
            }
            let replay_push = tauri::async_runtime::block_on(auth.push_pending_https(now))
                .map_err(|error| error.to_string())?;
            if replay_push.accepted_count != 0 || replay_push.pending_count != 0 {
                return Err(format!(
                    "recovered Push replay was not empty: {replay_push:?}"
                ));
            }
            let cursor_before_pull = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            let pull = tauri::async_runtime::block_on(auth.pull_sync_https(now))
                .map_err(|error| error.to_string())?;
            let cursor_after_pull = auth
                .test_pull_cursor(session.user_id)
                .map_err(|error| error.to_string())?;
            if pull.applied_count != 1
                || pull.next_cursor == cursor_before_pull
                || cursor_after_pull != pull.next_cursor
                || auth
                    .test_remote_entity_version("purchase_order", order_id)
                    .map_err(|error| error.to_string())?
                    != Some(1)
                || auth
                    .test_purchase_order_status(order_id)
                    .map_err(|error| error.to_string())?
                    .as_deref()
                    != Some("draft")
            {
                return Err(format!(
                    "recovered Push/Pull did not converge local authority: push={recovered_push:?}; pull={pull:?}; cursor={cursor_before_pull}->{cursor_after_pull}"
                ));
            }
            fs::write(
                result_path,
                serde_json::json!({
                    "mode": "offline-push-recovery",
                    "phase": "recovered",
                    "restartRetention": "PASS",
                    "recoveredPush": "PASS",
                    "pushReplay": "PASS",
                    "authoritativePull": "PASS",
                    "accountId": session.user_id,
                    "installationId": auth.test_installation_id().map_err(|error| error.to_string())?,
                    "profilePath": database_path,
                    "entityId": order_id,
                    "eventId": event_id,
                    "outboxPendingBeforeRecovery": 1,
                    "outboxPendingAfterRecovery": 0,
                    "serverEventCount": 1,
                    "localEntityStatus": "draft",
                    "cursorBeforePull": cursor_before_pull,
                    "cursorAfterPull": cursor_after_pull,
                    "pullProjectedCount": pull.applied_count,
                })
                .to_string(),
            )
            .map_err(|_| "cannot write recovered offline Push result".to_owned())
        }
        _ => Err("native offline Push phase must be offline or recovered".into()),
    }
}

#[cfg(debug_assertions)]
fn native_offline_control_path(name: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(required_test_value(name)?);
    if !path.is_absolute() || path.extension().and_then(|value| value.to_str()) != Some("signal") {
        return Err(format!("{name} must be an absolute .signal path"));
    }
    Ok(path)
}

#[cfg(not(debug_assertions))]
fn run_native_ab_sync_security_smoke(
    _account_a: &LocalAuthService,
    _account_a_path: &PathBuf,
) -> Result<(), String> {
    Err("native A/B sync smoke is unavailable outside a debug test build".into())
}

#[cfg(not(debug_assertions))]
fn run_native_pull_recovery_smoke(
    _auth: &LocalAuthService,
    _database_path: &PathBuf,
) -> Result<(), String> {
    Err("native Pull recovery smoke is unavailable outside a debug test build".into())
}

#[cfg(not(debug_assertions))]
fn run_native_pull_page_recovery_smoke(
    _auth: &LocalAuthService,
    _database_path: &PathBuf,
) -> Result<(), String> {
    Err("native paged Pull recovery smoke is unavailable outside a debug test build".into())
}

#[cfg(not(debug_assertions))]
fn run_native_cursor_write_recovery_smoke(
    _auth: &LocalAuthService,
    _database_path: &PathBuf,
) -> Result<(), String> {
    Err("native Cursor write recovery smoke is unavailable outside a debug test build".into())
}

#[cfg(not(debug_assertions))]
fn run_native_push_termination_smoke(
    _auth: &LocalAuthService,
    _database_path: &PathBuf,
) -> Result<(), String> {
    Err("native Push termination smoke is unavailable outside a debug test build".into())
}

#[cfg(not(debug_assertions))]
fn run_native_push_partial_batch_smoke(
    _account_a: &LocalAuthService,
    _account_a_path: &PathBuf,
) -> Result<(), String> {
    Err("native partial Push batch smoke is unavailable outside a debug test build".into())
}

#[cfg(not(debug_assertions))]
fn run_native_offline_push_recovery_smoke(
    _auth: &LocalAuthService,
    _database_path: &PathBuf,
) -> Result<(), String> {
    Err("native offline Push recovery smoke is unavailable outside a debug test build".into())
}

#[cfg(debug_assertions)]
fn native_sync_draft(order_id: Uuid, applicant_id: Uuid) -> RequisitionDraftInput {
    let country_id = Uuid::parse_str("10000000-0000-4000-8000-000000000001").expect("test UUID");
    let project_id = Uuid::parse_str("10000000-0000-4000-8000-000000000002").expect("test UUID");
    let department_id = Uuid::parse_str("10000000-0000-4000-8000-000000000003").expect("test UUID");
    let team_id = Uuid::parse_str("10000000-0000-4000-8000-000000000004").expect("test UUID");
    RequisitionDraftInput {
        id: order_id,
        display_no: format!("NATIVE-SYNC-{order_id}"),
        country_id,
        project_id,
        site: "Test site".into(),
        department_id,
        team_id,
        applicant_id,
        currency: "XOF".into(),
        primary_currency: "XOF".into(),
        language_pair: "zh_fr".into(),
        urgency: "normal".into(),
        urgency_reason: None,
        order_date: "2026-10-16".into(),
        delivery_address: "native test address".into(),
        expected_delivery_date: None,
        notes: None,
        order_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
        order_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
        tax_rate_basis_points: 0,
        lines: vec![RequisitionLineInput {
            id: Uuid::new_v4(),
            material_id: None,
            catalog_price_id: None,
            material_snapshot: MaterialSnapshotInput {
                name_zh: "Native sync fixture".into(),
                name_fr: None,
                model: "NATIVE-SYNC".into(),
                specification: "Native HTTPS synchronization fixture".into(),
            },
            supplier_id: None,
            currency: "XOF".into(),
            quantity: "1".into(),
            unit: "piece".into(),
            unit_price_minor: "100".into(),
            line_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
            line_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
            freight_included: false,
            sort_order: 0,
        }],
    }
}

fn required_test_value(name: &str) -> Result<String, String> {
    env::var(name).map_err(|_| format!("{name} is required and is not persisted"))
}

fn write_native_smoke_failure(mode: &str, error: &str) {
    if let Ok(result_path) = test_result_path() {
        let _ = fs::write(
            result_path,
            serde_json::json!({ "mode": mode, "result": "FAIL", "error": error }).to_string(),
        );
    }
}

fn test_result_path() -> Result<PathBuf, String> {
    let path = PathBuf::from(required_test_value(
        "HONSEN_PROCURE_NATIVE_SMOKE_RESULT_PATH",
    )?);
    if !path.is_absolute() || !path.to_string_lossy().ends_with(".test.json") {
        return Err("native smoke result path must be absolute and end in .test.json".to_owned());
    }
    path.parent()
        .filter(|parent| parent.is_dir())
        .ok_or_else(|| "native smoke result directory must exist".to_owned())?;
    Ok(path)
}

fn arithmetic_answer(question: &str) -> Result<u8, String> {
    let parts = question.split_whitespace().collect::<Vec<_>>();
    match parts.as_slice() {
        [left, "+", right, "=", "?"] => left
            .parse::<u8>()
            .ok()
            .zip(right.parse::<u8>().ok())
            .and_then(|(left, right)| left.checked_add(right))
            .ok_or_else(|| "unexpected CAPTCHA question".to_owned()),
        _ => Err("unexpected CAPTCHA question".to_owned()),
    }
}
