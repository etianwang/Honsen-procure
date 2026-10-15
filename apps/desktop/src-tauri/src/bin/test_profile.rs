use honsen_materials_desktop_core::LocalAuthService;
use std::{env, path::PathBuf, process::ExitCode, time::SystemTime};

fn database_path() -> Result<PathBuf, String> {
    let path = env::var("HONSEN_PROCURE_TEST_DB_PATH")
        .map(PathBuf::from)
        .map_err(|_| "HONSEN_PROCURE_TEST_DB_PATH is required".to_owned())?;
    if !path.is_absolute() || !path.to_string_lossy().ends_with(".test.sqlite") {
        return Err(
            "HONSEN_PROCURE_TEST_DB_PATH must be absolute and end in .test.sqlite".to_owned(),
        );
    }
    Ok(path)
}

fn password(name: &str) -> Result<String, String> {
    env::var(name).map_err(|_| format!("{name} is required and is not persisted"))
}

fn main() -> ExitCode {
    let Some(action) = env::args().nth(1) else {
        eprintln!("usage: honsen-procure-test-profile <seed|clean>");
        return ExitCode::FAILURE;
    };
    let result = (|| -> Result<(), String> {
        let path = database_path()?;
        match action.as_str() {
            "seed" => {
                std::fs::create_dir_all(path.parent().ok_or("test database requires parent")?)
                    .map_err(|_| "cannot create test profile directory")?;
                let auth = LocalAuthService::open_test_path(path.to_str().ok_or("non-UTF-8 path")?)
                    .map_err(|error| error.to_string())?;
                if let Ok(named_password) = env::var("HONSEN_TEST_NAMED_PASSWORD") {
                    auth.cache_named_test_profile_accounts(&named_password, SystemTime::now())
                        .map_err(|error| error.to_string())?;
                }
                auth.bootstrap_test_profile(
                    &password("HONSEN_TEST_ENGINEER_A_PASSWORD")?,
                    &password("HONSEN_TEST_ENGINEER_B_PASSWORD")?,
                    &password("HONSEN_TEST_PURCHASER_PASSWORD")?,
                    SystemTime::now(),
                )
                .map_err(|error| error.to_string())?;
                println!(
                    "seeded isolated Honsen Procure test profile: {}",
                    path.display()
                );
            }
            "clean" => {
                LocalAuthService::clear_test_profile(&path).map_err(|error| error.to_string())?;
                println!(
                    "cleared isolated Honsen Procure test profile: {}",
                    path.display()
                );
            }
            _ => return Err("action must be seed or clean".to_owned()),
        }
        Ok(())
    })();
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("test profile: {message}");
            ExitCode::FAILURE
        }
    }
}
