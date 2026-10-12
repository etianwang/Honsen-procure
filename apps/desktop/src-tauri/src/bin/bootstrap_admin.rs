use honsen_materials_desktop_core::LocalAuthService;
use std::{
    env,
    io::{self, Write},
    path::PathBuf,
    process::ExitCode,
    time::SystemTime,
};

fn required_database() -> Result<PathBuf, String> {
    let mut arguments = env::args().skip(1);
    if arguments.next().as_deref() != Some("--database") {
        return Err(
            "usage: honsen-procure-bootstrap-admin --database <absolute .sqlite path>".into(),
        );
    }
    let path = PathBuf::from(arguments.next().ok_or("database path is required")?);
    if arguments.next().is_some()
        || !path.is_absolute()
        || path.extension().is_none_or(|value| value != "sqlite")
    {
        return Err("database path must be an absolute .sqlite path".into());
    }
    Ok(path)
}

fn prompt(label: &str, secret: bool) -> Result<String, String> {
    print!("{label}: ");
    io::stdout().flush().map_err(|_| "cannot write prompt")?;
    let value = if secret {
        rpassword::read_password().map_err(|_| "cannot read password")?
    } else {
        let mut value = String::new();
        io::stdin()
            .read_line(&mut value)
            .map_err(|_| "cannot read username")?;
        value.trim().to_owned()
    };
    if value.trim().is_empty() {
        return Err("value is required".into());
    }
    Ok(value)
}

fn main() -> ExitCode {
    let result = (|| -> Result<(), String> {
        let path = required_database()?;
        let username = prompt("administrator username", false)?;
        let password = prompt("administrator password", true)?;
        let confirmation = prompt("confirm administrator password", true)?;
        if password != confirmation {
            return Err("password confirmation does not match".into());
        }
        let service = LocalAuthService::open_path(path.to_str().ok_or("non-UTF-8 database path")?)
            .map_err(|error| error.to_string())?;
        service
            .bootstrap_initial_administrator(&username, &password, SystemTime::now())
            .map_err(|error| error.to_string())?;
        println!("initial administrator created");
        Ok(())
    })();
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("bootstrap: {message}");
            ExitCode::FAILURE
        }
    }
}
