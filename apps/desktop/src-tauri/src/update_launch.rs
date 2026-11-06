use crate::update_runner::RunnerError;
use serde::Deserialize;
use std::cmp::Ordering;

pub const CANONICAL_UPDATE_URL: &str =
    "https://api.github.com/repos/etianwang/Honsen-procure/releases/latest";
const MAX_METADATA_BYTES: usize = 1024 * 1024;
const MAX_INSTALLER_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StableAsset {
    pub version: String,
    pub name: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpdateChoice {
    UpdateNow,
    RemindLater,
    SkipVersion,
}

fn invalid_metadata() -> RunnerError {
    RunnerError::Io("invalid stable release metadata".into())
}

fn version_parts(version: &str) -> Result<[u32; 4], RunnerError> {
    if version.len() > 64 {
        return Err(RunnerError::VersionContractMismatch);
    }
    let pieces: Vec<_> = version.split('.').collect();
    if !matches!(pieces.len(), 3 | 4) {
        return Err(RunnerError::VersionContractMismatch);
    }
    let mut result = [0; 4];
    for (index, piece) in pieces.iter().enumerate() {
        if piece.is_empty() || !piece.bytes().all(|b| b.is_ascii_digit()) {
            return Err(RunnerError::VersionContractMismatch);
        }
        result[index] = piece
            .parse()
            .map_err(|_| RunnerError::VersionContractMismatch)?;
    }
    Ok(result)
}

pub fn compare_versions(a: &str, b: &str) -> Result<Ordering, RunnerError> {
    Ok(version_parts(a)?.cmp(&version_parts(b)?))
}

// Typed fields reject duplicate security-relevant keys while allowing normal
// unrelated GitHub API fields. No untrusted metadata is included in an error.
#[derive(Deserialize)]
struct Release {
    draft: bool,
    prerelease: bool,
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: Option<String>,
    digest: Option<String>,
    size: Option<u64>,
}

pub fn parse_stable_release(bytes: &[u8]) -> Result<StableAsset, RunnerError> {
    if bytes.is_empty() || bytes.len() > MAX_METADATA_BYTES {
        return Err(invalid_metadata());
    }
    let release: Release = serde_json::from_slice(bytes).map_err(|_| invalid_metadata())?;
    if release.draft || release.prerelease || release.assets.len() > 256 {
        return Err(invalid_metadata());
    }
    let version = release
        .tag_name
        .strip_prefix('v')
        .ok_or_else(invalid_metadata)?;
    version_parts(version).map_err(|_| invalid_metadata())?;
    let expected_name = format!("Honsen-Procure-{version}-Setup.exe");
    let installers: Vec<_> = release
        .assets
        .iter()
        .filter(|asset| asset.name.to_ascii_lowercase().ends_with("setup.exe"))
        .collect();
    if installers.len() != 1 || installers[0].name != expected_name {
        return Err(invalid_metadata());
    }
    let asset = installers[0];
    let expected_url = format!(
        "https://github.com/etianwang/Honsen-procure/releases/download/{}/{expected_name}",
        release.tag_name
    );
    if asset.browser_download_url.as_deref() != Some(expected_url.as_str()) {
        return Err(invalid_metadata());
    }
    let digest = asset
        .digest
        .as_deref()
        .and_then(|value| value.strip_prefix("sha256:"))
        .filter(|value| {
            value.len() == 64
                && value
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
        .ok_or_else(invalid_metadata)?;
    let size = asset
        .size
        .filter(|size| *size > 0 && *size <= MAX_INSTALLER_BYTES)
        .ok_or_else(invalid_metadata)?;
    Ok(StableAsset {
        version: version.to_owned(),
        name: expected_name,
        url: expected_url,
        sha256: digest.to_owned(),
        size,
    })
}

pub fn read_skipped_version() -> Result<Option<String>, RunnerError> {
    #[cfg(windows)]
    {
        preferences::read_at(&preferences::local_app_data()?)
    }
    #[cfg(not(windows))]
    Err(RunnerError::UnsupportedPlatform)
}

pub fn save_skipped_version(version: &str) -> Result<(), RunnerError> {
    version_parts(version)?;
    #[cfg(windows)]
    {
        preferences::save_at(&preferences::local_app_data()?, version)
    }
    #[cfg(not(windows))]
    Err(RunnerError::UnsupportedPlatform)
}

#[cfg(windows)]
mod preferences {
    use super::*;
    use serde::Serialize;
    use std::{
        fs::{self, File, OpenOptions},
        io::{Read, Write},
        os::windows::{ffi::OsStrExt, fs::MetadataExt, fs::OpenOptionsExt},
        path::{Component, Path, PathBuf},
    };
    use uuid::Uuid;
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
        FILE_SHARE_READ, FILE_SHARE_WRITE, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        MoveFileExW,
    };

    fn unavailable() -> RunnerError {
        RunnerError::Io("update preferences unavailable or unsafe".into())
    }

    pub(super) fn local_app_data() -> Result<PathBuf, RunnerError> {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .ok_or_else(unavailable)
    }

    #[derive(Deserialize, Serialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Preference {
        schema_version: u8,
        skipped_version: String,
    }

    struct GuardedPath {
        path: PathBuf,
        // No FILE_SHARE_DELETE: keep all ancestors pinned until the operation
        // completes, closing the check-then-swap reparse/rename window.
        _directory_handles: Vec<File>,
    }

    fn guarded_path(base: &Path, create: bool) -> Result<Option<GuardedPath>, RunnerError> {
        if !base.is_absolute()
            || base
                .components()
                .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
        {
            return Err(unavailable());
        }
        let mut paths: Vec<_> = base.ancestors().map(Path::to_path_buf).collect();
        paths.reverse();
        paths.push(base.join("Honsen Program"));
        paths.push(base.join("Honsen Program/UpdatePreferences"));
        let mut handles = Vec::new();
        for (index, path) in paths.iter().enumerate() {
            match fs::symlink_metadata(path) {
                Ok(metadata) => {
                    if !metadata.is_dir()
                        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
                    {
                        return Err(unavailable());
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    if !create {
                        return Ok(None);
                    }
                    if index < paths.len() - 2 {
                        return Err(unavailable());
                    }
                    match fs::create_dir(path) {
                        Ok(()) => (),
                        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
                        Err(_) => return Err(unavailable()),
                    }
                }
                Err(_) => return Err(unavailable()),
            }
            let handle = OpenOptions::new()
                .read(true)
                .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
                .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
                .open(path)
                .map_err(|_| unavailable())?;
            let metadata = handle.metadata().map_err(|_| unavailable())?;
            if !metadata.is_dir() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
            {
                return Err(unavailable());
            }
            handles.push(handle);
        }
        Ok(Some(GuardedPath {
            path: base.join("Honsen Program/UpdatePreferences/honsen.procure.json"),
            _directory_handles: handles,
        }))
    }

    fn check_leaf(path: &Path) -> Result<bool, RunnerError> {
        match fs::symlink_metadata(path) {
            Ok(metadata)
                if metadata.is_file()
                    && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0 =>
            {
                Ok(true)
            }
            Ok(_) => Err(unavailable()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(_) => Err(unavailable()),
        }
    }

    pub(super) fn read_at(base: &Path) -> Result<Option<String>, RunnerError> {
        let Some(guard) = guarded_path(base, false)? else {
            return Ok(None);
        };
        if !check_leaf(&guard.path)? {
            return Ok(None);
        }
        let mut file = OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&guard.path)
            .map_err(|_| unavailable())?;
        let metadata = file.metadata().map_err(|_| unavailable())?;
        if !metadata.is_file() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(unavailable());
        }
        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take(4097)
            .read_to_end(&mut bytes)
            .map_err(|_| unavailable())?;
        if bytes.len() > 4096 {
            return Err(unavailable());
        }
        let preference: Preference = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
        if preference.schema_version != 1 {
            return Err(unavailable());
        }
        version_parts(&preference.skipped_version).map_err(|_| unavailable())?;
        Ok(Some(preference.skipped_version))
    }

    pub(super) fn save_at(base: &Path, version: &str) -> Result<(), RunnerError> {
        version_parts(version)?;
        let guard = guarded_path(base, true)?.ok_or_else(unavailable)?;
        check_leaf(&guard.path)?;
        let temporary = guard
            .path
            .with_file_name(format!(".honsen.procure.{}.tmp", Uuid::new_v4()));
        let bytes = serde_json::to_vec(&Preference {
            schema_version: 1,
            skipped_version: version.into(),
        })
        .map_err(|_| unavailable())?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .share_mode(0)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&temporary)
            .map_err(|_| unavailable())?;
        let result = (|| {
            file.write_all(&bytes).map_err(|_| unavailable())?;
            file.sync_all().map_err(|_| unavailable())?;
            drop(file);
            check_leaf(&guard.path)?;
            let source: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
            let target: Vec<u16> = guard
                .path
                .as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect();
            if unsafe {
                MoveFileExW(
                    source.as_ptr(),
                    target.as_ptr(),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                )
            } == 0
            {
                return Err(unavailable());
            }
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        struct Isolated(PathBuf);
        impl Isolated {
            fn new() -> Self {
                let workspace = Path::new(env!("CARGO_MANIFEST_DIR"))
                    .ancestors()
                    .nth(3)
                    .unwrap();
                let root = workspace.join(".cache/update-launch-tests");
                fs::create_dir_all(&root).unwrap();
                let path = root.join(Uuid::new_v4().to_string());
                fs::create_dir(&path).unwrap();
                Self(fs::canonicalize(path).unwrap())
            }
            fn preference(&self) -> PathBuf {
                self.0
                    .join("Honsen Program/UpdatePreferences/honsen.procure.json")
            }
        }
        impl Drop for Isolated {
            fn drop(&mut self) {
                let root = Path::new(env!("CARGO_MANIFEST_DIR"))
                    .ancestors()
                    .nth(3)
                    .unwrap()
                    .join(".cache/update-launch-tests");
                if self.0.starts_with(fs::canonicalize(root).unwrap()) {
                    let _ = fs::remove_dir_all(&self.0);
                }
            }
        }

        #[test]
        fn private_preferences_missing_atomic_replace_and_invalid_data() {
            let fixture = Isolated::new();
            assert_eq!(read_at(&fixture.0).unwrap(), None);
            assert!(!fixture.0.join("Honsen Program").exists());
            save_at(&fixture.0, "1.2.3").unwrap();
            assert_eq!(read_at(&fixture.0).unwrap().as_deref(), Some("1.2.3"));
            save_at(&fixture.0, "1.2.4.1").unwrap();
            assert_eq!(read_at(&fixture.0).unwrap().as_deref(), Some("1.2.4.1"));
            assert_eq!(
                fs::read_dir(fixture.preference().parent().unwrap())
                    .unwrap()
                    .count(),
                1
            );
            let previous = fs::read(fixture.preference()).unwrap();
            assert!(save_at(&fixture.0, "v2.0.0").is_err());
            assert_eq!(fs::read(fixture.preference()).unwrap(), previous);
            for bytes in [
                b"{".as_slice(),
                br#"{"schemaVersion":2,"skippedVersion":"1.2.3"}"#,
                br#"{"schemaVersion":1,"skippedVersion":"1.2.3","url":"bad"}"#,
                br#"{"schemaVersion":1,"skippedVersion":"1.2.3","skippedVersion":"2.0.0"}"#,
            ] {
                fs::write(fixture.preference(), bytes).unwrap();
                assert!(read_at(&fixture.0).is_err());
            }
            fs::write(fixture.preference(), vec![b' '; 4097]).unwrap();
            assert!(read_at(&fixture.0).is_err());
        }

        #[test]
        fn private_preferences_reject_directory_and_leaf_symlinks() {
            let fixture = Isolated::new();
            let outside = Isolated::new();
            std::os::windows::fs::symlink_dir(&outside.0, fixture.0.join("Honsen Program"))
                .unwrap();
            assert!(save_at(&fixture.0, "1.2.3").is_err());
            assert!(read_at(&fixture.0).is_err());
            assert!(!outside.0.join("UpdatePreferences").exists());
            fs::remove_dir(fixture.0.join("Honsen Program")).unwrap();
            save_at(&fixture.0, "1.2.3").unwrap();
            fs::remove_file(fixture.preference()).unwrap();
            let sentinel = outside.0.join("sentinel.json");
            fs::write(&sentinel, "unchanged").unwrap();
            std::os::windows::fs::symlink_file(&sentinel, fixture.preference()).unwrap();
            assert!(save_at(&fixture.0, "1.2.4").is_err());
            assert!(read_at(&fixture.0).is_err());
            assert_eq!(fs::read_to_string(sentinel).unwrap(), "unchanged");
        }

        #[test]
        fn private_preferences_write_failure_preserves_previous_and_pins_parents() {
            let fixture = Isolated::new();
            save_at(&fixture.0, "1.2.3").unwrap();
            let previous = fs::read(fixture.preference()).unwrap();
            let mut permission = fs::metadata(fixture.preference()).unwrap().permissions();
            permission.set_readonly(true);
            fs::set_permissions(fixture.preference(), permission).unwrap();
            assert!(save_at(&fixture.0, "1.2.4").is_err());
            assert_eq!(fs::read(fixture.preference()).unwrap(), previous);
            let mut permission = fs::metadata(fixture.preference()).unwrap().permissions();
            permission.set_readonly(false);
            fs::set_permissions(fixture.preference(), permission).unwrap();
            assert_eq!(
                fs::read_dir(fixture.preference().parent().unwrap())
                    .unwrap()
                    .count(),
                1
            );
            let locked = guarded_path(&fixture.0, false).unwrap().unwrap();
            let parent = fixture.0.join("Honsen Program");
            let moved = fixture.0.join("renamed");
            assert!(fs::rename(&parent, &moved).is_err());
            drop(locked);
            // Windows scanners may briefly retain a directory handle after our
            // guard closes. The held-lock denial above remains immediate; only
            // the post-release success allows a bounded sharing retry.
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
            loop {
                match fs::rename(&parent, &moved) {
                    Ok(()) => break,
                    Err(error)
                        if matches!(error.raw_os_error(), Some(5 | 32))
                            && std::time::Instant::now() < deadline =>
                    {
                        std::thread::sleep(std::time::Duration::from_millis(20));
                    }
                    Err(error) => panic!("post-release directory rename failed: {error}"),
                }
            }
            fs::rename(&moved, &parent).unwrap();
            assert_eq!(read_at(&fixture.0).unwrap().as_deref(), Some("1.2.3"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn release() -> serde_json::Value {
        json!({"draft":false,"prerelease":false,"tag_name":"v1.2.10","assets":[{"name":"Honsen-Procure-1.2.10-Setup.exe","browser_download_url":"https://github.com/etianwang/Honsen-procure/releases/download/v1.2.10/Honsen-Procure-1.2.10-Setup.exe","digest":format!("sha256:{}", "a".repeat(64)),"size":1024}]})
    }

    #[test]
    fn stable_release_exact_asset_and_numeric_versions() {
        let parsed = parse_stable_release(&serde_json::to_vec(&release()).unwrap()).unwrap();
        assert_eq!(parsed.version, "1.2.10");
        assert_eq!(parsed.sha256, "a".repeat(64));
        assert_eq!(
            compare_versions("1.2.10", "1.2.9").unwrap(),
            Ordering::Greater
        );
        assert_eq!(
            compare_versions("1.2.3", "1.2.3.0").unwrap(),
            Ordering::Equal
        );
        assert_eq!(
            compare_versions("1.2.3.1", "1.2.3").unwrap(),
            Ordering::Greater
        );
        for invalid in [
            "",
            "v1.2.3",
            "1.2",
            "1.2.3.4.5",
            "1.2.+3",
            "1.2.3-beta",
            "1. 2.3",
            "1.2.4294967296",
        ] {
            assert!(compare_versions(invalid, "1.0.0").is_err());
        }
        let mut auxiliary = release();
        auxiliary["assets"]
            .as_array_mut()
            .unwrap()
            .push(json!({"name":"HonsenUpdateRunner.exe"}));
        assert!(parse_stable_release(&serde_json::to_vec(&auxiliary).unwrap()).is_ok());
    }

    #[test]
    fn stable_release_rejects_untrusted_metadata_without_reflection() {
        let original = release();
        for (field, value) in [
            ("draft", json!(true)),
            ("prerelease", json!(true)),
            ("tag_name", json!("v1.2.10-untrusted")),
            ("tag_name", json!("1.2.10")),
        ] {
            let mut bad = original.clone();
            bad[field] = value;
            assert!(parse_stable_release(&serde_json::to_vec(&bad).unwrap()).is_err());
        }
        for (field, value) in [
            ("name", json!("Other-1.2.10-Setup.exe")),
            (
                "browser_download_url",
                json!("https://evil.example/untrusted"),
            ),
            (
                "browser_download_url",
                json!(
                    "https://github.com/etianwang/Honsen-procure/releases/download/v1.2.10/Honsen-Procure-1.2.10-Setup.exe?token=untrusted"
                ),
            ),
            ("digest", json!("sha256:UNTRUSTED")),
            ("digest", json!(null)),
            ("size", json!(0)),
            ("size", json!(MAX_INSTALLER_BYTES + 1)),
        ] {
            let mut bad = original.clone();
            bad["assets"][0][field] = value;
            let error = parse_stable_release(&serde_json::to_vec(&bad).unwrap()).unwrap_err();
            assert!(!error.to_string().contains("untrusted"));
        }
        let mut duplicate = original.clone();
        duplicate["assets"]
            .as_array_mut()
            .unwrap()
            .push(original["assets"][0].clone());
        assert!(parse_stable_release(&serde_json::to_vec(&duplicate).unwrap()).is_err());
        assert!(parse_stable_release(br#"{"draft":false,"draft":true,"prerelease":false,"tag_name":"v1.2.3","assets":[]}"#).is_err());
        assert!(parse_stable_release(&vec![b' '; MAX_METADATA_BYTES + 1]).is_err());
    }
}
