use honsen_materials_desktop_core::{CachedAccount, LocalAuthService, Role, commands};
use std::{env, time::SystemTime};
use uuid::Uuid;
fn id(n: u32) -> Uuid {
    Uuid::parse_str(&format!("10000000-0000-4000-8000-{n:012}")).unwrap()
}
fn main() {
    assert_eq!(
        env::var("HONSEN_DEMO_TEST_ONLY").as_deref(),
        Ok("1"),
        "explicit test opt-in required"
    );
    let password = env::var("HONSEN_DEMO_PASSWORD").expect("ephemeral test password required");
    assert!(password.len() >= 24);
    let auth =
        LocalAuthService::open_in_memory().expect("isolated SQLite and existing memory vault");
    let now = SystemTime::now();
    auth.bootstrap_test_profile(&password, &password, &password, now)
        .unwrap();
    for (n, name, roles, enabled) in [
        (11, "张和凯", vec![Role::Administrator], true),
        (12, "unused-demo-account", vec![Role::Engineer], false),
        (13, "沈奕文", vec![Role::Purchaser], true),
    ] {
        auth.cache_verified_account(
            CachedAccount {
                id: id(n),
                username: name.into(),
                roles,
                enabled,
                requires_password_change: false,
            },
            &password,
            now,
        )
        .unwrap();
    }
    let challenge = auth.issue_captcha(now).unwrap();
    let digits: Vec<u8> = challenge
        .question
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect();
    auth.offline_login("张和凯", &password, challenge.id, digits.iter().sum(), now)
        .unwrap();
    let records = serde_json::json!([
        {"kind":"country","id":id(1),"business_code":"TEST-CI","name":"科特迪瓦","time_zone":"Africa/Abidjan","is_active":true,"version":1},
        {"kind":"project","id":id(2),"country_id":id(1),"business_code":"TEST-OPA","name":"Bethel2 办公楼","site":"科特迪瓦 · 阿比让演示工地","department_name":"采购部","default_currency":"XOF","default_language_pair":"zh_fr","is_active":true,"version":1},
        {"kind":"department","id":id(3),"business_code":"TEST-PROC","name":"采购部","is_active":true,"version":1},
        {"kind":"team","id":id(4),"department_id":id(3),"business_code":"TEST-TEAM","name":"机电安装班组","is_active":true,"version":1}
    ]);
    for record in records.as_array().unwrap() {
        auth.save_reference_master_data(serde_json::from_value(record.clone()).unwrap(), now)
            .unwrap();
    }
    let material = serde_json::json!({"id":id(5),"sku":"TEST-CABLE","categoryId":null,"nameZh":"已停用的初始测试材料","nameFr":null,"aliases":[],"brand":null,"model":"TEST-3X2.5","specification":"3 × 2.5 mm²","unit":"米","notes":"不用于演示业务","isActive":false,"version":1});
    auth.save_material(serde_json::from_value(material).unwrap(), now)
        .unwrap();
    let supplier = serde_json::json!({"id":id(6),"businessCode":"TEST-SUPPLIER","name":"已停用的初始测试供应商","countryId":id(1),"isPreferred":false,"isBlacklisted":false,"isActive":false,"version":1});
    auth.save_supplier(serde_json::from_value(supplier).unwrap(), now)
        .unwrap();
    assert!(!auth.approval_policy(now).unwrap().allow_self_approval);
    auth.lock().unwrap();
    assert!(auth.require_material_mutation(now).is_err());
    if env::var("HONSEN_DEMO_SELF_CHECK_ONLY").as_deref() == Ok("1") {
        println!("PASS: isolated fixture, default no-self-approval, locked mutations denied");
        return;
    }
    println!(
        "READY: isolated SQLite :memory:, memory vault, two enabled named accounts; no cloud session"
    );
    tauri::Builder::default()
        .manage(auth)
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
            commands::list_payment_sync_conflicts,
            commands::resolve_payment_sync_conflict,
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
            commands::reverse_procurement_expenditure,
            commands::import_attachment,
            commands::list_attachments,
            commands::list_attachment_targets,
            commands::sync_attachments,
            commands::read_attachment,
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
        .expect("run isolated demo test harness");
}
