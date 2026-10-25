use honsen_materials_desktop_core::LocalAuthService;
use keyring::Entry;
use sha2::{Digest, Sha256};
use std::{
    env,
    path::{Path, PathBuf},
    process::ExitCode,
    time::SystemTime,
};

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

fn sync_service(path: &Path) -> String {
    let profile_hash = format!("{:x}", Sha256::digest(path.to_string_lossy().as_bytes()));
    format!("S-{}", &profile_hash[..8])
}

fn probe_vault(path: &Path, second_path: &Path) -> Result<(), String> {
    let account = "10000000-0000-4000-8000-000000000011";
    let first_service = sync_service(path);
    let second_service = sync_service(second_path);
    if first_service == second_service {
        return Err("test profile services unexpectedly match".into());
    }
    let first = Entry::new(&first_service, account).map_err(|error| error.to_string())?;
    let second = Entry::new(&second_service, account).map_err(|error| error.to_string())?;
    let first_token = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
    let second_token = "fghij_KLMN-opqrSTUVwxyz0123456789ABCDEfghij";
    first
        .set_password(&first_token)
        .map_err(|error| error.to_string())?;
    second
        .set_password(&second_token)
        .map_err(|error| error.to_string())?;
    let result = (|| -> Result<(), String> {
        if Entry::new(&first_service, account)
            .map_err(|error| error.to_string())?
            .get_password()
            .map_err(|error| error.to_string())?
            != first_token
        {
            return Err("first profile vault token was not retained".into());
        }
        if Entry::new(&second_service, account)
            .map_err(|error| error.to_string())?
            .get_password()
            .map_err(|error| error.to_string())?
            != second_token
        {
            return Err("second profile vault token was not retained".into());
        }
        Ok(())
    })();
    for entry in [&first, &second] {
        let _ = entry.delete_credential();
    }
    result
}

fn main() -> ExitCode {
    let Some(action) = env::args().nth(1) else {
        eprintln!("usage: honsen-procure-test-profile <seed|clean|vault-probe>");
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
            "vault-probe" => {
                let second = env::var("HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH")
                    .map(PathBuf::from)
                    .map_err(|_| {
                        "HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH is required".to_owned()
                    })?;
                if !second.is_absolute() || !second.to_string_lossy().ends_with(".test.sqlite") {
                    return Err("HONSEN_PROCURE_NATIVE_AB_SECOND_DB_PATH must be an absolute .test.sqlite path".into());
                }
                probe_vault(&path, &second)?;
                println!("PASS native test-profile OS credential-vault probe");
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
