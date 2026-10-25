#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, fs, path::PathBuf, process::ExitCode};

use honsen_materials_desktop_core::update_runner::{
    APP_ID, ApplyRequest, OperationResult, RunnerError, Source, apply, launch, utc_timestamp,
    write_result_atomically,
};

fn main() -> ExitCode {
    match run(env::args().skip(1).collect()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("HonsenUpdateRunner: {error}");
            ExitCode::from(1)
        }
    }
}

fn run(arguments: Vec<String>) -> Result<(), RunnerError> {
    let Some(command) = arguments.first().map(String::as_str) else {
        return Err(RunnerError::ManifestMismatch);
    };
    match command {
        "launch" => {
            let (app_id, source) = parse_launch(&arguments[1..])?;
            if app_id != APP_ID {
                return Err(RunnerError::AppIdMismatch);
            }
            launch(source)
        }
        "apply" => {
            let (request, worker) = parse_apply(&arguments[1..])?;
            if !worker {
                return match run_from_temporary_copy(&arguments, &request.operation_id) {
                    Ok(()) => Ok(()),
                    Err(error) => {
                        if !has_worker_result(&request) {
                            write_result_atomically(
                                &request.result_path,
                                &failure_result(&request, &error),
                            )?;
                        }
                        Err(error)
                    }
                };
            }
            let result = match apply(&request) {
                Ok(result) => result,
                Err(error) => failure_result(&request, &error),
            };
            write_result_atomically(&request.result_path, &result)?;
            if result.status == "success" {
                Ok(())
            } else {
                Err(RunnerError::ManifestMismatch)
            }
        }
        _ => Err(RunnerError::ManifestMismatch),
    }
}

fn parse_launch(arguments: &[String]) -> Result<(String, Source), RunnerError> {
    if arguments.len() != 4 || arguments[0] != "--app-id" || arguments[2] != "--source" {
        return Err(RunnerError::ManifestMismatch);
    }
    Ok((arguments[1].clone(), parse_source(&arguments[3])?))
}

fn parse_apply(arguments: &[String]) -> Result<(ApplyRequest, bool), RunnerError> {
    let mut worker = false;
    let mut fields = std::collections::BTreeMap::new();
    let mut index = 0;
    while index < arguments.len() {
        if arguments[index] == "--worker" {
            worker = true;
            index += 1;
            continue;
        }
        let Some(value) = arguments.get(index + 1) else {
            return Err(RunnerError::ManifestMismatch);
        };
        if !arguments[index].starts_with("--")
            || fields
                .insert(arguments[index].as_str(), value.as_str())
                .is_some()
        {
            return Err(RunnerError::ManifestMismatch);
        }
        index += 2;
    }
    let get = |name| {
        fields
            .get(name)
            .map(|value| (*value).to_owned())
            .ok_or(RunnerError::ManifestMismatch)
    };
    let restart = match get("--restart")?.as_str() {
        "true" => true,
        "false" => false,
        _ => return Err(RunnerError::ManifestMismatch),
    };
    if fields.len() != 10 {
        return Err(RunnerError::ManifestMismatch);
    }
    Ok((
        ApplyRequest {
            source: parse_source(&get("--source")?)?,
            app_id: get("--app-id")?,
            wait_pid: get("--wait-pid")?
                .parse()
                .map_err(|_| RunnerError::ManifestMismatch)?,
            installer: PathBuf::from(get("--installer")?),
            sha256: get("--sha256")?,
            target_dir: PathBuf::from(get("--target-dir")?),
            expected_version: get("--expected-version")?,
            restart,
            operation_id: get("--operation-id")?,
            result_path: PathBuf::from(get("--result-path")?),
        },
        worker,
    ))
}

fn parse_source(value: &str) -> Result<Source, RunnerError> {
    match value {
        "app" => Ok(Source::App),
        "toolbox" => Ok(Source::Toolbox),
        _ => Err(RunnerError::ManifestMismatch),
    }
}

fn run_from_temporary_copy(arguments: &[String], operation_id: &str) -> Result<(), RunnerError> {
    let source = env::current_exe()?;
    let directory = env::temp_dir()
        .join("Honsen Program")
        .join("UpdateRunner")
        .join(operation_id);
    fs::create_dir_all(&directory)?;
    let copy = directory.join("HonsenUpdateRunner.exe");
    fs::copy(source, &copy)?;
    let status = std::process::Command::new(copy)
        .args(arguments)
        .arg("--worker")
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(RunnerError::ManifestMismatch)
    }
}

fn failure_result(request: &ApplyRequest, error: &RunnerError) -> OperationResult {
    OperationResult {
        app_id: APP_ID.into(),
        operation_id: request.operation_id.clone(),
        status: "failed".into(),
        source: request.source.clone(),
        from_version: "unknown".into(),
        to_version: request.expected_version.clone(),
        step: Some(failure_step(error).into()),
        installer_exit_code: match error {
            RunnerError::InstallerExit(code) => Some(*code),
            _ => None,
        },
        installer_log_path: None,
        message: error.to_string(),
        completed_at_utc: utc_timestamp(),
        install_location: None,
        executable_path: None,
    }
}

fn failure_step(error: &RunnerError) -> &'static str {
    match error {
        RunnerError::HashMismatch | RunnerError::Sha256Invalid => "hash-validation",
        RunnerError::WaitProcess => "wait-process",
        RunnerError::InstallerExit(_) => "installer-exit",
        RunnerError::AppIdMismatch
        | RunnerError::ManifestMismatch
        | RunnerError::ManifestContractMismatch
        | RunnerError::VersionContractMismatch
        | RunnerError::TargetDirectoryMismatch
        | RunnerError::RegistrationMissing => "identity-validation",
        _ => "runner",
    }
}

fn has_worker_result(request: &ApplyRequest) -> bool {
    let Ok(bytes) = fs::read(&request.result_path) else {
        return false;
    };
    let Ok(result) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return false;
    };
    result.get("appId").and_then(serde_json::Value::as_str) == Some(APP_ID)
        && result
            .get("operationId")
            .and_then(serde_json::Value::as_str)
            == Some(request.operation_id.as_str())
        && result.get("status").and_then(serde_json::Value::as_str) == Some("failed")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn launch_accepts_only_the_fixed_contract_arguments() {
        assert_eq!(
            parse_launch(&[
                "--app-id".into(),
                APP_ID.into(),
                "--source".into(),
                "toolbox".into()
            ]),
            Ok((APP_ID.into(), Source::Toolbox))
        );
        assert_eq!(
            parse_launch(&[
                "--source".into(),
                "toolbox".into(),
                "--app-id".into(),
                APP_ID.into()
            ]),
            Err(RunnerError::ManifestMismatch)
        );
    }
    #[test]
    fn apply_rejects_extra_public_arguments() {
        let hash = "a".repeat(64);
        let arguments = vec![
            "--source",
            "toolbox",
            "--app-id",
            APP_ID,
            "--wait-pid",
            "0",
            "--installer",
            "C:\\setup.exe",
            "--sha256",
            &hash,
            "--target-dir",
            "C:\\Procure",
            "--expected-version",
            "1.2.4",
            "--restart",
            "false",
            "--operation-id",
            "0f3b2a90-34c4-4d99-bd17-a964da43f6a6",
            "--result-path",
            "C:\\result.json",
            "--extra",
            "no",
        ];
        assert_eq!(
            parse_apply(&arguments.into_iter().map(String::from).collect::<Vec<_>>()),
            Err(RunnerError::ManifestMismatch)
        );
    }

    #[test]
    fn failure_result_uses_an_rfc3339_utc_timestamp() {
        let result = failure_result(
            &ApplyRequest {
                source: Source::Toolbox,
                app_id: APP_ID.into(),
                wait_pid: 0,
                installer: PathBuf::from("C:\\setup.exe"),
                sha256: "a".repeat(64),
                target_dir: PathBuf::from("C:\\Procure"),
                expected_version: "1.2.4".into(),
                restart: false,
                operation_id: "0f3b2a90-34c4-4d99-bd17-a964da43f6a6".into(),
                result_path: PathBuf::from("C:\\result.json"),
            },
            &RunnerError::HashMismatch,
        );
        assert_eq!(result.completed_at_utc.len(), 20);
        assert!(result.completed_at_utc.ends_with('Z'));
    }

    #[test]
    fn recognizes_only_the_worker_result_for_the_requested_operation() {
        let directory =
            std::env::temp_dir().join(format!("honsen-worker-result-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let request = ApplyRequest {
            source: Source::Toolbox,
            app_id: APP_ID.into(),
            wait_pid: 0,
            installer: PathBuf::from("C:\\setup.exe"),
            sha256: "a".repeat(64),
            target_dir: PathBuf::from("C:\\Procure"),
            expected_version: "1.2.4".into(),
            restart: false,
            operation_id: "0f3b2a90-34c4-4d99-bd17-a964da43f6a6".into(),
            result_path: directory.join("result.json"),
        };
        write_result_atomically(
            &request.result_path,
            &failure_result(&request, &RunnerError::HashMismatch),
        )
        .unwrap();
        assert!(has_worker_result(&request));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
