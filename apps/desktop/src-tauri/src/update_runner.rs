use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use uuid::Uuid;

pub const APP_ID: &str = "honsen.procure";
pub const MAIN_EXECUTABLE: &str = "HonsenProcure.exe";
pub const RUNNER_EXECUTABLE: &str = "HonsenUpdateRunner.exe";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    App,
    Toolbox,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema_version: u8,
    pub app_id: String,
    pub display_name: String,
    pub version: String,
    pub executable: String,
    pub update_runner: String,
    pub publisher: String,
    pub update_manifest_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Registration {
    pub app_id: String,
    pub version: String,
    pub install_location: PathBuf,
    pub executable_path: PathBuf,
    pub runner_path: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ApplyRequest {
    pub source: Source,
    pub app_id: String,
    pub wait_pid: u32,
    pub installer: PathBuf,
    pub sha256: String,
    pub target_dir: PathBuf,
    pub expected_version: String,
    pub restart: bool,
    pub operation_id: String,
    pub result_path: PathBuf,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub app_id: String,
    pub operation_id: String,
    pub status: String,
    pub source: Source,
    pub from_version: String,
    pub to_version: String,
    pub step: Option<String>,
    pub installer_exit_code: Option<i32>,
    pub installer_log_path: Option<String>,
    pub message: String,
    pub completed_at_utc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RunnerError {
    #[error("unsupported app id")]
    AppIdMismatch,
    #[error("invalid manifest")]
    ManifestMismatch,
    #[error("registered target directory does not match")]
    TargetDirectoryMismatch,
    #[error("result path is not unique to this operation")]
    ResultPathMismatch,
    #[error("invalid operation id")]
    OperationIdInvalid,
    #[error("invalid SHA-256")]
    Sha256Invalid,
    #[error("installer checksum does not match")]
    HashMismatch,
    #[error("I/O error: {0}")]
    Io(String),
    #[error("runner only supports Windows")]
    UnsupportedPlatform,
    #[error("registered application was not found")]
    RegistrationMissing,
    #[error("the registered application did not exit")]
    WaitProcess,
    #[error("installer returned {0}")]
    InstallerExit(i32),
}
impl From<io::Error> for RunnerError {
    fn from(error: io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

pub fn validate_apply_request(
    request: &ApplyRequest,
    registration: &Registration,
    manifest: &Manifest,
) -> Result<(), RunnerError> {
    if request.app_id != APP_ID || registration.app_id != APP_ID || manifest.app_id != APP_ID {
        return Err(RunnerError::AppIdMismatch);
    }
    if manifest.schema_version != 1
        || manifest.executable != MAIN_EXECUTABLE
        || manifest.update_runner != RUNNER_EXECUTABLE
        || manifest.publisher != "Honsen"
        || !is_version(&manifest.version)
        || !is_version(&registration.version)
        || !is_version(&request.expected_version)
        || !is_file_name(&manifest.executable)
        || !is_file_name(&manifest.update_runner)
    {
        return Err(RunnerError::ManifestMismatch);
    }
    if !same_windows_path(&request.target_dir, &registration.install_location)
        || !is_child_path(
            &registration.executable_path,
            &registration.install_location,
            MAIN_EXECUTABLE,
        )
        || !is_child_path(
            &registration.runner_path,
            &registration.install_location,
            RUNNER_EXECUTABLE,
        )
    {
        return Err(RunnerError::TargetDirectoryMismatch);
    }
    if Uuid::parse_str(&request.operation_id).is_err() {
        return Err(RunnerError::OperationIdInvalid);
    }
    if !is_sha256(&request.sha256) {
        return Err(RunnerError::Sha256Invalid);
    }
    let result = normalize_windows_path(&request.result_path);
    let suffix = format!(
        "\\honsen program\\updateresults\\{}\\{}.json",
        APP_ID, request.operation_id
    );
    if !is_absolute_windows_path(&result) || !result.ends_with(&suffix) {
        return Err(RunnerError::ResultPathMismatch);
    }
    Ok(())
}

pub fn verify_installer_sha256(path: &Path, expected: &str) -> Result<(), RunnerError> {
    if !is_sha256(expected) {
        return Err(RunnerError::Sha256Invalid);
    }
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 65536];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    if format!("{:x}", hasher.finalize()).eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(RunnerError::HashMismatch)
    }
}

pub fn write_result_atomically(path: &Path, result: &OperationResult) -> Result<(), RunnerError> {
    let parent = path.parent().ok_or(RunnerError::ResultPathMismatch)?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        result.operation_id,
        std::process::id()
    ));
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(result).map_err(|error| RunnerError::Io(error.to_string()))?,
    )?;
    fs::rename(temporary, path)?;
    Ok(())
}
pub fn read_manifest(install_location: &Path) -> Result<Manifest, RunnerError> {
    serde_json::from_slice(&fs::read(install_location.join("honsen.app.json"))?)
        .map_err(|_| RunnerError::ManifestMismatch)
}

pub fn launch(_source: Source) -> Result<(), RunnerError> {
    let registration = read_registration()?;
    let manifest = read_manifest(&registration.install_location)?;
    if manifest.app_id != APP_ID
        || manifest.executable != MAIN_EXECUTABLE
        || manifest.update_runner != RUNNER_EXECUTABLE
        || !is_child_path(
            &registration.executable_path,
            &registration.install_location,
            MAIN_EXECUTABLE,
        )
    {
        return Err(RunnerError::ManifestMismatch);
    }
    #[cfg(windows)]
    {
        std::process::Command::new(&registration.executable_path).spawn()?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = registration;
        Err(RunnerError::UnsupportedPlatform)
    }
}

pub fn apply(request: &ApplyRequest) -> Result<OperationResult, RunnerError> {
    let registration = read_registration()?;
    let manifest = read_manifest(&registration.install_location)?;
    validate_apply_request(request, &registration, &manifest)?;
    verify_installer_sha256(&request.installer, &request.sha256)?;
    #[cfg(windows)]
    return apply_windows(request, registration, manifest);
    #[cfg(not(windows))]
    {
        let _ = (request, registration, manifest);
        Err(RunnerError::UnsupportedPlatform)
    }
}

fn is_version(value: &str) -> bool {
    let pieces: Vec<_> = value.split('.').collect();
    (pieces.len() == 3 || pieces.len() == 4)
        && pieces
            .iter()
            .all(|piece| !piece.is_empty() && piece.parse::<u32>().is_ok())
}
fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.as_bytes().iter().all(u8::is_ascii_hexdigit)
}
fn is_file_name(value: &str) -> bool {
    !value.is_empty() && !value.contains(['\\', '/', ':']) && value != "." && value != ".."
}
fn normalize_windows_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}
fn is_absolute_windows_path(path: &str) -> bool {
    (path.len() >= 3 && path.as_bytes()[1] == b':' && path.as_bytes()[2] == b'\\')
        || path.starts_with("\\\\")
}
fn same_windows_path(left: &Path, right: &Path) -> bool {
    normalize_windows_path(left) == normalize_windows_path(right)
}
fn is_child_path(path: &Path, parent: &Path, file_name: &str) -> bool {
    normalize_windows_path(path)
        == format!(
            "{}\\{}",
            normalize_windows_path(parent),
            file_name.to_ascii_lowercase()
        )
}

#[cfg(windows)]
fn read_registration() -> Result<Registration, RunnerError> {
    use winreg::{
        RegKey,
        enums::{
            HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
        },
    };
    let path = format!("Software\\Honsen Program\\Apps\\{APP_ID}");
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let root = RegKey::predef(hive);
            let Ok(key) = root.open_subkey_with_flags(&path, KEY_READ | view) else {
                continue;
            };
            let read = |name| {
                key.get_value::<String, _>(name)
                    .map_err(|_| RunnerError::RegistrationMissing)
            };
            let registration = Registration {
                app_id: read("AppId")?,
                version: read("Version")?,
                install_location: PathBuf::from(read("InstallLocation")?),
                executable_path: PathBuf::from(read("ExecutablePath")?),
                runner_path: PathBuf::from(read("UpdateRunnerPath")?),
            };
            if registration.app_id == APP_ID {
                return Ok(registration);
            }
        }
    }
    Err(RunnerError::RegistrationMissing)
}
#[cfg(not(windows))]
fn read_registration() -> Result<Registration, RunnerError> {
    Err(RunnerError::UnsupportedPlatform)
}

#[cfg(windows)]
fn apply_windows(
    request: &ApplyRequest,
    registration: Registration,
    manifest: Manifest,
) -> Result<OperationResult, RunnerError> {
    wait_for_registered_process(request.wait_pid, &registration.executable_path)?;
    let log_path =
        std::env::temp_dir().join(format!("honsen-procure-{}.log", request.operation_id));
    let exit = std::process::Command::new(&request.installer)
        .args([
            "/VERYSILENT",
            "/SUPPRESSMSGBOXES",
            "/NORESTART",
            "/SP-",
            &format!("/DIR=\"{}\"", registration.install_location.display()),
            &format!("/LOG=\"{}\"", log_path.display()),
        ])
        .status()?
        .code()
        .unwrap_or(-1);
    if exit != 0 {
        return Err(RunnerError::InstallerExit(exit));
    }
    let updated = read_registration()?;
    let updated_manifest = read_manifest(&updated.install_location)?;
    if !same_windows_path(&updated.install_location, &registration.install_location)
        || updated.version != request.expected_version
        || updated_manifest.version != request.expected_version
        || !updated.executable_path.is_file()
        || !updated.runner_path.is_file()
    {
        return Err(RunnerError::ManifestMismatch);
    }
    let result = OperationResult {
        app_id: APP_ID.into(),
        operation_id: request.operation_id.clone(),
        status: "success".into(),
        source: request.source.clone(),
        from_version: manifest.version,
        to_version: request.expected_version.clone(),
        step: None,
        installer_exit_code: Some(exit),
        installer_log_path: Some(log_path.display().to_string()),
        message: "更新完成".into(),
        completed_at_utc: utc_timestamp(),
        install_location: Some(updated.install_location.display().to_string()),
        executable_path: Some(updated.executable_path.display().to_string()),
    };
    if request.restart {
        std::process::Command::new(&updated.executable_path).spawn()?;
    }
    Ok(result)
}

#[cfg(windows)]
fn wait_for_registered_process(pid: u32, expected_path: &Path) -> Result<(), RunnerError> {
    if pid == 0 {
        return Ok(());
    }
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        System::Threading::{
            OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_SYNCHRONIZE, PROCESS_TERMINATE, QueryFullProcessImageNameW, TerminateProcess,
            WaitForSingleObject,
        },
    };
    unsafe {
        let handle = OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE | PROCESS_TERMINATE,
            0,
            pid,
        );
        if handle.is_null() {
            return Err(RunnerError::WaitProcess);
        }
        let mut buffer = vec![0_u16; 32768];
        let mut length = buffer.len() as u32;
        if QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut length)
            == 0
        {
            CloseHandle(handle);
            return Err(RunnerError::WaitProcess);
        }
        let process_path = std::ffi::OsString::from_wide(&buffer[..length as usize]);
        if !same_windows_path(Path::new(&process_path), expected_path) {
            CloseHandle(handle);
            return Err(RunnerError::WaitProcess);
        }
        if WaitForSingleObject(handle, 30_000) != WAIT_OBJECT_0
            && (TerminateProcess(handle, 1) == 0
                || WaitForSingleObject(handle, 5_000) != WAIT_OBJECT_0)
        {
            CloseHandle(handle);
            return Err(RunnerError::WaitProcess);
        }
        CloseHandle(handle);
    }
    Ok(())
}
fn utc_timestamp() -> String {
    format!(
        "{}Z",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};
    fn registration() -> Registration {
        Registration {
            app_id: APP_ID.into(),
            version: "1.2.3".into(),
            install_location: PathBuf::from("C:\\Program Files\\Honsen Program\\Honsen Procure"),
            executable_path: PathBuf::from(
                "C:\\Program Files\\Honsen Program\\Honsen Procure\\HonsenProcure.exe",
            ),
            runner_path: PathBuf::from(
                "C:\\Program Files\\Honsen Program\\Honsen Procure\\HonsenUpdateRunner.exe",
            ),
        }
    }
    fn manifest() -> Manifest {
        Manifest {
            schema_version: 1,
            app_id: APP_ID.into(),
            display_name: "Honsen Procure".into(),
            version: "1.2.3".into(),
            executable: MAIN_EXECUTABLE.into(),
            update_runner: RUNNER_EXECUTABLE.into(),
            publisher: "Honsen".into(),
            update_manifest_url: "https://updates.example.invalid/releases/latest".into(),
        }
    }
    fn request() -> ApplyRequest {
        ApplyRequest {
            source: Source::Toolbox,
            app_id: APP_ID.into(),
            wait_pid: 0,
            installer: PathBuf::from("C:\\staging\\Honsen-Procure-1.2.4-Setup.exe"),
            sha256: "a".repeat(64),
            target_dir: registration().install_location,
            expected_version: "1.2.4".into(),
            restart: false,
            operation_id: "0f3b2a90-34c4-4d99-bd17-a964da43f6a6".into(),
            result_path: PathBuf::from(
                "C:\\Users\\tester\\AppData\\Local\\Honsen Program\\UpdateResults\\honsen.procure\\0f3b2a90-34c4-4d99-bd17-a964da43f6a6.json",
            ),
        }
    }
    #[test]
    fn apply_rejects_a_target_outside_the_registered_installation() {
        let mut request = request();
        request.target_dir = PathBuf::from("C:\\other");
        assert_eq!(
            validate_apply_request(&request, &registration(), &manifest()),
            Err(RunnerError::TargetDirectoryMismatch)
        );
    }
    #[test]
    fn apply_rejects_a_result_path_that_is_not_this_operation_file() {
        let mut request = request();
        request.result_path = PathBuf::from(
            "C:\\Users\\tester\\AppData\\Local\\Honsen Program\\UpdateResults\\honsen.procure\\shared.json",
        );
        assert_eq!(
            validate_apply_request(&request, &registration(), &manifest()),
            Err(RunnerError::ResultPathMismatch)
        );
    }
    #[test]
    fn apply_accepts_the_fixed_procure_identity_and_contract_shape() {
        assert_eq!(
            validate_apply_request(&request(), &registration(), &manifest()),
            Ok(())
        );
    }
    #[test]
    fn installer_checksum_rejects_tampered_bytes() {
        let path = std::env::temp_dir().join(format!("honsen-runner-{}.bin", Uuid::new_v4()));
        fs::write(&path, b"verified installer").unwrap();
        assert_eq!(
            verify_installer_sha256(&path, &"a".repeat(64)),
            Err(RunnerError::HashMismatch)
        );
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn result_is_written_as_contract_json() {
        let directory = std::env::temp_dir().join(format!("honsen-runner-{}", Uuid::new_v4()));
        let path = directory.join("result.json");
        let result = OperationResult {
            app_id: APP_ID.into(),
            operation_id: "0f3b2a90-34c4-4d99-bd17-a964da43f6a6".into(),
            status: "failed".into(),
            source: Source::App,
            from_version: "1.2.3".into(),
            to_version: "1.2.4".into(),
            step: Some("hash-validation".into()),
            installer_exit_code: None,
            installer_log_path: None,
            message: "installer checksum does not match".into(),
            completed_at_utc: "0Z".into(),
            install_location: None,
            executable_path: None,
        };
        write_result_atomically(&path, &result).unwrap();
        let written: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(written["status"], "failed");
        assert_eq!(written["step"], "hash-validation");
        fs::remove_dir_all(directory).unwrap();
    }
}
