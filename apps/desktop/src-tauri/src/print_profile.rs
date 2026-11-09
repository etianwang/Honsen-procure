use super::*;

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PrintProfile {
    schema_version: u32,
    profile_version: String,
    legal_name_zh: String,
    logo: Logo,
}
#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Logo {
    asset_id: String,
    sha256: String,
    mime_type: String,
}
impl PrintProfile {
    pub(crate) fn validate(&self) -> Result<(), AuthError> {
        let approved: Self = serde_json::from_str(include_str!(
            "../../../../config/print-company-profile.json"
        ))
        .map_err(|_| AuthError::InvalidInput)?;
        if self != &approved
            || self.schema_version != 1
            || self.logo.sha256.len() != 64
            || !self
                .logo
                .sha256
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(AuthError::InvalidInput);
        }
        Ok(())
    }
}
pub(crate) fn approved_profile_json() -> Result<String, AuthError> {
    let profile: PrintProfile = serde_json::from_str(include_str!(
        "../../../../config/print-company-profile.json"
    ))
    .map_err(|_| AuthError::InvalidInput)?;
    profile.validate()?;
    serde_json::to_string(&profile).map_err(|_| AuthError::InvalidInput)
}
pub(crate) fn validate_retained(
    retained: Option<&str>,
    incoming: Option<&PrintProfile>,
) -> Result<(), AuthError> {
    if let Some(raw) = retained {
        let old: PrintProfile = serde_json::from_str(raw).map_err(|_| AuthError::InvalidInput)?;
        if incoming != Some(&old) {
            return Err(AuthError::InvalidInput);
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn approved_profile_is_strict_and_drop_or_rewrite_is_rejected() {
        let raw = approved_profile_json().unwrap();
        let profile: PrintProfile = serde_json::from_str(&raw).unwrap();
        validate_retained(Some(&raw), Some(&profile)).unwrap();
        assert!(validate_retained(Some(&raw), None).is_err());
        let mut changed = profile.clone();
        changed.legal_name_zh = "Other issuer".into();
        assert!(changed.validate().is_err());
        assert!(validate_retained(Some(&raw), Some(&changed)).is_err());
        let mut value: serde_json::Value = serde_json::from_str(&raw).unwrap();
        value["address"] = serde_json::json!("unapproved");
        assert!(serde_json::from_value::<PrintProfile>(value).is_err());
        validate_retained(None, None).unwrap();
    }
}
