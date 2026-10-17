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
            commands::resolve_sync_conflict,
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
    if conflict_push.accepted_count != 0 {
        return Err("stale account B Push did not produce a synchronization conflict".into());
    }
    let conflicts = account_b
        .list_sync_conflicts(now)
        .map_err(|error| error.to_string())?;
    if purchaser_session.username != "purchaser"
        || conflicts.len() != 1
        || conflicts[0].entity_id != order_id
    {
        return Err("account B conflict query did not contain only its own stale event".into());
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
        })
        .to_string(),
    )
    .map_err(|_| "cannot write native A/B sync result".to_owned())
}

#[cfg(not(debug_assertions))]
fn run_native_ab_sync_security_smoke(
    _account_a: &LocalAuthService,
    _account_a_path: &PathBuf,
) -> Result<(), String> {
    Err("native A/B sync smoke is unavailable outside a debug test build".into())
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
