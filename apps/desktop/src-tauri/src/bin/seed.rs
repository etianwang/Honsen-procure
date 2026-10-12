use honsen_materials_desktop_core::LocalAuthService;
use std::{
    env, fs,
    io::{self, Write},
    path::PathBuf,
    process::ExitCode,
    time::SystemTime,
};

fn prompt(label: &str, hidden: bool) -> Result<String, String> {
    print!("{label}: ");
    io::stdout().flush().map_err(|_| "cannot write prompt")?;
    if hidden {
        return rpassword::read_password().map_err(|_| "cannot read password".into());
    }
    let mut value = String::new();
    io::stdin()
        .read_line(&mut value)
        .map_err(|_| "cannot read input")?;
    Ok(value.trim().to_owned())
}

fn run() -> Result<(), String> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    if args.len() != 6 || args[0] != "--profile" || args[2] != "--database" || args[4] != "--file" {
        return Err("usage: honsen-procure-seed --profile <test|production> --database <absolute .sqlite path> --file <seed/master-data.json>".into());
    }
    let profile = args[1].as_str();
    let database = PathBuf::from(&args[3]);
    if !matches!(profile, "test" | "production")
        || !database.is_absolute()
        || !database.is_file()
        || database.extension().is_none_or(|value| value != "sqlite")
    {
        return Err("existing absolute .sqlite database and explicit profile are required".into());
    }
    let is_test_path = database.to_string_lossy().ends_with(".test.sqlite");
    if (profile == "test") != is_test_path {
        return Err(
            "test profile requires .test.sqlite; production profile rejects test databases".into(),
        );
    }
    let source = fs::read_to_string(&args[5]).map_err(|_| "cannot read Seed file")?;
    let path = database.to_str().ok_or("non-UTF-8 database path")?;
    let service = if profile == "test" {
        LocalAuthService::open_test_path(path)
    } else {
        LocalAuthService::open_path(path)
    }
    .map_err(|error| error.to_string())?;
    let username = prompt("username", false)?;
    let password = prompt("password", true)?;
    let now = SystemTime::now();
    let challenge = service
        .issue_captcha(now)
        .map_err(|error| error.to_string())?;
    println!("CAPTCHA: {}", challenge.question);
    let answer = prompt("CAPTCHA answer", false)?
        .parse::<u8>()
        .map_err(|_| "CAPTCHA answer must be a number".to_string())?;
    service
        .offline_login(&username, &password, challenge.id, answer, now)
        .map_err(|error| error.to_string())?;
    let report = service
        .import_master_data_seed(&source, SystemTime::now())
        .map_err(|error| error.to_string())?;
    println!(
        "Seed committed: {}",
        serde_json::to_string(&report).map_err(|_| "cannot format report")?
    );
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("seed: {message}");
            ExitCode::FAILURE
        }
    }
}
