use honsen_materials_desktop_core::{LocalAuthService, commands};
use std::{env, fs, path::PathBuf};
use tauri::Manager;

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
    fs::create_dir_all(database_path.parent().expect("database path has a parent"))
        .expect("create local SQLite directory");
    let auth = if is_test_profile {
        LocalAuthService::open_test_path(database_path.to_str().expect("UTF-8 database path"))
    } else {
        LocalAuthService::open_path(database_path.to_str().expect("UTF-8 database path"))
    }
    .expect("open local SQLite database");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            commands::list_sync_conflicts,
            commands::resolve_sync_conflict,
            commands::create_rfq,
            commands::save_owner_purchase_pricing,
            commands::set_procurement_mode,
            commands::record_receipt,
            commands::list_procurement_expenditures,
            commands::record_procurement_expenditure,
            commands::reverse_procurement_expenditure,
            commands::list_expenditure_vouchers,
            commands::choose_expenditure_voucher,
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
            commands::save_exchange_rate
        ])
        .run(tauri::generate_context!())
        .expect("run Honsen Procure desktop");
}
