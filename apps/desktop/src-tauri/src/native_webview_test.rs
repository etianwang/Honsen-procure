//! Debug-only native WebView experiment. The caller must cfg-gate this module.
use std::{env, fs, path::Path};

fn allowed_port(value: &str) -> Result<u16, &'static str> {
    match value {
        "9241" => Ok(9241),
        "9242" => Ok(9242),
        "9251" => Ok(9251),
        "9252" => Ok(9252),
        _ => Err("native WebView test port is not allowed"),
    }
}

fn validate_profile(is_test_profile: bool, database_path: &Path) -> Result<(), &'static str> {
    if !is_test_profile
        || !database_path.is_absolute()
        || !database_path.to_string_lossy().ends_with(".test.sqlite")
    {
        return Err("native WebView test requires an isolated test profile");
    }
    Ok(())
}

pub fn configure<R: tauri::Runtime>(
    context: &mut tauri::Context<R>,
    is_test_profile: bool,
    database_path: &Path,
) -> Result<(), &'static str> {
    let mode = match env::var("HONSEN_NATIVE_WEBVIEW_TEST") {
        Ok(value) => value,
        Err(env::VarError::NotPresent) => return Ok(()),
        Err(_) => return Err("invalid native WebView test mode"),
    };
    validate_profile(is_test_profile, database_path)?;
    if mode != "diagnose" && mode != "config" {
        return Err("invalid native WebView test mode");
    }
    let port = allowed_port(
        &env::var("HONSEN_NATIVE_WEBVIEW_TEST_PORT")
            .map_err(|_| "native WebView test requires an allowed port")?,
    )?;
    let expected_port = format!("--remote-debugging-port={port}");
    let browser_arguments = env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").ok();
    let arguments_present = browser_arguments.is_some();
    let expected_port_present = browser_arguments
        .as_deref()
        .is_some_and(|value| value.split_whitespace().any(|part| part == expected_port));
    let user_data_present = env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some();
    if mode == "config" {
        let main = context
            .config_mut()
            .app
            .windows
            .iter_mut()
            .find(|window| window.label == "main")
            .ok_or("native WebView test main window is missing")?;
        // Preserve Wry defaults; do not accept caller-supplied Chromium arguments.
        main.additional_browser_args = Some(format!(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-address=127.0.0.1 {expected_port}"
        ));
        main.data_directory = Some(database_path.with_extension(format!("native-webview-{port}")));
    }
    let evidence = serde_json::json!({
        "testProfile": true,
        "browserArgumentsEnvironmentPresent": arguments_present,
        "expectedPortEnvironmentPresent": expected_port_present,
        "userDataEnvironmentPresent": user_data_present,
        "configExperimentEnabled": mode == "config"
    });
    fs::write(
        database_path.with_extension("webview-diagnostic.json"),
        evidence.to_string(),
    )
    .map_err(|_| "cannot write isolated native WebView diagnostic")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{allowed_port, validate_profile};
    use std::path::Path;

    #[test]
    fn rejects_non_test_relative_and_business_database_profiles() {
        let isolated = std::env::temp_dir().join("native-scope.test.sqlite");
        assert!(validate_profile(true, &isolated).is_ok());
        assert!(validate_profile(false, &isolated).is_err());
        assert!(validate_profile(true, Path::new("relative.test.sqlite")).is_err());
        assert!(validate_profile(true, &isolated.with_file_name("business.sqlite")).is_err());
        assert!(
            validate_profile(true, &isolated.with_file_name("native.test.sqlite.backup")).is_err()
        );
    }
    #[test]
    fn accepts_only_the_four_native_test_ports() {
        for port in ["9241", "9242", "9251", "9252"] {
            assert!(allowed_port(port).is_ok());
        }
        for port in ["0", "9222", "9253", "9251 --no-sandbox", "0.0.0.0:9251"] {
            assert!(allowed_port(port).is_err());
        }
    }
}
