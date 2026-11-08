use super::*;
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SettlementDetails {
    Cash {},
    BankTransfer {
        recipient_type: String,
        bank_channel: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        bank_name: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        account_holder: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        account_reference: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        iban: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        swift_bic: Option<String>,
        transaction_reference: String,
    },
    Remittance {
        recipient_type: String,
        provider_code: String,
        provider_name: String,
        reference: String,
        transaction_reference: String,
    },
    MobilePayment {
        recipient_type: String,
        transaction_reference: String,
        channel_id: Uuid,
        channel_code: String,
        country_code: String,
        channel_name_snapshot: String,
        recipient_reference: String,
    },
    Other {
        description: String,
    },
}
impl SettlementDetails {
    pub(super) fn validate(&self, method: &str) -> Result<(), AuthError> {
        let text = |s: &str, max: usize| {
            !s.is_empty()
                && s.trim() == s
                && s.chars().count() <= max
                && !s.chars().any(char::is_control)
        };
        let valid_iban = |v: &str| {
            (15..=34).contains(&v.len())
                && v.as_bytes()[..2].iter().all(|b| b.is_ascii_uppercase())
                && v.as_bytes()[2..4].iter().all(|b| b.is_ascii_digit())
                && v.bytes()
                    .skip(4)
                    .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
        };
        let valid_bic = |v: &str| {
            (v.len() == 8 || v.len() == 11)
                && v.bytes().take(6).all(|b| b.is_ascii_uppercase())
                && v.bytes()
                    .skip(6)
                    .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
        };
        let recipient = |s: &str| matches!(s, "individual" | "company");
        let optional = |s: &Option<String>, max: usize| s.as_ref().is_none_or(|v| text(v, max));
        let required = |s: &Option<String>, max: usize| s.as_ref().is_some_and(|v| text(v, max));
        let valid = match self {
            Self::Cash {} => method == "cash",
            Self::Other { description } => method == "other" && text(description, 1000),
            Self::BankTransfer {
                recipient_type,
                bank_channel,
                bank_name,
                account_holder,
                account_reference,
                iban,
                swift_bic,
                transaction_reference,
            } => {
                method == "bank_transfer"
                    && recipient(recipient_type)
                    && text(transaction_reference, 200)
                    && optional(bank_name, 200)
                    && optional(account_holder, 200)
                    && optional(account_reference, 100)
                    && iban.as_ref().is_none_or(|v| valid_iban(v))
                    && swift_bic.as_ref().is_none_or(|v| valid_bic(v))
                    && match bank_channel.as_str() {
                        "SWIFT" => {
                            required(bank_name, 200)
                                && required(account_reference, 100)
                                && swift_bic.as_ref().is_some_and(|v| {
                                    (v.len() == 8 || v.len() == 11)
                                        && v.bytes().take(6).all(|b| b.is_ascii_uppercase())
                                        && v.bytes()
                                            .skip(6)
                                            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
                                })
                        }
                        "IBAN" => iban.as_ref().is_some_and(|v| {
                            (15..=34).contains(&v.len())
                                && v.as_bytes()[..2].iter().all(|b| b.is_ascii_uppercase())
                                && v.as_bytes()[2..4].iter().all(|b| b.is_ascii_digit())
                                && v.bytes()
                                    .skip(4)
                                    .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
                        }),
                        "OTHER" => required(account_reference, 100),
                        _ => false,
                    }
            }
            Self::Remittance {
                recipient_type,
                provider_code,
                provider_name,
                reference,
                transaction_reference,
            } => {
                method == "other"
                    && recipient(recipient_type)
                    && text(provider_code, 64)
                    && text(provider_name, 200)
                    && text(reference, 200)
                    && text(transaction_reference, 200)
                    && (provider_code != "WESTERN_UNION"
                        || (reference.len() == 10 && reference.bytes().all(|b| b.is_ascii_digit())))
            }
            Self::MobilePayment {
                recipient_type,
                transaction_reference,
                channel_code,
                country_code,
                channel_name_snapshot,
                recipient_reference,
                ..
            } => {
                method == "mobile_payment"
                    && recipient(recipient_type)
                    && text(transaction_reference, 200)
                    && text(channel_code, 64)
                    && country_code.len() == 2
                    && country_code.bytes().all(|c| c.is_ascii_uppercase())
                    && text(channel_name_snapshot, 200)
                    && text(recipient_reference, 100)
            }
        };
        if valid {
            Ok(())
        } else {
            Err(AuthError::InvalidInput)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strict_settlement_union_validates_channels_without_rewriting_legacy_methods() {
        let bank: SettlementDetails=serde_json::from_value(serde_json::json!({"kind":"BANK_TRANSFER","recipientType":"company","bankChannel":"IBAN","iban":"FR7630006000011234567890189","transactionReference":"TEST-REFERENCE"})).unwrap();
        assert!(bank.validate("bank_transfer").is_ok());
        let wire = serde_json::to_value(&bank).unwrap();
        assert!(wire.get("bankName").is_none());
        assert!(wire.get("accountHolder").is_none());
        assert!(wire.get("accountReference").is_none());
        assert!(wire.get("swiftBic").is_none());
        assert!(bank.validate("other").is_err());
        let invalid: SettlementDetails=serde_json::from_value(serde_json::json!({"kind":"REMITTANCE","recipientType":"individual","providerCode":"WESTERN_UNION","providerName":"Western Union","reference":"123","transactionReference":"TEST-REFERENCE"})).unwrap();
        assert!(invalid.validate("other").is_err());
        assert!(
            serde_json::from_value::<SettlementDetails>(
                serde_json::json!({"kind":"CASH","pin":"never accepted"})
            )
            .is_err()
        );
    }
}
