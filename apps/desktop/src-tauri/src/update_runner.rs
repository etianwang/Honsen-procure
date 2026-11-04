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
    #[error("installed manifest does not match the Honsen Procure identity contract")]
    ManifestContractMismatch,
    #[error("installed version does not match the release version contract")]
    VersionContractMismatch,
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
    #[error("the UAC approval was cancelled")]
    UacCancelled,
    #[error("the installer did not finish before the update timeout")]
    InstallerTimeout,
    #[error("another Honsen Procure update is already in progress")]
    UpdateInProgress,
    #[error("installed executable version does not match target version")]
    FileVersionMismatch,
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
        || !is_file_name(&manifest.executable)
        || !is_file_name(&manifest.update_runner)
    {
        return Err(RunnerError::ManifestContractMismatch);
    }
    if !is_version(&manifest.version)
        || !is_version(&registration.version)
        || !is_version(&request.expected_version)
    {
        return Err(RunnerError::VersionContractMismatch);
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

// Launch has stricter identity requirements than the existing apply protocol.
// Keep its registry reader separate so this change cannot alter apply behavior.
#[derive(Clone, Debug, PartialEq, Eq)]
struct LaunchRegistration {
    registration: Registration,
    launcher_path: PathBuf,
    update_manifest_url: String,
    update_url: String,
    publisher: String,
    display_name: String,
    install_scope: String,
}

fn validate_launch_fields(
    record: &LaunchRegistration,
    manifest: &Manifest,
) -> Result<(), RunnerError> {
    use crate::update_launch::CANONICAL_UPDATE_URL;
    let r = &record.registration;
    if r.app_id != APP_ID || manifest.app_id != APP_ID {
        return Err(RunnerError::AppIdMismatch);
    }
    if manifest.schema_version != 1
        || manifest.publisher != "Honsen"
        || record.publisher != "Honsen"
        || manifest.executable != MAIN_EXECUTABLE
        || manifest.update_runner != RUNNER_EXECUTABLE
        || manifest.display_name != "Honsen Procure"
        || record.display_name != manifest.display_name
        || !matches!(record.install_scope.as_str(), "machine" | "user")
        || manifest.update_manifest_url != CANONICAL_UPDATE_URL
        || record.update_manifest_url != CANONICAL_UPDATE_URL
        || record.update_url != CANONICAL_UPDATE_URL
    {
        return Err(RunnerError::ManifestContractMismatch);
    }
    if !is_version(&r.version) || !is_version(&manifest.version) || r.version != manifest.version {
        return Err(RunnerError::VersionContractMismatch);
    }
    crate::update_launch::compare_versions(&r.version, &manifest.version)?;
    if !is_absolute_windows_path(&normalize_windows_path(&r.install_location))
        || !is_child_path(&r.executable_path, &r.install_location, MAIN_EXECUTABLE)
        || !is_child_path(&r.runner_path, &r.install_location, RUNNER_EXECUTABLE)
        || !same_windows_path(&record.launcher_path, &r.runner_path)
    {
        return Err(RunnerError::TargetDirectoryMismatch);
    }
    Ok(())
}

fn same_launch_registration(a: &LaunchRegistration, b: &LaunchRegistration) -> bool {
    a.registration.app_id == b.registration.app_id
        && a.registration.version == b.registration.version
        && same_windows_path(
            &a.registration.install_location,
            &b.registration.install_location,
        )
        && same_windows_path(
            &a.registration.executable_path,
            &b.registration.executable_path,
        )
        && same_windows_path(&a.registration.runner_path, &b.registration.runner_path)
        && same_windows_path(&a.launcher_path, &b.launcher_path)
        && a.update_manifest_url == b.update_manifest_url
        && a.update_url == b.update_url
        && a.publisher == b.publisher
        && a.display_name == b.display_name
        && a.install_scope == b.install_scope
}

fn unique_launch_registration(
    records: Vec<LaunchRegistration>,
) -> Result<LaunchRegistration, RunnerError> {
    let mut records = records.into_iter();
    let selected = records.next().ok_or(RunnerError::RegistrationMissing)?;
    if records.any(|r| !same_launch_registration(&selected, &r)) {
        return Err(RunnerError::Io(
            "conflicting application registrations".into(),
        ));
    }
    Ok(selected)
}

fn parse_launch_manifest(bytes: &[u8]) -> Result<Manifest, RunnerError> {
    if bytes.len() > 1024 * 1024 {
        return Err(RunnerError::ManifestMismatch);
    }
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    serde_json::from_slice(bytes).map_err(|_| RunnerError::ManifestMismatch)
}

#[cfg(windows)]
fn read_launch_registration() -> Result<LaunchRegistration, RunnerError> {
    use winreg::{
        RegKey,
        enums::{
            HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
        },
    };
    let mut records = Vec::new();
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let key = match RegKey::predef(hive).open_subkey_with_flags(
                format!("Software\\Honsen Program\\Apps\\{APP_ID}"),
                KEY_READ | view,
            ) {
                Ok(key) => key,
                Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
                Err(_) => return Err(RunnerError::RegistrationMissing),
            };
            let read = |name| {
                key.get_value::<String, _>(name)
                    .map_err(|_| RunnerError::RegistrationMissing)
            };
            records.push(LaunchRegistration {
                registration: Registration {
                    app_id: read("AppId")?,
                    version: read("Version")?,
                    install_location: read("InstallLocation")?.into(),
                    executable_path: read("ExecutablePath")?.into(),
                    runner_path: read("UpdateRunnerPath")?.into(),
                },
                launcher_path: read("LauncherPath")?.into(),
                update_manifest_url: read("UpdateManifestUrl")?,
                update_url: read("UpdateUrl")?,
                publisher: read("Publisher")?,
                display_name: read("DisplayName")?,
                install_scope: read("InstallScope")?,
            });
        }
    }
    unique_launch_registration(records)
}

#[cfg(windows)]
fn reject_reparse_components(path: &Path) -> Result<(), RunnerError> {
    use std::os::windows::fs::MetadataExt;
    if !path.is_absolute() {
        return Err(RunnerError::TargetDirectoryMismatch);
    }
    for ancestor in path.ancestors() {
        let metadata =
            fs::symlink_metadata(ancestor).map_err(|_| RunnerError::TargetDirectoryMismatch)?;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(RunnerError::TargetDirectoryMismatch);
        }
    }
    Ok(())
}

#[cfg(windows)]
fn verify_launch_installation() -> Result<LaunchRegistration, RunnerError> {
    let record = read_launch_registration()?;
    let r = &record.registration;
    reject_reparse_components(&r.install_location)?;
    let parent =
        fs::canonicalize(&r.install_location).map_err(|_| RunnerError::TargetDirectoryMismatch)?;
    for (path, name) in [
        (&r.executable_path, MAIN_EXECUTABLE),
        (&r.runner_path, RUNNER_EXECUTABLE),
        (&record.launcher_path, RUNNER_EXECUTABLE),
        (
            &r.install_location.join("honsen.app.json"),
            "honsen.app.json",
        ),
    ] {
        reject_reparse_components(path)?;
        let real = fs::canonicalize(path).map_err(|_| RunnerError::TargetDirectoryMismatch)?;
        if !path.is_file() || !same_windows_path(&real, &parent.join(name)) {
            return Err(RunnerError::TargetDirectoryMismatch);
        }
    }
    let manifest_path = r.install_location.join("honsen.app.json");
    let mut bytes = Vec::new();
    fs::File::open(manifest_path)?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    let manifest = parse_launch_manifest(&bytes)?;
    validate_launch_fields(&record, &manifest)?;
    verify_file_version(&r.executable_path, &r.version)?;
    let own = std::env::current_exe()?;
    reject_reparse_components(&own)?;
    if !same_windows_path(&fs::canonicalize(own)?, &fs::canonicalize(&r.runner_path)?) {
        return Err(RunnerError::TargetDirectoryMismatch);
    }
    Ok(record)
}

trait LaunchEnvironment {
    fn validate(&mut self) -> Result<LaunchRegistration, RunnerError>;
    fn skipped(&mut self) -> Result<Option<String>, RunnerError>;
    fn stable(&mut self) -> Result<crate::update_launch::StableAsset, RunnerError>;
    fn confirm_failure(&mut self) -> Result<bool, RunnerError>;
    fn warn(&mut self) -> Result<(), RunnerError>;
    fn choice(
        &mut self,
        installed: &str,
        new: &str,
    ) -> Result<crate::update_launch::UpdateChoice, RunnerError>;
    fn save_skip(&mut self, version: &str) -> Result<(), RunnerError>;
    fn spawn(&mut self, verified: &LaunchRegistration) -> Result<(), RunnerError>;
    fn install(
        &mut self,
        verified: &LaunchRegistration,
        asset: &crate::update_launch::StableAsset,
    ) -> Result<(), RunnerError>;
}

fn launch_local(
    host: &mut impl LaunchEnvironment,
    expected: &LaunchRegistration,
) -> Result<(), RunnerError> {
    let verified = host.validate()?;
    if !same_launch_registration(&verified, expected) {
        return Err(RunnerError::ManifestMismatch);
    }
    host.spawn(&verified)
}

fn orchestrate_launch(host: &mut impl LaunchEnvironment) -> Result<(), RunnerError> {
    use crate::update_launch::{UpdateChoice, compare_versions};
    let installed = host.validate()?; // Never query the network for an invalid local identity.
    let skipped = match host.skipped() {
        Ok(value) => value,
        Err(_) => {
            host.warn()?;
            None
        }
    };
    let asset = match host.stable() {
        Ok(asset) => asset,
        Err(_) => {
            return if host.confirm_failure()? {
                launch_local(host, &installed)
            } else {
                Ok(())
            };
        }
    };
    if compare_versions(&asset.version, &installed.registration.version)?
        != std::cmp::Ordering::Greater
        || skipped.as_deref() == Some(asset.version.as_str())
    {
        return launch_local(host, &installed);
    }
    match host.choice(&installed.registration.version, &asset.version)? {
        UpdateChoice::RemindLater => launch_local(host, &installed),
        UpdateChoice::SkipVersion => {
            if host.save_skip(&asset.version).is_err() {
                host.warn()?;
            }
            launch_local(host, &installed)
        }
        UpdateChoice::UpdateNow => host.install(&installed, &asset), // Apply failures never fall back to spawn.
    }
}

#[cfg(windows)]
struct WindowsLaunchEnvironment {
    source: Source,
}

#[cfg(windows)]
impl LaunchEnvironment for WindowsLaunchEnvironment {
    fn validate(&mut self) -> Result<LaunchRegistration, RunnerError> {
        verify_launch_installation()
    }
    fn skipped(&mut self) -> Result<Option<String>, RunnerError> {
        crate::update_launch::read_skipped_version()
    }
    fn stable(&mut self) -> Result<crate::update_launch::StableAsset, RunnerError> {
        crate::update_launch::parse_stable_release(
            &crate::update_launch_windows::fetch_release_metadata()?,
        )
    }
    fn confirm_failure(&mut self) -> Result<bool, RunnerError> {
        crate::update_launch_windows::confirm_local_after_failure()
    }
    fn warn(&mut self) -> Result<(), RunnerError> {
        crate::update_launch_windows::show_preferences_warning()
    }
    fn choice(
        &mut self,
        installed: &str,
        new: &str,
    ) -> Result<crate::update_launch::UpdateChoice, RunnerError> {
        crate::update_launch_windows::choose_update(installed, new)
    }
    fn save_skip(&mut self, version: &str) -> Result<(), RunnerError> {
        crate::update_launch::save_skipped_version(version)
    }
    fn spawn(&mut self, verified: &LaunchRegistration) -> Result<(), RunnerError> {
        std::process::Command::new(&verified.registration.executable_path).spawn()?;
        Ok(())
    }
    fn install(
        &mut self,
        verified: &LaunchRegistration,
        asset: &crate::update_launch::StableAsset,
    ) -> Result<(), RunnerError> {
        let download = match crate::update_launch_windows::download_installer(asset) {
            Ok(download) => download,
            Err(_) => {
                return if self.confirm_failure()? {
                    launch_local(self, verified)
                } else {
                    Ok(())
                };
            }
        };
        if verify_installer_sha256(download.path(), &asset.sha256).is_err() {
            return if self.confirm_failure()? {
                launch_local(self, verified)
            } else {
                Ok(())
            };
        }
        let current = verify_launch_installation()?;
        if !same_launch_registration(&current, verified) {
            return Err(RunnerError::ManifestMismatch);
        }
        let operation_id = Uuid::new_v4().to_string();
        let results =
            PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or(RunnerError::ResultPathMismatch)?)
                .join("Honsen Program")
                .join("UpdateResults")
                .join(APP_ID);
        // Check existing ancestors before creating our private result directory.
        for ancestor in results.ancestors() {
            if ancestor.exists() {
                reject_reparse_components(ancestor)?;
                break;
            }
        }
        fs::create_dir_all(&results)?;
        reject_reparse_components(&results)?;
        let result_path = results.join(format!("{operation_id}.json"));
        let source = match self.source {
            Source::App => "app",
            Source::Toolbox => "toolbox",
        };
        let status = std::process::Command::new(&current.registration.runner_path)
            .arg("apply")
            .args([
                "--source",
                source,
                "--app-id",
                APP_ID,
                "--wait-pid",
                "0",
                "--installer",
            ])
            .arg(download.path())
            .args(["--sha256", &asset.sha256, "--target-dir"])
            .arg(&current.registration.install_location)
            .args([
                "--expected-version",
                &asset.version,
                "--restart",
                "true",
                "--operation-id",
                &operation_id,
                "--result-path",
            ])
            .arg(&result_path)
            .status()?;
        let result: OperationResult = serde_json::from_slice(&fs::read(&result_path)?)
            .map_err(|_| RunnerError::ManifestMismatch)?;
        if !status.success()
            || result.status != "success"
            || result.operation_id != operation_id
            || result.app_id != APP_ID
            || result.source != self.source
            || result.to_version != asset.version
            || result.from_version != current.registration.version
            || result.install_location.as_ref().is_none_or(|path| {
                !same_windows_path(Path::new(path), &current.registration.install_location)
            })
            || result.executable_path.as_ref().is_none_or(|path| {
                !same_windows_path(Path::new(path), &current.registration.executable_path)
            })
        {
            return Err(RunnerError::Io(
                "update failed; inspect operation result and installer log".into(),
            ));
        }
        Ok(())
    }
}

#[cfg(windows)]
pub fn show_launch_error() {
    crate::update_launch_windows::show_launch_error();
}

pub fn launch(source: Source) -> Result<(), RunnerError> {
    #[cfg(windows)]
    {
        orchestrate_launch(&mut WindowsLaunchEnvironment { source })
    }
    #[cfg(not(windows))]
    {
        let _ = source;
        Err(RunnerError::UnsupportedPlatform)
    }
}

pub fn apply(request: &ApplyRequest) -> Result<OperationResult, RunnerError> {
    #[cfg(windows)]
    let _update_lock = acquire_update_lock()?;
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
    let verified_installer = copy_verified_installer(request)?;
    let exit = run_elevated_installer(
        &verified_installer,
        &registration.install_location,
        &log_path,
    )?;
    let _ = fs::remove_file(verified_installer);
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
    verify_file_version(&updated.executable_path, &request.expected_version)?;
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
fn copy_verified_installer(request: &ApplyRequest) -> Result<PathBuf, RunnerError> {
    let directory = std::env::temp_dir()
        .join("Honsen Program")
        .join("VerifiedInstallers")
        .join(&request.operation_id);
    fs::create_dir_all(&directory)?;
    let copy = directory.join("Honsen-Procure-verified.exe");
    fs::copy(&request.installer, &copy)?;
    verify_installer_sha256(&copy, &request.sha256)?;
    Ok(copy)
}

fn nsis_parameters(install_location: &Path) -> Result<String, RunnerError> {
    let directory = install_location
        .to_str()
        .ok_or(RunnerError::TargetDirectoryMismatch)?;
    if !is_absolute_windows_path(directory)
        || directory
            .chars()
            .any(|c| matches!(c, '\0' | '\r' | '\n' | '"'))
    {
        return Err(RunnerError::TargetDirectoryMismatch);
    }
    // NSIS consumes the unquoted remainder after its final /D= option.
    Ok(format!("/S /D={directory}"))
}

fn append_adapter_log(log_path: &Path, event: &str) -> Result<(), RunnerError> {
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;
    writeln!(
        file,
        "{} NSIS adapter (not engine log): {event}",
        utc_timestamp()
    )?;
    Ok(())
}

#[cfg(windows)]
fn run_elevated_installer(
    installer: &Path,
    install_location: &Path,
    log_path: &Path,
) -> Result<i32, RunnerError> {
    let parameters = nsis_parameters(install_location)?;
    append_adapter_log(
        log_path,
        &format!("attempt installer={installer:?} parameters={parameters:?}"),
    )?;
    let result = run_elevated_nsis(installer, &parameters);
    match &result {
        Ok(exit) => append_adapter_log(log_path, &format!("exit={exit}"))?,
        Err(error) => append_adapter_log(log_path, &format!("error={error}"))?,
    }
    result
}

#[cfg(windows)]
fn run_elevated_nsis(installer: &Path, arguments: &str) -> Result<i32, RunnerError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, ERROR_CANCELLED, GetLastError, WAIT_OBJECT_0},
        System::Threading::{GetExitCodeProcess, WaitForSingleObject},
        UI::Shell::{SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW},
    };
    let file: Vec<u16> = installer
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let verb: Vec<u16> = "runas\0".encode_utf16().collect();
    let parameters: Vec<u16> = arguments.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let mut execute = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            lpVerb: verb.as_ptr(),
            lpFile: file.as_ptr(),
            lpParameters: parameters.as_ptr(),
            nShow: 1,
            ..Default::default()
        };
        if ShellExecuteExW(&mut execute) == 0 {
            return if GetLastError() == ERROR_CANCELLED {
                Err(RunnerError::UacCancelled)
            } else {
                Err(RunnerError::Io("could not start elevated installer".into()))
            };
        }
        if execute.hProcess.is_null()
            || WaitForSingleObject(execute.hProcess, 10 * 60 * 1000) != WAIT_OBJECT_0
        {
            if !execute.hProcess.is_null() {
                CloseHandle(execute.hProcess);
            }
            return Err(RunnerError::InstallerTimeout);
        }
        let mut exit = 0;
        if GetExitCodeProcess(execute.hProcess, &mut exit) == 0 {
            CloseHandle(execute.hProcess);
            return Err(RunnerError::Io(
                "could not read elevated installer exit code".into(),
            ));
        }
        CloseHandle(execute.hProcess);
        Ok(exit as i32)
    }
}

#[cfg(windows)]
struct UpdateLock(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Drop for UpdateLock {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::System::Threading::ReleaseMutex(self.0);
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
fn acquire_update_lock() -> Result<UpdateLock, RunnerError> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError},
        System::Threading::CreateMutexW,
    };
    let name: Vec<u16> = "Global\\HonsenUpdate-honsen.procure"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 1, name.as_ptr());
        if handle.is_null() {
            return Err(RunnerError::Io("could not create update mutex".into()));
        }
        if GetLastError() == ERROR_ALREADY_EXISTS {
            CloseHandle(handle);
            return Err(RunnerError::UpdateInProgress);
        }
        Ok(UpdateLock(handle))
    }
}

#[cfg(windows)]
fn verify_file_version(path: &Path, expected: &str) -> Result<(), RunnerError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileVersionInfoSizeW, GetFileVersionInfoW, VS_FIXEDFILEINFO, VerQueryValueW,
    };
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let mut ignored = 0;
        let size = GetFileVersionInfoSizeW(wide.as_ptr(), &mut ignored);
        if size == 0 {
            return Err(RunnerError::FileVersionMismatch);
        }
        let mut buffer = vec![0_u8; size as usize];
        if GetFileVersionInfoW(wide.as_ptr(), 0, size, buffer.as_mut_ptr().cast()) == 0 {
            return Err(RunnerError::FileVersionMismatch);
        }
        let mut fixed: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut length = 0;
        if VerQueryValueW(
            buffer.as_ptr().cast(),
            [b'\\' as u16, 0].as_ptr(),
            &mut fixed,
            &mut length,
        ) == 0
            || length < std::mem::size_of::<VS_FIXEDFILEINFO>() as u32
        {
            return Err(RunnerError::FileVersionMismatch);
        }
        let fixed = &*(fixed as *const VS_FIXEDFILEINFO);
        let actual = format!(
            "{}.{}.{}.{}",
            fixed.dwFileVersionMS >> 16,
            fixed.dwFileVersionMS & 0xffff,
            fixed.dwFileVersionLS >> 16,
            fixed.dwFileVersionLS & 0xffff
        );
        if actual == expected || actual.trim_end_matches(".0") == expected {
            Ok(())
        } else {
            Err(RunnerError::FileVersionMismatch)
        }
    }
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
pub fn utc_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let days = seconds / 86_400;
    let seconds_of_day = seconds % 86_400;
    let (year, month, day) = civil_date(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        seconds_of_day / 3_600,
        (seconds_of_day % 3_600) / 60,
        seconds_of_day % 60
    )
}

fn civil_date(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    (year + i64::from(month <= 2), month, day)
}

#[cfg(test)]
mod tests {
    #[test]
    fn nsis_preserves_explicit_unicode_space_and_former_default_paths() {
        for directory in [
            r"C:\Honsen RC 测试 路径\Honsen Procure",
            r"C:\Program Files\Honsen Procure",
        ] {
            assert_eq!(
                super::nsis_parameters(std::path::Path::new(directory)).unwrap(),
                format!("/S /D={directory}")
            );
        }
        for directory in [
            "relative",
            "C:\\bad\npath",
            "C:\\bad\rpath",
            "C:\\bad\0path",
            "C:\\bad\"path",
        ] {
            assert!(super::nsis_parameters(std::path::Path::new(directory)).is_err());
        }
    }

    #[test]
    fn adapter_log_records_attempt_exit_and_error_as_adapter_events() {
        let path =
            std::env::temp_dir().join(format!("honsen-adapter-{}.log", uuid::Uuid::new_v4()));
        for event in [
            "attempt parameters=/S /D=C:\\测试 path",
            "exit=7",
            "error=the UAC approval was cancelled",
            "error=the installer did not finish before the update timeout",
        ] {
            super::append_adapter_log(&path, event).unwrap();
        }
        let log = std::fs::read_to_string(&path).unwrap();
        assert_eq!(log.lines().count(), 4);
        assert!(
            log.lines()
                .all(|line| line.contains("NSIS adapter (not engine log):"))
        );
        assert!(log.contains("exit=7"));
        assert!(log.contains("cancelled"));
        assert!(log.contains("timeout"));
        std::fs::remove_file(path).unwrap();
    }
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
    #[test]
    fn launch_manifest_accepts_utf8_bom_and_rejects_bad_or_oversized_json() {
        let original = manifest();
        let bytes = serde_json::to_vec(&original).unwrap();
        assert_eq!(parse_launch_manifest(&bytes).unwrap(), original);
        let mut bom = vec![0xef, 0xbb, 0xbf];
        bom.extend_from_slice(&bytes);
        assert_eq!(parse_launch_manifest(&bom).unwrap(), original);
        assert!(parse_launch_manifest(b"{broken").is_err());
        assert!(parse_launch_manifest(&vec![b' '; 1024 * 1024 + 1]).is_err());
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
    fn apply_identifies_a_manifest_identity_mismatch() {
        let mut manifest = manifest();
        manifest.update_runner = "OtherRunner.exe".into();
        assert_eq!(
            validate_apply_request(&request(), &registration(), &manifest),
            Err(RunnerError::ManifestContractMismatch)
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

    #[test]
    fn completion_timestamp_is_rfc3339_utc() {
        let timestamp = utc_timestamp();
        assert!(timestamp.ends_with('Z'));
        assert_eq!(timestamp.len(), 20);
        assert_eq!(&timestamp[10..11], "T");
        assert_eq!(&timestamp[13..14], ":");
        assert_eq!(&timestamp[16..17], ":");
    }

    #[cfg(windows)]
    #[test]
    fn global_lock_blocks_another_process() {
        use std::{
            process::{Command, Stdio},
            time::Duration,
        };
        if std::env::var_os("HONSEN_RUNNER_LOCK_HELPER").is_some() {
            let _lock = acquire_update_lock().unwrap();
            std::thread::sleep(Duration::from_secs(2));
            return;
        }
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "update_runner::tests::global_lock_blocks_another_process",
                "--nocapture",
            ])
            .env("HONSEN_RUNNER_LOCK_HELPER", "1")
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let held_by_child = (0..100).any(|_| match acquire_update_lock() {
            Err(RunnerError::UpdateInProgress) => true,
            Ok(lock) => {
                drop(lock);
                std::thread::sleep(Duration::from_millis(20));
                false
            }
            Err(error) => panic!("unexpected mutex error: {error}"),
        });
        assert!(
            held_by_child,
            "the helper process never acquired the global lock"
        );
        assert!(child.wait().unwrap().success());
    }
}

#[cfg(test)]
mod launch_tests {
    use super::*;
    use crate::update_launch::{CANONICAL_UPDATE_URL, StableAsset, UpdateChoice};
    fn record() -> LaunchRegistration {
        LaunchRegistration {
            registration: Registration {
                app_id: APP_ID.into(),
                version: "1.2.3".into(),
                install_location: r"C:\Honsen Program\Honsen Procure".into(),
                executable_path: r"C:\Honsen Program\Honsen Procure\HonsenProcure.exe".into(),
                runner_path: r"C:\Honsen Program\Honsen Procure\HonsenUpdateRunner.exe".into(),
            },
            launcher_path: r"C:\Honsen Program\Honsen Procure\HonsenUpdateRunner.exe".into(),
            update_manifest_url: CANONICAL_UPDATE_URL.into(),
            update_url: CANONICAL_UPDATE_URL.into(),
            publisher: "Honsen".into(),
            display_name: "Honsen Procure".into(),
            install_scope: "machine".into(),
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
            update_manifest_url: CANONICAL_UPDATE_URL.into(),
        }
    }
    #[test]
    fn launch_identity_fields_reject_foreign_old_and_conflicting_records() {
        let good = record();
        let m = manifest();
        assert!(validate_launch_fields(&good, &m).is_ok());
        for field in 0..8 {
            let mut r = good.clone();
            let mut m = m.clone();
            match field {
                0 => r.launcher_path = r"C:\outside\HonsenUpdateRunner.exe".into(),
                1 => r.update_url = "https://example.invalid/old".into(),
                2 => r.update_manifest_url = "https://example.invalid/old".into(),
                3 => m.version = "1.2.4".into(),
                4 => m.schema_version = 2,
                5 => m.publisher = "foreign".into(),
                6 => r.registration.executable_path = r"C:\outside\HonsenProcure.exe".into(),
                _ => m.update_manifest_url = "https://example.invalid/old".into(),
            }
            assert!(validate_launch_fields(&r, &m).is_err(), "field {field}");
        }
        assert!(unique_launch_registration(vec![good.clone(), good.clone()]).is_ok());
        let mut foreign = good.clone();
        foreign.registration.version = "1.2.4".into();
        assert!(unique_launch_registration(vec![good, foreign]).is_err());
        assert!(unique_launch_registration(vec![]).is_err());
    }
    struct Fake {
        calls: Vec<&'static str>,
        valid: bool,
        revalidate: bool,
        changed_identity: bool,
        network: bool,
        confirm: bool,
        choice: UpdateChoice,
        skip: Option<String>,
        read_skip_ok: bool,
        warn_ok: bool,
        new_version: String,
        save_ok: bool,
        install_ok: bool,
    }
    impl Fake {
        fn new() -> Self {
            Self {
                calls: vec![],
                valid: true,
                revalidate: true,
                changed_identity: false,
                network: true,
                confirm: false,
                choice: UpdateChoice::RemindLater,
                skip: None,
                read_skip_ok: true,
                warn_ok: true,
                new_version: "2.0.0".into(),
                save_ok: true,
                install_ok: true,
            }
        }
    }
    impl LaunchEnvironment for Fake {
        fn validate(&mut self) -> Result<LaunchRegistration, RunnerError> {
            let repeated = self.calls.contains(&"validate");
            self.calls.push("validate");
            if self.valid && (!repeated || self.revalidate) {
                let mut value = record();
                if repeated && self.changed_identity {
                    value.registration.version = "1.2.4".into();
                }
                Ok(value)
            } else {
                Err(RunnerError::ManifestMismatch)
            }
        }
        fn skipped(&mut self) -> Result<Option<String>, RunnerError> {
            self.calls.push("read_skip");
            if self.read_skip_ok {
                Ok(self.skip.clone())
            } else {
                Err(RunnerError::Io("preference unavailable".into()))
            }
        }
        fn stable(&mut self) -> Result<StableAsset, RunnerError> {
            self.calls.push("network");
            if self.network {
                Ok(StableAsset {
                    version: self.new_version.clone(),
                    name: format!("Honsen-Procure-{}-Setup.exe", self.new_version),
                    url: format!(
                        "https://github.com/etianwang/Honsen-procure/releases/download/v{0}/Honsen-Procure-{0}-Setup.exe",
                        self.new_version
                    ),
                    sha256: "a".repeat(64),
                    size: 10,
                })
            } else {
                Err(RunnerError::Io("source unavailable".into()))
            }
        }
        fn confirm_failure(&mut self) -> Result<bool, RunnerError> {
            self.calls.push("confirm");
            Ok(self.confirm)
        }
        fn warn(&mut self) -> Result<(), RunnerError> {
            self.calls.push("warn");
            if self.warn_ok {
                Ok(())
            } else {
                Err(RunnerError::Io("dialog unavailable".into()))
            }
        }
        fn choice(&mut self, _: &str, _: &str) -> Result<UpdateChoice, RunnerError> {
            self.calls.push("choice");
            Ok(std::mem::replace(
                &mut self.choice,
                UpdateChoice::RemindLater,
            ))
        }
        fn save_skip(&mut self, _: &str) -> Result<(), RunnerError> {
            self.calls.push("save_skip");
            if self.save_ok {
                Ok(())
            } else {
                Err(RunnerError::Io("preference failed".into()))
            }
        }
        fn spawn(&mut self, _: &LaunchRegistration) -> Result<(), RunnerError> {
            self.calls.push("spawn");
            Ok(())
        }
        fn install(&mut self, _: &LaunchRegistration, _: &StableAsset) -> Result<(), RunnerError> {
            self.calls.push("install");
            if self.install_ok {
                Ok(())
            } else {
                Err(RunnerError::InstallerExit(1))
            }
        }
    }
    #[test]
    fn launch_policy_never_networks_invalid_identity_and_revalidates_local_spawn() {
        let mut f = Fake::new();
        f.valid = false;
        assert!(orchestrate_launch(&mut f).is_err());
        assert_eq!(f.calls, vec!["validate"]);
        let mut f = Fake::new();
        f.revalidate = false;
        assert!(orchestrate_launch(&mut f).is_err());
        assert!(!f.calls.contains(&"spawn"));
        let mut f = Fake::new();
        f.changed_identity = true;
        assert!(orchestrate_launch(&mut f).is_err());
        assert!(!f.calls.contains(&"spawn"));
        let mut f = Fake::new();
        orchestrate_launch(&mut f).unwrap();
        assert_eq!(f.calls.last(), Some(&"spawn"));
        assert_eq!(f.calls.iter().filter(|x| **x == "validate").count(), 2);
    }
    #[test]
    fn launch_source_failure_requires_explicit_confirm_and_fresh_identity() {
        let mut f = Fake::new();
        f.network = false;
        orchestrate_launch(&mut f).unwrap();
        assert!(f.calls.contains(&"confirm"));
        assert!(!f.calls.contains(&"spawn"));
        let mut f = Fake::new();
        f.network = false;
        f.confirm = true;
        orchestrate_launch(&mut f).unwrap();
        assert_eq!(f.calls.last(), Some(&"spawn"));
        let mut f = Fake::new();
        f.network = false;
        f.confirm = true;
        f.revalidate = false;
        assert!(orchestrate_launch(&mut f).is_err());
        assert!(!f.calls.contains(&"spawn"));
    }
    #[test]
    fn launch_skip_and_apply_failure_do_not_silently_change_policy() {
        let mut f = Fake::new();
        f.skip = Some("2.0.0".into());
        orchestrate_launch(&mut f).unwrap();
        assert!(!f.calls.contains(&"choice"));
        assert!(f.calls.contains(&"spawn"));
        let mut f = Fake::new();
        f.choice = UpdateChoice::SkipVersion;
        f.save_ok = false;
        orchestrate_launch(&mut f).unwrap();
        assert!(f.calls.contains(&"warn"));
        assert!(f.calls.contains(&"spawn"));
        let mut f = Fake::new();
        f.choice = UpdateChoice::UpdateNow;
        f.install_ok = false;
        assert!(orchestrate_launch(&mut f).is_err());
        assert!(!f.calls.contains(&"spawn"));
        assert!(!f.calls.contains(&"confirm"));
    }

    #[test]
    fn launch_no_update_or_older_skip_and_broken_preferences_preserve_safe_behavior() {
        for version in ["1.2.3", "1.2.2"] {
            let mut f = Fake::new();
            f.new_version = version.into();
            orchestrate_launch(&mut f).unwrap();
            assert!(f.calls.contains(&"spawn"));
            assert!(!f.calls.contains(&"choice"));
            assert!(!f.calls.contains(&"install"));
        }
        let mut f = Fake::new();
        f.skip = Some("1.9.0".into());
        orchestrate_launch(&mut f).unwrap();
        assert!(f.calls.contains(&"choice"));
        let mut f = Fake::new();
        f.read_skip_ok = false;
        orchestrate_launch(&mut f).unwrap();
        assert!(f.calls.contains(&"warn"));
        assert!(f.calls.contains(&"network"));
        assert!(f.calls.contains(&"choice"));
        assert!(!f.calls.contains(&"save_skip"));
        let mut f = Fake::new();
        f.read_skip_ok = false;
        f.warn_ok = false;
        assert!(orchestrate_launch(&mut f).is_err());
        assert!(!f.calls.contains(&"network"));
        assert!(!f.calls.contains(&"spawn"));
    }
}
