#![cfg(target_os = "macos")]

#[test]
#[ignore = "writes only a unique synthetic credential to the current user's Keychain"]
fn native_keychain_survives_entry_recreation() {
    let service = format!("africa.honsen.procure.qa.{}", uuid::Uuid::new_v4());
    let account = "synthetic-macos-package-check";
    let first = keyring::Entry::new(&service, account).unwrap();
    first
        .set_password("synthetic-not-an-account-password")
        .unwrap();
    let second = keyring::Entry::new(&service, account).unwrap();
    let readback = second.get_password();
    let cleanup = second.delete_credential();
    assert_eq!(readback.unwrap(), "synthetic-not-an-account-password");
    cleanup.unwrap();
    assert!(matches!(first.get_password(), Err(keyring::Error::NoEntry)));
}
