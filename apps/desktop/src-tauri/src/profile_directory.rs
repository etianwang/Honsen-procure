use std::{env, path::PathBuf};

pub fn database_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    let (variable, components) = (
        "HOME",
        &[
            "Library",
            "Application Support",
            "africa.honsen.procure",
            "honsen.procure.sqlite",
        ][..],
    );
    #[cfg(not(target_os = "macos"))]
    let (variable, components) = (
        "LOCALAPPDATA",
        &["Honsen Program", "honsen.procure", "honsen.procure.sqlite"][..],
    );
    resolve(env::var_os(variable).map(PathBuf::from), components)
        .ok_or_else(|| format!("{variable} must be an absolute directory"))
}

fn resolve(root: Option<PathBuf>, components: &[&str]) -> Option<PathBuf> {
    let mut path = root.filter(|path| path.is_absolute())?;
    path.extend(components);
    Some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_relative_root_never_falls_back_to_working_directory() {
        assert_eq!(resolve(None, &["database.sqlite"]), None);
        assert_eq!(resolve(Some(PathBuf::new()), &["database.sqlite"]), None);
        assert_eq!(resolve(Some("relative".into()), &["database.sqlite"]), None);
    }

    #[test]
    fn preserves_unicode_and_spaces_without_changing_the_root() {
        let root = env::temp_dir().join("Honsen 用户");
        assert_eq!(
            resolve(
                Some(root.clone()),
                &["Application Support", "database.sqlite"]
            ),
            Some(root.join("Application Support").join("database.sqlite"))
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_uses_application_support_and_native_keychain() {
        assert_eq!(
            database_path().unwrap(),
            PathBuf::from(env::var_os("HOME").unwrap())
                .join("Library/Application Support/africa.honsen.procure/honsen.procure.sqlite")
        );
        // This type is available only when the actual Apple backend is enabled.
        let _builder = keyring::macos::default_credential_builder();
    }
}
