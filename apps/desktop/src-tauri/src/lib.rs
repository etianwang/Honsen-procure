use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use bytes::Bytes;
use futures_util::StreamExt;
use http_body::Frame;
use http_body_util::StreamBody;
use image::{
    DynamicImage, ImageEncoder, ImageFormat, ImageReader,
    codecs::{
        jpeg::JpegEncoder,
        png::{CompressionType, FilterType, PngEncoder},
    },
    imageops::FilterType as ImageFilterType,
};
use keyring::Entry;
use rand_core::OsRng;
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

mod seed;
pub use seed::SeedImportReport;

const OFFLINE_LOGIN_WINDOW: Duration = Duration::from_secs(24 * 60 * 60);
const IDLE_LOCK_WINDOW: Duration = Duration::from_secs(30 * 60);
const CAPTCHA_WINDOW: Duration = Duration::from_secs(5 * 60);
const LOCK_WINDOW: Duration = Duration::from_secs(15 * 60);
const AUTHORIZATION_CACHE_WINDOW: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const MAX_FAILURES: i64 = 5;
const MAX_MATERIAL_IMAGE_BYTES: usize = 100 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES: u64 = 100 * 1024 * 1024;
const MAX_ORDER_ATTACHMENT_BYTES: i64 = 200 * 1024 * 1024;
const RECEIPT_PHOTO_MAX_DIMENSION: u32 = 2_048;
const RECEIPT_PHOTO_JPEG_QUALITY: u8 = 82;
const SYNC_PULL_PAGE_LIMIT: usize = 500;

fn attachment_content_type(name: &str) -> Option<&'static str> {
    match name.rsplit_once('.')?.1.to_ascii_lowercase().as_str() {
        "pdf" => Some("application/pdf"),
        "doc" => Some("application/msword"),
        "docx" => Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "xls" => Some("application/vnd.ms-excel"),
        "xlsx" => Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "heic" => Some("image/heic"),
        "dwg" => Some("image/vnd.dwg"),
        "zip" => Some("application/zip"),
        _ => None,
    }
}

fn copy_attachment(input: &mut fs::File, output: &mut fs::File) -> Result<u64, AuthError> {
    let mut byte_length = 0u64;
    let mut buffer = [0u8; 65_536];
    loop {
        let count = input
            .read(&mut buffer)
            .map_err(|_| AuthError::InvalidInput)?;
        if count == 0 {
            break;
        }
        byte_length = byte_length
            .checked_add(count as u64)
            .ok_or(AuthError::InvalidInput)?;
        if byte_length > MAX_ATTACHMENT_BYTES {
            return Err(AuthError::InvalidInput);
        }
        output
            .write_all(&buffer[..count])
            .map_err(|_| AuthError::Database)?;
    }
    Ok(byte_length)
}

fn compress_receipt_photo(
    source_path: &Path,
    content_type: &str,
    output: &mut fs::File,
) -> Result<u64, AuthError> {
    let source_length = fs::metadata(source_path)
        .map_err(|_| AuthError::InvalidInput)?
        .len();
    if source_length == 0 || source_length > MAX_ATTACHMENT_BYTES {
        return Err(AuthError::InvalidInput);
    }
    let format = if content_type == "image/jpeg" {
        ImageFormat::Jpeg
    } else {
        ImageFormat::Png
    };
    let image = ImageReader::open(source_path)
        .map_err(|_| AuthError::InvalidInput)?
        .with_guessed_format()
        .map_err(|_| AuthError::InvalidInput)?
        .decode()
        .map_err(|_| AuthError::InvalidInput)?;
    let resized = resize_receipt_photo(image);
    match format {
        ImageFormat::Jpeg => {
            JpegEncoder::new_with_quality(&mut *output, RECEIPT_PHOTO_JPEG_QUALITY)
                .write_image(
                    resized.as_bytes(),
                    resized.width(),
                    resized.height(),
                    resized.color().into(),
                )
                .map_err(|_| AuthError::InvalidInput)?
        }
        ImageFormat::Png => {
            PngEncoder::new_with_quality(&mut *output, CompressionType::Best, FilterType::Adaptive)
                .write_image(
                    resized.as_bytes(),
                    resized.width(),
                    resized.height(),
                    resized.color().into(),
                )
                .map_err(|_| AuthError::InvalidInput)?
        }
        _ => return Err(AuthError::InvalidInput),
    }
    let length = output.metadata().map_err(|_| AuthError::Database)?.len();
    if length == 0 || length > MAX_ATTACHMENT_BYTES {
        return Err(AuthError::InvalidInput);
    }
    Ok(length)
}

fn resize_receipt_photo(image: DynamicImage) -> DynamicImage {
    if image.width() <= RECEIPT_PHOTO_MAX_DIMENSION && image.height() <= RECEIPT_PHOTO_MAX_DIMENSION
    {
        return image;
    }
    image.resize(
        RECEIPT_PHOTO_MAX_DIMENSION,
        RECEIPT_PHOTO_MAX_DIMENSION,
        ImageFilterType::Lanczos3,
    )
}

fn sha256_file(path: &Path) -> Result<String, AuthError> {
    let mut input = fs::File::open(path).map_err(|_| AuthError::Database)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65_536];
    loop {
        let count = input.read(&mut buffer).map_err(|_| AuthError::Database)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn write_attachment_bytes_atomically(path: &Path, bytes: &[u8]) -> Result<(), AuthError> {
    let temporary = path.with_extension(format!("partial-{}", Uuid::new_v4()));
    let result = (|| {
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| AuthError::Database)?;
        output.write_all(bytes).map_err(|_| AuthError::Database)?;
        output.sync_all().map_err(|_| AuthError::Database)?;
        drop(output);
        fs::rename(&temporary, path).map_err(|_| AuthError::Database)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    SuperAdministrator,
    Administrator,
    Purchaser,
    Engineer,
    Viewer,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CachedAccount {
    pub id: Uuid,
    pub username: String,
    pub roles: Vec<Role>,
    pub enabled: bool,
    pub requires_password_change: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct CaptchaChallenge {
    pub id: Uuid,
    pub question: String,
    pub expires_at_unix_seconds: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AuthenticatedSession {
    pub user_id: Uuid,
    pub username: String,
    pub roles: Vec<Role>,
    pub requires_password_change: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationContextView {
    pub country_id: Uuid,
    pub project_id: Uuid,
    pub project_name: String,
    pub site: String,
    pub department_id: Uuid,
    pub department_name: String,
    pub team_id: Uuid,
    pub team_name: String,
    pub currency: String,
    pub primary_currency: String,
    pub language_pair: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationContextSelectionInput {
    pub project_id: Uuid,
    pub department_id: Uuid,
    pub team_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CloudAuthorizationScope {
    pub project_id: Uuid,
    pub department_id: Uuid,
    pub team_id: Uuid,
    pub country_id: Uuid,
    pub site: String,
    pub currency: String,
    pub language_pair: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudCaptchaChallenge {
    pub id: Uuid,
    pub question: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedAuthorizationBinding {
    pub project_id: Uuid,
    pub department_id: Uuid,
    pub team_id: Uuid,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedAuthorizationReplacement {
    pub old_scope: ManagedAuthorizationBinding,
    pub new_scope: ManagedAuthorizationBinding,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudLoginResponse {
    access_token: String,
    user: CloudLoginUser,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudLoginUser {
    id: Uuid,
    username: String,
    roles: Vec<Role>,
    requires_password_change: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDefaultsInput {
    pub project_id: Uuid,
    pub department_title: String,
    pub company_address: String,
    pub company_contact: Option<String>,
    pub default_currency: String,
    pub default_language_pair: String,
    pub default_tax_template_id: Option<Uuid>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaxTemplateInput {
    pub id: Uuid,
    pub business_code: String,
    pub name: String,
    pub country_id: Option<Uuid>,
    pub rate_basis_points: i32,
    pub effective_at: String,
    pub is_active: bool,
    pub version: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeRateInput {
    pub id: Uuid,
    pub from_currency: String,
    pub to_currency: String,
    pub rate_decimal: String,
    pub effective_at: String,
    pub source: String,
    pub reason: Option<String>,
    pub version: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialInput {
    pub id: Uuid,
    pub sku: Option<String>,
    #[serde(default)]
    pub category_id: Option<Uuid>,
    pub name_zh: String,
    pub name_fr: Option<String>,
    pub aliases: Vec<String>,
    pub brand: Option<String>,
    pub model: String,
    pub specification: String,
    pub unit: String,
    pub notes: Option<String>,
    pub is_active: bool,
    pub version: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierInput {
    pub id: Uuid,
    pub business_code: String,
    pub name: String,
    #[serde(default)]
    pub country_id: Option<Uuid>,
    pub contact_name: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub payment_terms: Option<String>,
    pub delivery_lead_time: Option<String>,
    pub is_preferred: bool,
    pub is_blacklisted: bool,
    pub is_active: bool,
    pub version: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialCategoryInput {
    pub id: Uuid,
    pub business_code: String,
    pub name: String,
    pub is_active: bool,
    pub version: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialPriceInput {
    pub id: Uuid,
    pub material_id: Uuid,
    pub supplier_id: Uuid,
    pub currency: String,
    pub unit_price_minor: String,
    pub unit: String,
    pub effective_at: String,
    pub source_note: Option<String>,
    pub version: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialImageInput {
    pub id: Uuid,
    pub material_id: Uuid,
    pub source_file_name: String,
    pub source_base64: String,
    pub square_crop_base64: String,
    pub crop_json: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(tag = "kind")]
pub enum AdjustmentInput {
    #[serde(rename = "fixed_minor")]
    FixedMinor { minor: String },
    #[serde(rename = "percent_basis_points")]
    PercentBasisPoints {
        #[serde(rename = "basisPoints")]
        basis_points: i32,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequisitionLineInput {
    pub id: Uuid,
    pub material_id: Option<Uuid>,
    pub material_snapshot: MaterialSnapshotInput,
    pub supplier_id: Option<Uuid>,
    pub currency: String,
    pub quantity: String,
    pub unit: String,
    pub unit_price_minor: String,
    pub line_discount: AdjustmentInput,
    pub line_freight: AdjustmentInput,
    pub freight_included: bool,
    pub sort_order: i32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSnapshotInput {
    pub name_zh: String,
    pub name_fr: Option<String>,
    pub model: String,
    pub specification: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequisitionDraftInput {
    pub id: Uuid,
    pub display_no: String,
    pub country_id: Uuid,
    pub project_id: Uuid,
    pub site: String,
    pub department_id: Uuid,
    pub team_id: Uuid,
    pub applicant_id: Uuid,
    pub currency: String,
    pub primary_currency: String,
    pub language_pair: String,
    pub urgency: String,
    pub urgency_reason: Option<String>,
    pub order_date: String,
    pub delivery_address: String,
    pub expected_delivery_date: Option<String>,
    pub notes: Option<String>,
    pub order_discount: AdjustmentInput,
    pub order_freight: AdjustmentInput,
    pub tax_rate_basis_points: i32,
    pub lines: Vec<RequisitionLineInput>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SupplierChildAllocationInput {
    pub parent_item_id: Uuid,
    pub supplier_id: Uuid,
    pub currency: String,
    pub child_display_no: String,
    pub locked_exchange_rate_decimal: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierChildOrderView {
    pub child_order_id: Uuid,
    pub supplier_id: Uuid,
    pub currency: String,
    pub source_total_minor: String,
    pub primary_total_minor: String,
    pub locked_exchange_rate_decimal: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcurementExecutionLineView {
    pub id: Uuid,
    pub material_name: String,
    pub quantity: String,
    pub unit: String,
    pub currency: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcurementExecutionChildView {
    pub id: Uuid,
    pub display_no: String,
    pub currency: String,
    pub workflow_status: String,
    pub lines: Vec<ProcurementExecutionLineView>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcurementExecutionOrderView {
    pub id: Uuid,
    pub display_no: String,
    pub primary_currency: String,
    pub procurement_mode: Option<String>,
    pub workflow_status: String,
    pub lines: Vec<ProcurementExecutionLineView>,
    pub children: Vec<ProcurementExecutionChildView>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequisitionHistoryView {
    pub id: Uuid,
    pub display_no: String,
    pub project_name: String,
    pub site: String,
    pub workflow_status: String,
    pub procurement_mode: Option<String>,
    pub primary_currency: String,
    pub total_minor: String,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequisitionHistoryCursor {
    pub updated_at: i64,
    pub id: Uuid,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequisitionHistoryFilter {
    pub query: Option<String>,
    pub workflow_status: Option<String>,
    pub project_id: Option<Uuid>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequisitionHistoryPageView {
    pub records: Vec<RequisitionHistoryView>,
    pub next_cursor: Option<RequisitionHistoryCursor>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequisitionDetailLineView {
    pub material_name: String,
    pub model: String,
    pub specification: String,
    pub quantity: String,
    pub unit: String,
    pub currency: String,
    pub unit_price_minor: String,
    pub line_total_minor: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequisitionAttachmentView {
    pub id: Uuid,
    pub original_name: String,
    pub content_type: String,
    pub byte_length: i64,
    pub upload_state: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequisitionDetailView {
    pub id: Uuid,
    pub display_no: String,
    pub applicant_id: Uuid,
    pub project_name: String,
    pub project_id: Uuid,
    pub site: String,
    pub workflow_status: String,
    pub procurement_mode: Option<String>,
    pub order_date: String,
    pub delivery_address: String,
    pub expected_delivery_date: Option<String>,
    pub notes: Option<String>,
    pub primary_currency: String,
    pub total_minor: String,
    pub lines: Vec<RequisitionDetailLineView>,
    pub attachments: Vec<RequisitionAttachmentView>,
    pub audits: Vec<OrderAuditView>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SupplierChildLineTermsInput {
    pub order_item_id: Uuid,
    pub line_discount: AdjustmentInput,
    pub line_freight: AdjustmentInput,
    pub freight_included: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SupplierChildTermsInput {
    pub order_id: Uuid,
    pub lines: Vec<SupplierChildLineTermsInput>,
    pub order_discount: AdjustmentInput,
    pub order_freight: AdjustmentInput,
    pub tax_rate_basis_points: i32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateRfqInput {
    pub id: Uuid,
    pub source_order_id: Uuid,
    pub supplier_id: Uuid,
    pub display_no: String,
    pub currency: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RfqView {
    pub id: Uuid,
    pub source_order_id: Uuid,
    pub supplier_id: Uuid,
    pub display_no: String,
    pub currency: String,
    pub item_count: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OwnerQuoteSourceInput {
    CatalogPrice {
        material_price_id: Uuid,
    },
    ManualReference {
        unit_price_minor: String,
        reason: String,
    },
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OwnerLinePricingInput {
    pub order_item_id: Uuid,
    pub quote_source: OwnerQuoteSourceInput,
    pub locked_exchange_rate_decimal: String,
    pub markup: AdjustmentInput,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OwnerPurchasePricingInput {
    pub order_id: Uuid,
    pub lines: Vec<OwnerLinePricingInput>,
    pub revision_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerLinePricingView {
    pub order_item_id: Uuid,
    pub converted_reference_unit_minor: String,
    pub markup_minor: String,
    pub final_unit_price_minor: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptItemInput {
    pub order_item_id: Uuid,
    pub quantity: String,
    pub unit: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecordReceiptInput {
    pub id: Uuid,
    pub order_id: Uuid,
    pub received_at: String,
    pub receiver_id: Uuid,
    pub over_receipt_reason: Option<String>,
    #[serde(default)]
    pub attachment_ids: Vec<Uuid>,
    pub items: Vec<ReceiptItemInput>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptView {
    pub id: Uuid,
    pub order_id: Uuid,
    pub workflow_status: String,
    pub received_item_count: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordProcurementExpenditureInput {
    pub id: Uuid,
    pub order_id: Uuid,
    pub receipt_id: Option<Uuid>,
    pub counterparty_type: String,
    pub supplier_id: Option<Uuid>,
    pub payee_name: String,
    pub currency: String,
    pub amount_minor: String,
    pub payment_date: String,
    pub payment_method: String,
    pub payment_handler_id: Uuid,
    pub notes: Option<String>,
    pub corrects_expenditure_id: Option<Uuid>,
    pub correction_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcurementExpenditureView {
    pub id: Uuid,
    pub order_id: Uuid,
    pub receipt_id: Option<Uuid>,
    pub counterparty_type: String,
    pub supplier_id: Option<Uuid>,
    pub payee_name: String,
    pub currency: String,
    pub amount_minor: String,
    pub payment_date: String,
    pub payment_method: String,
    pub payment_handler_id: Uuid,
    pub notes: Option<String>,
    pub status: String,
    pub corrects_expenditure_id: Option<Uuid>,
    pub correction_reason: Option<String>,
    pub created_by: Uuid,
    pub created_at: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpenditureVoucherView {
    pub id: Uuid,
    pub expenditure_id: Uuid,
    pub original_name: String,
    pub content_type: String,
    pub byte_length: i64,
    pub checksum: String,
    pub upload_state: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptAttachmentView {
    pub id: Uuid,
    pub receipt_id: Uuid,
    pub original_name: String,
    pub content_type: String,
    pub byte_length: i64,
    pub checksum: String,
    pub upload_state: String,
}

#[derive(Deserialize)]
struct AttachmentUploadIntentResponse {
    uploaded: bool,
    url: Option<String>,
}

#[derive(Deserialize)]
struct AttachmentDownloadResponse {
    url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutboxEventView {
    pub event_id: Uuid,
    pub entity_type: String,
    pub entity_id: Uuid,
    pub operation: String,
    pub base_version: i64,
    pub payload_json: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncAcknowledgementInput {
    pub event_id: Uuid,
    pub status: String,
    pub server_version: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushView {
    pub accepted_count: usize,
    pub pending_count: usize,
    pub pending_attachment_count: usize,
    pub attachment_sync_failed: bool,
    pub attachment_transfer_count: usize,
    pub attachment_transfer_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPullView {
    pub applied_count: usize,
    pub next_cursor: String,
    pub pending_attachment_count: usize,
    pub attachment_sync_failed: bool,
    pub attachment_transfer_count: usize,
    pub attachment_transfer_bytes: u64,
}

#[derive(Default)]
struct AttachmentTransferSummary {
    count: usize,
    bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentTransferProgress {
    pub attachment_id: String,
    pub direction: String,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub state: String,
}

type AttachmentTransferReporter = Arc<dyn Fn(AttachmentTransferProgress) + Send + Sync>;

fn report_attachment_transfer(
    reporter: &Option<AttachmentTransferReporter>,
    attachment_id: &str,
    direction: &str,
    transferred_bytes: u64,
    total_bytes: u64,
    state: &str,
) {
    if let Some(reporter) = reporter {
        reporter(AttachmentTransferProgress {
            attachment_id: attachment_id.into(),
            direction: direction.into(),
            transferred_bytes,
            total_bytes,
            state: state.into(),
        });
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictView {
    pub id: Uuid,
    pub entity_type: String,
    pub entity_id: Uuid,
    pub server_version: i64,
    pub local_payload_json: String,
    pub server_payload_json: String,
    pub server_operation: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSyncConflictInput {
    pub conflict_id: Uuid,
    pub resolution: String,
    pub reason: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncPullChangeInput {
    pub cursor: String,
    pub entity_type: String,
    pub entity_id: Uuid,
    pub operation: String,
    pub version: i64,
    pub payload: serde_json::Value,
    pub changed_at: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncPullPageInput {
    pub changes: Vec<SyncPullChangeInput>,
    pub next_cursor: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemotePurchaseOrderPayload {
    parent_order_id: Option<Uuid>,
    display_no: String,
    country_id: Uuid,
    project_id: Uuid,
    site: String,
    department_id: Uuid,
    team_id: Uuid,
    applicant_id: Uuid,
    supplier_id: Option<Uuid>,
    supplier_snapshot_json: Option<String>,
    currency: String,
    primary_currency: String,
    locked_exchange_rate_decimal: Option<String>,
    language_pair: String,
    status: String,
    workflow_status: String,
    procurement_mode: Option<String>,
    urgency: String,
    urgency_reason: Option<String>,
    order_date: String,
    delivery_address: String,
    expected_delivery_date: Option<String>,
    notes: Option<String>,
    subtotal_minor: String,
    line_discount_minor: String,
    order_discount_minor: String,
    freight_minor: String,
    tax_rate_basis_points: i32,
    tax_minor: String,
    total_minor: String,
    confirmed_by: Option<Uuid>,
    confirmed_at: Option<i64>,
    rejection_reason: Option<String>,
    self_approved: bool,
    supplier_terms_completed_at: Option<i64>,
    lines: Vec<RemotePurchaseOrderLine>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteProcurementExpenditurePayload {
    id: Uuid,
    order_id: Uuid,
    project_id: Uuid,
    receipt_id: Option<Uuid>,
    counterparty_type: String,
    supplier_id: Option<Uuid>,
    payee_name: String,
    counterparty_snapshot: Option<serde_json::Value>,
    currency: String,
    amount_minor: String,
    payment_date: String,
    payment_method: String,
    payment_handler_id: Uuid,
    notes: Option<String>,
    status: String,
    corrects_expenditure_id: Option<Uuid>,
    correction_reason: Option<String>,
    created_by: Uuid,
    created_at: i64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteReceiptPayload {
    id: Uuid,
    order_id: Uuid,
    project_id: Uuid,
    received_at: String,
    receiver_id: Uuid,
    over_receipt_reason: Option<String>,
    created_by: Uuid,
    created_at: i64,
    completed: bool,
    items: Vec<RemoteReceiptItem>,
    attachment_ids: Vec<Uuid>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteReceiptItem {
    id: Uuid,
    order_item_id: Uuid,
    quantity: String,
    unit: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteAttachmentPayload {
    id: Uuid,
    owner_type: String,
    owner_id: Uuid,
    order_id: Uuid,
    project_id: Uuid,
    original_name: String,
    content_type: String,
    byte_length: i64,
    checksum: String,
    uploader_id: Uuid,
    created_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemotePurchaseOrderLine {
    id: Uuid,
    material_id: Option<Uuid>,
    material_snapshot_json: String,
    supplier_snapshot_json: Option<String>,
    currency: String,
    quantity: String,
    unit: String,
    unit_price_minor: String,
    line_discount_json: String,
    line_freight_json: String,
    freight_included: bool,
    line_total_minor: String,
    sort_order: i64,
    created_at: i64,
    updated_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncPushResponse {
    results: Vec<SyncAcknowledgementInput>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequisitionTotalsView {
    pub subtotal_minor: String,
    pub line_discount_minor: String,
    pub order_discount_minor: String,
    pub freight_minor: String,
    pub tax_minor: String,
    pub total_minor: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderCommentView {
    pub id: Uuid,
    pub order_id: Uuid,
    pub author_id: Uuid,
    pub body: String,
    pub created_at: i64,
    pub notification_count: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderAuditView {
    pub id: Uuid,
    pub order_id: Uuid,
    pub actor_id: Uuid,
    pub action: String,
    pub reason: Option<String>,
    pub previous_json: Option<String>,
    pub next_json: Option<String>,
    pub created_at: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalPolicyView {
    pub allow_self_approval: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPriceView {
    pub price_id: Uuid,
    pub supplier_id: Uuid,
    pub supplier_name: String,
    pub is_preferred_supplier: bool,
    pub currency: String,
    pub unit_price_minor: String,
    pub unit: String,
    pub effective_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogMaterialView {
    pub id: Uuid,
    pub sku: Option<String>,
    pub name_zh: String,
    pub name_fr: Option<String>,
    pub aliases: Vec<String>,
    pub brand: Option<String>,
    pub model: String,
    pub specification: String,
    pub unit: String,
    pub notes: Option<String>,
    pub version: i64,
    pub prices: Vec<CatalogPriceView>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierView {
    pub id: Uuid,
    pub business_code: String,
    pub name: String,
    pub contact_name: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub payment_terms: Option<String>,
    pub delivery_lead_time: Option<String>,
    pub is_preferred: bool,
    pub is_blacklisted: bool,
    pub is_active: bool,
    pub version: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDefaultsView {
    pub project_id: Uuid,
    pub project_name: String,
    pub site: String,
    pub department_title: Option<String>,
    pub company_address: Option<String>,
    pub company_contact: Option<String>,
    pub default_currency: String,
    pub default_language_pair: String,
    pub default_tax_template_id: Option<Uuid>,
    pub tax_template_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReferenceMasterDataInput {
    Country {
        id: Uuid,
        business_code: String,
        name: String,
        time_zone: String,
        is_active: bool,
        version: i64,
    },
    Project {
        id: Uuid,
        country_id: Uuid,
        business_code: String,
        name: String,
        site: String,
        department_name: String,
        default_currency: String,
        default_language_pair: String,
        is_active: bool,
        version: i64,
    },
    Site {
        id: Uuid,
        project_id: Uuid,
        business_code: String,
        name: String,
        is_active: bool,
        version: i64,
    },
    Department {
        id: Uuid,
        business_code: String,
        name: String,
        is_active: bool,
        version: i64,
    },
    Team {
        id: Uuid,
        department_id: Uuid,
        business_code: String,
        name: String,
        is_active: bool,
        version: i64,
    },
    Unit {
        id: Uuid,
        business_code: String,
        name: String,
        is_active: bool,
        version: i64,
    },
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AuthError {
    #[error("invalid credentials or captcha")]
    InvalidCredentials,
    #[error("the offline verification window has expired")]
    OfflineWindowExpired,
    #[error("account is locked")]
    AccountLocked,
    #[error("no active session")]
    NoActiveSession,
    #[error("role is not authorized")]
    Forbidden,
    #[error("database error")]
    Database,
    #[error("password hashing error")]
    PasswordHashing,
    #[error("secure credential storage error")]
    SecureStorage,
    #[error("invalid input")]
    InvalidInput,
    #[error("business code cannot change")]
    ImmutableBusinessCode,
    #[error("synchronization transport error")]
    SyncTransport,
}

#[derive(Debug)]
struct LocalCaptcha {
    id: Uuid,
    answer: u8,
    expires_at: SystemTime,
}

trait CredentialVault: Send + Sync {
    fn save_verifier(&self, account_id: Uuid, verifier: &str) -> Result<(), AuthError>;
    fn load_verifier(&self, account_id: Uuid) -> Result<Option<String>, AuthError>;
    fn save_sync_token(&self, account_id: Uuid, token: &str) -> Result<(), AuthError>;
    fn load_sync_token(&self, account_id: Uuid) -> Result<Option<String>, AuthError>;
}

struct MemoryCredentialVault(Mutex<HashMap<(Uuid, String), String>>);

impl MemoryCredentialVault {
    fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

impl CredentialVault for MemoryCredentialVault {
    fn save_verifier(&self, account_id: Uuid, verifier: &str) -> Result<(), AuthError> {
        self.0
            .lock()
            .map_err(|_| AuthError::SecureStorage)?
            .insert((account_id, "verifier".into()), verifier.to_owned());
        Ok(())
    }

    fn load_verifier(&self, account_id: Uuid) -> Result<Option<String>, AuthError> {
        Ok(self
            .0
            .lock()
            .map_err(|_| AuthError::SecureStorage)?
            .get(&(account_id, "verifier".into()))
            .cloned())
    }

    fn save_sync_token(&self, account_id: Uuid, token: &str) -> Result<(), AuthError> {
        self.0
            .lock()
            .map_err(|_| AuthError::SecureStorage)?
            .insert((account_id, "sync-token".into()), token.to_owned());
        Ok(())
    }

    fn load_sync_token(&self, account_id: Uuid) -> Result<Option<String>, AuthError> {
        Ok(self
            .0
            .lock()
            .map_err(|_| AuthError::SecureStorage)?
            .get(&(account_id, "sync-token".into()))
            .cloned())
    }
}

struct OsCredentialVault {
    verifier_service: &'static str,
    sync_service: &'static str,
}

impl CredentialVault for OsCredentialVault {
    fn save_verifier(&self, account_id: Uuid, verifier: &str) -> Result<(), AuthError> {
        Entry::new(self.verifier_service, &account_id.to_string())
            .map_err(|_| AuthError::SecureStorage)?
            .set_password(verifier)
            .map_err(|_| AuthError::SecureStorage)
    }

    fn load_verifier(&self, account_id: Uuid) -> Result<Option<String>, AuthError> {
        let entry = Entry::new(self.verifier_service, &account_id.to_string())
            .map_err(|_| AuthError::SecureStorage)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(AuthError::SecureStorage),
        }
    }

    fn save_sync_token(&self, account_id: Uuid, token: &str) -> Result<(), AuthError> {
        Entry::new(self.sync_service, &account_id.to_string())
            .map_err(|_| AuthError::SecureStorage)?
            .set_password(token)
            .map_err(|_| AuthError::SecureStorage)
    }

    fn load_sync_token(&self, account_id: Uuid) -> Result<Option<String>, AuthError> {
        let entry = Entry::new(self.sync_service, &account_id.to_string())
            .map_err(|_| AuthError::SecureStorage)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(AuthError::SecureStorage),
        }
    }
}

fn test_profile_accounts() -> [(Uuid, &'static str, Vec<Role>, &'static str); 3] {
    [
        (
            Uuid::parse_str("10000000-0000-4000-8000-000000000011").expect("test UUID"),
            "engineer-a",
            vec![Role::Engineer],
            "engineer A",
        ),
        (
            Uuid::parse_str("10000000-0000-4000-8000-000000000012").expect("test UUID"),
            "engineer-b",
            vec![Role::Engineer],
            "engineer B",
        ),
        (
            Uuid::parse_str("10000000-0000-4000-8000-000000000013").expect("test UUID"),
            "purchaser",
            vec![Role::Purchaser],
            "purchaser",
        ),
    ]
}

fn named_test_profile_accounts() -> [(Uuid, &'static str, Role); 3] {
    [
        (
            Uuid::parse_str("10000000-0000-4000-8000-000000000021").expect("test UUID"),
            "test-en",
            Role::Engineer,
        ),
        (
            Uuid::parse_str("10000000-0000-4000-8000-000000000022").expect("test UUID"),
            "test-pr",
            Role::Purchaser,
        ),
        (
            Uuid::parse_str("10000000-0000-4000-8000-000000000023").expect("test UUID"),
            "test-ad",
            Role::Administrator,
        ),
    ]
}

pub struct LocalAuthService {
    connection: Mutex<Connection>,
    media_directory: PathBuf,
    captcha: Mutex<Option<LocalCaptcha>>,
    credential_vault: Box<dyn CredentialVault>,
}

impl LocalAuthService {
    pub fn cache_named_test_profile_accounts(
        &self,
        password: &str,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if password.len() < 8 {
            return Err(AuthError::InvalidInput);
        }
        for (id, username, role) in named_test_profile_accounts() {
            self.cache_verified_account(
                CachedAccount {
                    id,
                    username: username.into(),
                    roles: vec![role],
                    enabled: true,
                    requires_password_change: false,
                },
                password,
                now,
            )?;
        }
        Ok(())
    }

    pub fn open_in_memory() -> Result<Self, AuthError> {
        Self::open(
            Connection::open_in_memory().map_err(|_| AuthError::Database)?,
            Box::new(MemoryCredentialVault::new()),
            std::env::temp_dir().join(format!("honsen-materials-{}", Uuid::new_v4())),
        )
    }

    pub fn open_path(path: &str) -> Result<Self, AuthError> {
        Self::open(
            Connection::open(path).map_err(|_| AuthError::Database)?,
            Box::new(OsCredentialVault {
                verifier_service: "HONSEN Materials offline verifier",
                sync_service: "HONSEN Procure sync session",
            }),
            Path::new(path).with_extension("media"),
        )
    }

    pub fn open_test_path(path: &str) -> Result<Self, AuthError> {
        if !Path::new(path).is_absolute() || !path.ends_with(".test.sqlite") {
            return Err(AuthError::InvalidInput);
        }
        Self::open(
            Connection::open(path).map_err(|_| AuthError::Database)?,
            Box::new(OsCredentialVault {
                verifier_service: "Honsen Procure test offline verifier",
                sync_service: "Honsen Procure test sync session",
            }),
            Path::new(path).with_extension("media"),
        )
    }

    pub fn bootstrap_test_profile(
        &self,
        engineer_a_password: &str,
        engineer_b_password: &str,
        purchaser_password: &str,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if [engineer_a_password, engineer_b_password, purchaser_password]
            .iter()
            .any(|password| password.len() < 12)
        {
            return Err(AuthError::InvalidInput);
        }
        for (id, username, roles, _) in test_profile_accounts() {
            self.cache_verified_account(
                CachedAccount {
                    id,
                    username: username.into(),
                    roles,
                    enabled: true,
                    requires_password_change: false,
                },
                match username {
                    "engineer-a" => engineer_a_password,
                    "engineer-b" => engineer_b_password,
                    _ => purchaser_password,
                },
                now,
            )?;
        }
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        connection.execute_batch(
            "INSERT OR IGNORE INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES ('10000000-0000-4000-8000-000000000001', 'TEST-CI', 'Synthetic test country', 'Africa/Abidjan', 1, 1);
             INSERT OR IGNORE INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'TEST-OPA', 'Synthetic OPA project', 'Test site', 'Test procurement', 'XOF', 'zh_fr', 1, 1);
             INSERT OR IGNORE INTO local_departments (id, business_code, name, is_active, version) VALUES ('10000000-0000-4000-8000-000000000003', 'TEST-PROC', 'Synthetic procurement', 1, 1);
             INSERT OR IGNORE INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'TEST-TEAM', 'Synthetic team', 1, 1);
             INSERT OR IGNORE INTO local_materials (id, sku, name_zh, name_fr, aliases_json, model, specification, unit, is_active, version) VALUES ('10000000-0000-4000-8000-000000000005', 'TEST-CABLE', '合成测试电缆', 'Câble synthétique', '[]', 'TEST-3X2.5', '3 × 2.5 mm²', '米', 1, 1);
             INSERT OR IGNORE INTO local_suppliers (id, business_code, name, country_id, is_active, is_blacklisted, is_preferred, version) VALUES ('10000000-0000-4000-8000-000000000006', 'TEST-SUPPLIER', 'Synthetic catalog supplier', '10000000-0000-4000-8000-000000000001', 1, 0, 1, 1);
             INSERT OR IGNORE INTO local_material_prices (id, material_id, supplier_id, currency, unit_price_minor, unit, effective_at, is_active, version) VALUES ('10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000006', 'CNY', 1234, '米', '2026-10-12', 1, 1);
             INSERT OR IGNORE INTO local_exchange_rates (id, from_currency, to_currency, rate_decimal, effective_at, source, version) VALUES ('10000000-0000-4000-8000-000000000008', 'CNY', 'XOF', '76.5', '2026-10-12', 'public_daily', 1);",
        )
        .map_err(|_| AuthError::Database)?;
        connection.execute(
            "INSERT OR REPLACE INTO local_authorization_snapshots (account_id, project_id, department_id, team_id, verified_at, expires_at)
             SELECT id, '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', ?1, ?2 FROM local_accounts",
            params![unix_seconds(now), unix_seconds(now + AUTHORIZATION_CACHE_WINDOW)],
        ).map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn clear_test_profile(path: &Path) -> Result<(), AuthError> {
        if !path.is_absolute() || !path.to_string_lossy().ends_with(".test.sqlite") {
            return Err(AuthError::InvalidInput);
        }
        for id in test_profile_accounts()
            .map(|(id, _, _, _)| id)
            .into_iter()
            .chain(named_test_profile_accounts().map(|(id, _, _)| id))
        {
            for service in [
                "Honsen Procure test offline verifier",
                "Honsen Procure test sync session",
            ] {
                let entry =
                    Entry::new(service, &id.to_string()).map_err(|_| AuthError::SecureStorage)?;
                match entry.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => {}
                    Err(_) => return Err(AuthError::SecureStorage),
                }
            }
        }
        if path.exists() {
            fs::remove_file(path).map_err(|_| AuthError::Database)?;
        }
        let media = path.with_extension("media");
        if media.exists() {
            fs::remove_dir_all(media).map_err(|_| AuthError::Database)?;
        }
        Ok(())
    }

    #[cfg(test)]
    fn open_file_for_test(path: &str) -> Result<Self, AuthError> {
        Self::open(
            Connection::open(path).map_err(|_| AuthError::Database)?,
            Box::new(MemoryCredentialVault::new()),
            Path::new(path).with_extension("media"),
        )
    }

    fn open(
        mut connection: Connection,
        credential_vault: Box<dyn CredentialVault>,
        media_directory: PathBuf,
    ) -> Result<Self, AuthError> {
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(|_| AuthError::Database)?;
        migrate(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            media_directory,
            captcha: Mutex::new(None),
            credential_vault,
        })
    }

    pub fn cache_verified_account(
        &self,
        account: CachedAccount,
        password: &str,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        let password_hash = hash_password(password)?;
        let roles = serde_json::to_string(&account.roles).map_err(|_| AuthError::Database)?;
        self.credential_vault
            .save_verifier(account.id, &password_hash)?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        connection.execute(
            "INSERT INTO local_accounts (id, username, roles_json, enabled, requires_password_change, cached_verified_at, failed_attempts, locked_until)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, NULL)
             ON CONFLICT(id) DO UPDATE SET username = excluded.username, roles_json = excluded.roles_json, enabled = excluded.enabled, requires_password_change = excluded.requires_password_change, cached_verified_at = excluded.cached_verified_at, failed_attempts = 0, locked_until = NULL",
            params![account.id.to_string(), account.username, roles, account.enabled as i64, account.requires_password_change as i64, unix_seconds(now)],
        ).map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn bootstrap_initial_administrator(
        &self,
        username: &str,
        password: &str,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if !valid_required_text(username, 255) || password.len() < 12 {
            return Err(AuthError::InvalidInput);
        }
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let initialized: i64 = connection.query_row(
            "SELECT (SELECT COUNT(*) FROM local_accounts) + (SELECT COUNT(*) FROM local_countries) + (SELECT COUNT(*) FROM local_projects) + (SELECT COUNT(*) FROM local_materials) + (SELECT COUNT(*) FROM local_suppliers) + (SELECT COUNT(*) FROM local_purchase_orders) + (SELECT COUNT(*) FROM local_sync_outbox)",
            [],
            |row| row.get(0),
        ).map_err(|_| AuthError::Database)?;
        drop(connection);
        if initialized != 0 {
            return Err(AuthError::Forbidden);
        }
        self.cache_verified_account(
            CachedAccount {
                id: Uuid::new_v4(),
                username: username.to_owned(),
                roles: vec![Role::Administrator],
                enabled: true,
                requires_password_change: false,
            },
            password,
            now,
        )
    }

    pub fn issue_captcha(&self, now: SystemTime) -> Result<CaptchaChallenge, AuthError> {
        let first = (Uuid::new_v4().as_u128() % 9 + 1) as u8;
        let second = (Uuid::new_v4().as_u128() % 9 + 1) as u8;
        let id = Uuid::new_v4();
        let expires_at = now + CAPTCHA_WINDOW;
        *self.captcha.lock().map_err(|_| AuthError::Database)? = Some(LocalCaptcha {
            id,
            answer: first + second,
            expires_at,
        });
        Ok(CaptchaChallenge {
            id,
            question: format!("{first} + {second} = ?"),
            expires_at_unix_seconds: unix_seconds(expires_at),
        })
    }

    fn consume_captcha(
        &self,
        captcha_id: Uuid,
        captcha_answer: u8,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        let captcha = self.captcha.lock().map_err(|_| AuthError::Database)?.take();
        if matches!(captcha, Some(challenge) if challenge.id == captcha_id && challenge.answer == captcha_answer && challenge.expires_at >= now)
        {
            Ok(())
        } else {
            Err(AuthError::InvalidCredentials)
        }
    }

    pub async fn issue_cloud_captcha(&self) -> Result<CloudCaptchaChallenge, AuthError> {
        let endpoint = cloud_auth_endpoint("captcha")?;
        let response = reqwest::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AuthError::SyncTransport)?
            .get(endpoint)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        response.json().await.map_err(|_| AuthError::SyncTransport)
    }

    pub async fn online_login(
        &self,
        username: &str,
        password: &str,
        local_captcha_id: Uuid,
        local_captcha_answer: u8,
        cloud_captcha_id: Uuid,
        cloud_captcha_answer: &str,
        now: SystemTime,
    ) -> Result<AuthenticatedSession, AuthError> {
        self.consume_captcha(local_captcha_id, local_captcha_answer, now)?;
        if !valid_required_text(username, 128)
            || password.is_empty()
            || password.len() > 1024
            || cloud_captcha_answer.len() > 4
            || !cloud_captcha_answer
                .bytes()
                .all(|byte| byte.is_ascii_digit())
        {
            return Err(AuthError::InvalidInput);
        }
        let installation_id: String = self
            .connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .query_row(
                "SELECT installation_id FROM local_sync_state WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        let endpoint = cloud_auth_endpoint("login")?;
        let response = reqwest::Client::builder().https_only(true).timeout(Duration::from_secs(20)).build().map_err(|_| AuthError::SyncTransport)?
            .post(endpoint).header("x-installation-id", installation_id)
            .json(&serde_json::json!({"username": username, "password": password, "captchaId": cloud_captcha_id, "captchaAnswer": cloud_captcha_answer}))
            .send().await.map_err(|_| AuthError::SyncTransport)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED
            || response.status() == reqwest::StatusCode::LOCKED
        {
            return Err(AuthError::InvalidCredentials);
        }
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        let login = response
            .json::<CloudLoginResponse>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        if login.user.username != username || login.access_token.len() < 32 {
            return Err(AuthError::SyncTransport);
        }
        self.cache_verified_account(
            CachedAccount {
                id: login.user.id,
                username: login.user.username.clone(),
                roles: login.user.roles.clone(),
                enabled: true,
                requires_password_change: login.user.requires_password_change,
            },
            password,
            now,
        )?;
        self.cache_sync_access_token(login.user.id, &login.access_token)?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        connection
            .execute("DELETE FROM local_session", [])
            .map_err(|_| AuthError::Database)?;
        connection.execute("INSERT INTO local_session (user_id, started_at, last_active_at) VALUES (?1, ?2, ?2)", params![login.user.id.to_string(), unix_seconds(now)]).map_err(|_| AuthError::Database)?;
        Ok(AuthenticatedSession {
            user_id: login.user.id,
            username: login.user.username,
            roles: login.user.roles,
            requires_password_change: login.user.requires_password_change,
        })
    }

    pub fn offline_login(
        &self,
        username: &str,
        password: &str,
        captcha_id: Uuid,
        captcha_answer: u8,
        now: SystemTime,
    ) -> Result<AuthenticatedSession, AuthError> {
        self.consume_captcha(captcha_id, captcha_answer, now)?;

        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let account = connection.query_row(
            "SELECT id, username, roles_json, enabled, requires_password_change, cached_verified_at, failed_attempts, locked_until FROM local_accounts WHERE username = ?1",
            [username],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, i64>(3)?, row.get::<_, i64>(4)?, row.get::<_, i64>(5)?, row.get::<_, i64>(6)?, row.get::<_, Option<i64>>(7)?)),
        ).optional().map_err(|_| AuthError::Database)?;
        let Some((
            id,
            username,
            roles_json,
            enabled,
            requires_password_change,
            cached_verified_at,
            failed_attempts,
            locked_until,
        )) = account
        else {
            return Err(AuthError::InvalidCredentials);
        };
        if enabled == 0 {
            return Err(AuthError::InvalidCredentials);
        }
        if locked_until.is_some_and(|value| value > unix_seconds(now)) {
            return Err(AuthError::AccountLocked);
        }
        if unix_seconds(now) - cached_verified_at > OFFLINE_LOGIN_WINDOW.as_secs() as i64 {
            return Err(AuthError::OfflineWindowExpired);
        }
        let account_id = Uuid::parse_str(&id).map_err(|_| AuthError::Database)?;
        let password_hash = self
            .credential_vault
            .load_verifier(account_id)?
            .ok_or(AuthError::InvalidCredentials)?;
        if !verify_password(&password_hash, password) {
            register_failure(&connection, &id, failed_attempts, now)?;
            return Err(AuthError::InvalidCredentials);
        }

        let roles =
            serde_json::from_str::<Vec<Role>>(&roles_json).map_err(|_| AuthError::Database)?;
        connection
            .execute(
                "UPDATE local_accounts SET failed_attempts = 0, locked_until = NULL WHERE id = ?1",
                [&id],
            )
            .map_err(|_| AuthError::Database)?;
        connection
            .execute("DELETE FROM local_session", [])
            .map_err(|_| AuthError::Database)?;
        connection.execute("INSERT INTO local_session (user_id, started_at, last_active_at) VALUES (?1, ?2, ?2)", params![id, unix_seconds(now)]).map_err(|_| AuthError::Database)?;
        Ok(AuthenticatedSession {
            user_id: account_id,
            username,
            roles,
            requires_password_change: requires_password_change != 0,
        })
    }

    pub fn require_role(&self, role: Role, now: SystemTime) -> Result<(), AuthError> {
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let session = connection.query_row("SELECT s.user_id, s.last_active_at, a.roles_json FROM local_session s JOIN local_accounts a ON a.id = s.user_id", [], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?))).optional().map_err(|_| AuthError::Database)?;
        let Some((user_id, last_active_at, roles_json)) = session else {
            return Err(AuthError::NoActiveSession);
        };
        if unix_seconds(now) - last_active_at > IDLE_LOCK_WINDOW.as_secs() as i64 {
            connection
                .execute("DELETE FROM local_session", [])
                .map_err(|_| AuthError::Database)?;
            return Err(AuthError::NoActiveSession);
        }
        let roles =
            serde_json::from_str::<Vec<Role>>(&roles_json).map_err(|_| AuthError::Database)?;
        if !roles.contains(&role) {
            return Err(AuthError::Forbidden);
        }
        connection
            .execute(
                "UPDATE local_session SET last_active_at = ?1 WHERE user_id = ?2",
                params![unix_seconds(now), user_id],
            )
            .map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn require_material_mutation(&self, now: SystemTime) -> Result<(), AuthError> {
        match self.require_role(Role::Purchaser, now) {
            Ok(()) => Ok(()),
            Err(AuthError::Forbidden) => self.require_role(Role::Administrator, now),
            Err(error) => Err(error),
        }?;
        self.require_active_scope_for_country(None, now)
    }

    fn require_conflict_resolution(&self, now: SystemTime) -> Result<(), AuthError> {
        match self.require_role(Role::Administrator, now) {
            Ok(()) => Ok(()),
            Err(AuthError::Forbidden) => self.require_role(Role::SuperAdministrator, now),
            Err(error) => Err(error),
        }
    }

    pub fn save_project_defaults(
        &self,
        defaults: ProjectDefaultsInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        validate_project_defaults(&defaults)?;
        self.require_master_data_mutation(now)?;
        let payload = serde_json::to_string(&defaults).map_err(|_| AuthError::InvalidInput)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        transaction
            .execute(
                "INSERT INTO local_project_print_defaults (project_id, department_title, company_address, company_contact, default_currency, default_language_pair, default_tax_template_id, version, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8)
                 ON CONFLICT(project_id) DO UPDATE SET department_title = excluded.department_title, company_address = excluded.company_address, company_contact = excluded.company_contact, default_currency = excluded.default_currency, default_language_pair = excluded.default_language_pair, default_tax_template_id = excluded.default_tax_template_id, version = local_project_print_defaults.version + 1, updated_at = excluded.updated_at",
                params![
                    defaults.project_id.to_string(),
                    defaults.department_title,
                    defaults.company_address,
                    defaults.company_contact,
                    defaults.default_currency,
                    defaults.default_language_pair,
                    defaults.default_tax_template_id.map(|value| value.to_string()),
                    unix_seconds(now)
                ],
            )
            .map_err(|_| AuthError::Database)?;
        insert_local_sync_outbox(
            &transaction,
            "project_defaults",
            defaults.project_id,
            &payload,
            now,
        )?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn list_reference_master_data(
        &self,
        now: SystemTime,
    ) -> Result<Vec<ReferenceMasterDataInput>, AuthError> {
        self.require_master_data_mutation(now)?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let mut records = Vec::new();
        let mut countries = connection.prepare("SELECT id, business_code, name, time_zone, is_active, version FROM local_countries WHERE deleted_at IS NULL ORDER BY name").map_err(|_| AuthError::Database)?;
        for row in countries
            .query_map([], |row| {
                Ok(ReferenceMasterDataInput::Country {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap(),
                    business_code: row.get(1)?,
                    name: row.get(2)?,
                    time_zone: row.get(3)?,
                    is_active: row.get::<_, i64>(4)? != 0,
                    version: row.get(5)?,
                })
            })
            .map_err(|_| AuthError::Database)?
        {
            records.push(row.map_err(|_| AuthError::Database)?);
        }
        let mut projects = connection.prepare("SELECT id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version FROM local_projects WHERE deleted_at IS NULL ORDER BY name").map_err(|_| AuthError::Database)?;
        for row in projects
            .query_map([], |row| {
                Ok(ReferenceMasterDataInput::Project {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap(),
                    country_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap(),
                    business_code: row.get(2)?,
                    name: row.get(3)?,
                    site: row.get(4)?,
                    department_name: row.get(5)?,
                    default_currency: row.get(6)?,
                    default_language_pair: row.get(7)?,
                    is_active: row.get::<_, i64>(8)? != 0,
                    version: row.get(9)?,
                })
            })
            .map_err(|_| AuthError::Database)?
        {
            records.push(row.map_err(|_| AuthError::Database)?);
        }
        let mut sites = connection.prepare("SELECT id, project_id, business_code, name, is_active, version FROM local_sites WHERE deleted_at IS NULL ORDER BY name").map_err(|_| AuthError::Database)?;
        for row in sites
            .query_map([], |row| {
                Ok(ReferenceMasterDataInput::Site {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap(),
                    project_id: Uuid::parse_str(&row.get::<_, String>(1)?).unwrap(),
                    business_code: row.get(2)?,
                    name: row.get(3)?,
                    is_active: row.get::<_, i64>(4)? != 0,
                    version: row.get(5)?,
                })
            })
            .map_err(|_| AuthError::Database)?
        {
            records.push(row.map_err(|_| AuthError::Database)?);
        }
        Ok(records)
    }

    pub fn list_project_defaults(
        &self,
        now: SystemTime,
    ) -> Result<Vec<ProjectDefaultsView>, AuthError> {
        self.require_master_data_mutation(now)?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let mut statement = connection
            .prepare(
                "SELECT p.id, p.name, p.site, d.department_title, d.company_address, d.company_contact,
                        COALESCE(d.default_currency, p.default_currency), COALESCE(d.default_language_pair, p.default_language_pair),
                        d.default_tax_template_id, t.name
                 FROM local_projects p
                 LEFT JOIN local_project_print_defaults d ON d.project_id = p.id
                 LEFT JOIN local_tax_templates t ON t.id = d.default_tax_template_id AND t.deleted_at IS NULL
                 WHERE p.is_active = 1 AND p.deleted_at IS NULL
                 ORDER BY p.name",
            )
            .map_err(|_| AuthError::Database)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            })
            .map_err(|_| AuthError::Database)?;
        rows.map(|row| {
            let (
                project_id,
                project_name,
                site,
                department_title,
                company_address,
                company_contact,
                default_currency,
                default_language_pair,
                default_tax_template_id,
                tax_template_name,
            ) = row.map_err(|_| AuthError::Database)?;
            Ok(ProjectDefaultsView {
                project_id: Uuid::parse_str(&project_id).map_err(|_| AuthError::Database)?,
                project_name,
                site,
                department_title,
                company_address,
                company_contact,
                default_currency,
                default_language_pair,
                default_tax_template_id: default_tax_template_id
                    .map(|value| Uuid::parse_str(&value).map_err(|_| AuthError::Database))
                    .transpose()?,
                tax_template_name,
            })
        })
        .collect()
    }

    pub fn save_reference_master_data(
        &self,
        record: ReferenceMasterDataInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_master_data_mutation(now)?;
        let actor_id = self.active_session_user_id()?;
        let (entity_type, entity_id) = match &record {
            ReferenceMasterDataInput::Country { id, .. } => ("country", *id),
            ReferenceMasterDataInput::Project { id, .. } => ("project", *id),
            ReferenceMasterDataInput::Site { id, .. } => ("site", *id),
            ReferenceMasterDataInput::Department { id, .. } => ("department", *id),
            ReferenceMasterDataInput::Team { id, .. } => ("team", *id),
            ReferenceMasterDataInput::Unit { id, .. } => ("unit", *id),
        };
        let payload = serde_json::to_string(&record).map_err(|_| AuthError::InvalidInput)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let audit_prior_active = match entity_type {
            "country" => transaction
                .query_row(
                    "SELECT is_active FROM local_countries WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|_| AuthError::Database)?,
            "project" => transaction
                .query_row(
                    "SELECT is_active FROM local_projects WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|_| AuthError::Database)?,
            "site" => transaction
                .query_row(
                    "SELECT is_active FROM local_sites WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|_| AuthError::Database)?,
            _ => None,
        };
        let audit_next_active = match &record {
            ReferenceMasterDataInput::Country { is_active, .. }
            | ReferenceMasterDataInput::Project { is_active, .. }
            | ReferenceMasterDataInput::Site { is_active, .. } => Some(*is_active),
            _ => None,
        };
        match record {
            ReferenceMasterDataInput::Country {
                id,
                business_code,
                name,
                time_zone,
                is_active,
                version,
            } => {
                validate_reference(&business_code, &name, version)?;
                assert_immutable_local_business_code(
                    &transaction,
                    "local_countries",
                    id,
                    &business_code,
                )?;
                transaction.execute("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET name = excluded.name, time_zone = excluded.time_zone, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), business_code, name, time_zone, is_active as i64, version]).map_err(|_| AuthError::Database)?;
            }
            ReferenceMasterDataInput::Project {
                id,
                country_id,
                business_code,
                name,
                site,
                department_name,
                default_currency,
                default_language_pair,
                is_active,
                version,
            } => {
                validate_reference(&business_code, &name, version)?;
                assert_immutable_local_business_code(
                    &transaction,
                    "local_projects",
                    id,
                    &business_code,
                )?;
                if site.trim().is_empty()
                    || department_name.trim().is_empty()
                    || !matches!(default_currency.as_str(), "XOF" | "CNY" | "USD" | "EUR")
                    || !matches!(default_language_pair.as_str(), "zh_fr" | "zh_en")
                {
                    return Err(AuthError::InvalidInput);
                }
                let country_changed_after_business_use: bool = transaction
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM local_projects p WHERE p.id = ?1 AND p.country_id <> ?2 AND EXISTS (SELECT 1 FROM local_purchase_orders o WHERE o.project_id = p.id AND o.deleted_at IS NULL))",
                        params![id.to_string(), country_id.to_string()],
                        |row| row.get(0),
                    )
                    .map_err(|_| AuthError::Database)?;
                if country_changed_after_business_use {
                    return Err(AuthError::InvalidInput);
                }
                transaction.execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT(id) DO UPDATE SET country_id = excluded.country_id, name = excluded.name, site = excluded.site, department_name = excluded.department_name, default_currency = excluded.default_currency, default_language_pair = excluded.default_language_pair, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), country_id.to_string(), business_code, name, site, department_name, default_currency, default_language_pair, is_active as i64, version]).map_err(|_| AuthError::Database)?;
            }
            ReferenceMasterDataInput::Site {
                id,
                project_id,
                business_code,
                name,
                is_active,
                version,
            } => {
                validate_reference(&business_code, &name, version)?;
                assert_immutable_local_business_code(
                    &transaction,
                    "local_sites",
                    id,
                    &business_code,
                )?;
                transaction.execute("INSERT INTO local_sites (id, project_id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), project_id.to_string(), business_code, name, is_active as i64, version]).map_err(|_| AuthError::Database)?;
            }
            ReferenceMasterDataInput::Department {
                id,
                business_code,
                name,
                is_active,
                version,
            } => {
                validate_reference(&business_code, &name, version)?;
                assert_immutable_local_business_code(
                    &transaction,
                    "local_departments",
                    id,
                    &business_code,
                )?;
                transaction.execute("INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), business_code, name, is_active as i64, version]).map_err(|_| AuthError::Database)?;
            }
            ReferenceMasterDataInput::Team {
                id,
                department_id,
                business_code,
                name,
                is_active,
                version,
            } => {
                validate_reference(&business_code, &name, version)?;
                assert_immutable_local_business_code(
                    &transaction,
                    "local_teams",
                    id,
                    &business_code,
                )?;
                transaction.execute("INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET department_id = excluded.department_id, name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), department_id.to_string(), business_code, name, is_active as i64, version]).map_err(|_| AuthError::Database)?;
            }
            ReferenceMasterDataInput::Unit {
                id,
                business_code,
                name,
                is_active,
                version,
            } => {
                validate_reference(&business_code, &name, version)?;
                assert_immutable_local_business_code(
                    &transaction,
                    "local_units",
                    id,
                    &business_code,
                )?;
                transaction.execute("INSERT INTO local_units (id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), business_code, name, is_active as i64, version]).map_err(|_| AuthError::Database)?;
            }
        }
        if matches!(entity_type, "country" | "project" | "site") {
            let action = match (audit_prior_active, audit_next_active) {
                (None, _) => "create",
                (Some(0), Some(true)) => "enable",
                (Some(1), Some(false)) => "disable",
                _ => "edit",
            };
            transaction.execute(
                "INSERT INTO local_master_data_audit_entries (id, actor_id, entity_type, entity_id, action, next_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![Uuid::new_v4().to_string(), actor_id.to_string(), entity_type, entity_id.to_string(), action, payload, unix_seconds(now)],
            ).map_err(|_| AuthError::Database)?;
        }
        insert_local_sync_outbox(&transaction, entity_type, entity_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn save_tax_template(
        &self,
        template: TaxTemplateInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_master_data_mutation(now)?;
        validate_reference(&template.business_code, &template.name, template.version)?;
        if template.rate_basis_points < 0
            || template.rate_basis_points > 100_000
            || !valid_iso_date(&template.effective_at)
        {
            return Err(AuthError::InvalidInput);
        }
        let payload = serde_json::to_string(&template).map_err(|_| AuthError::InvalidInput)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        assert_immutable_local_business_code(
            &transaction,
            "local_tax_templates",
            template.id,
            &template.business_code,
        )?;
        transaction
            .execute(
                "INSERT INTO local_tax_templates (id, business_code, name, country_id, rate_basis_points, effective_at, is_active, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, country_id = excluded.country_id, rate_basis_points = excluded.rate_basis_points, effective_at = excluded.effective_at, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL",
                params![template.id.to_string(), template.business_code, template.name, template.country_id.map(|value| value.to_string()), template.rate_basis_points, template.effective_at, template.is_active as i64, template.version],
            )
            .map_err(|_| AuthError::Database)?;
        insert_local_sync_outbox(&transaction, "tax_template", template.id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn save_exchange_rate(
        &self,
        rate: ExchangeRateInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_master_data_mutation(now)?;
        if !valid_currency(&rate.from_currency)
            || !valid_currency(&rate.to_currency)
            || !valid_decimal_rate(&rate.rate_decimal)
            || !valid_iso_date(&rate.effective_at)
            || rate.version < 1
            || !matches!(rate.source.as_str(), "public_daily" | "manual")
            || (rate.source == "manual"
                && rate
                    .reason
                    .as_ref()
                    .is_none_or(|value| value.trim().is_empty() || value.len() > 1000))
            || rate.reason.as_ref().is_some_and(|value| value.len() > 1000)
        {
            return Err(AuthError::InvalidInput);
        }
        let payload = serde_json::to_string(&rate).map_err(|_| AuthError::InvalidInput)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        transaction
            .execute(
                "INSERT INTO local_exchange_rates (id, from_currency, to_currency, rate_decimal, effective_at, source, reason, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![rate.id.to_string(), rate.from_currency, rate.to_currency, rate.rate_decimal, rate.effective_at, rate.source, rate.reason, rate.version],
            )
            .map_err(|_| AuthError::Database)?;
        insert_local_sync_outbox(&transaction, "exchange_rate", rate.id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn save_material(&self, material: MaterialInput, now: SystemTime) -> Result<(), AuthError> {
        self.require_material_mutation(now)?;
        validate_material(&material)?;
        let aliases =
            serde_json::to_string(&material.aliases).map_err(|_| AuthError::InvalidInput)?;
        let payload = serde_json::to_string(&material).map_err(|_| AuthError::InvalidInput)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        transaction
            .execute(
                "INSERT INTO local_materials (id, sku, category_id, name_zh, name_fr, aliases_json, brand, model, specification, unit, notes, is_active, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(id) DO UPDATE SET sku = excluded.sku, name_zh = excluded.name_zh, name_fr = excluded.name_fr,
                   category_id = excluded.category_id, aliases_json = excluded.aliases_json, brand = excluded.brand, model = excluded.model,
                   specification = excluded.specification, unit = excluded.unit, notes = excluded.notes,
                   is_active = excluded.is_active, version = excluded.version, deleted_at = NULL",
                params![material.id.to_string(), material.sku, material.category_id.map(|value| value.to_string()), material.name_zh, material.name_fr, aliases, material.brand, material.model, material.specification, material.unit, material.notes, material.is_active as i64, material.version],
            )
            .map_err(|_| AuthError::Database)?;
        insert_local_sync_outbox(&transaction, "material", material.id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn save_supplier(&self, supplier: SupplierInput, now: SystemTime) -> Result<(), AuthError> {
        self.require_material_mutation(now)?;
        validate_supplier(&supplier)?;
        let country_id = supplier.country_id.ok_or(AuthError::InvalidInput)?;
        self.require_active_scope_for_country(Some(country_id), now)?;
        let payload = serde_json::to_string(&supplier).map_err(|_| AuthError::InvalidInput)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        assert_immutable_local_business_code(
            &transaction,
            "local_suppliers",
            supplier.id,
            &supplier.business_code,
        )?;
        let country_is_active: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_countries WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL)",
                [country_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        let prior_country_id: Option<String> = transaction
            .query_row(
                "SELECT country_id FROM local_suppliers WHERE id = ?1 AND deleted_at IS NULL",
                [supplier.id.to_string()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?
            .flatten();
        if !country_is_active
            || prior_country_id
                .as_deref()
                .is_some_and(|value| value != country_id.to_string())
        {
            return Err(AuthError::InvalidInput);
        }
        transaction
            .execute(
                "INSERT INTO local_suppliers (id, business_code, name, country_id, contact_name, address, city, country, phone, whatsapp, email, payment_terms, delivery_lead_time, is_preferred, is_blacklisted, is_active, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, contact_name = excluded.contact_name,
                   country_id = COALESCE(local_suppliers.country_id, excluded.country_id), address = excluded.address, city = excluded.city, country = excluded.country, phone = excluded.phone,
                   whatsapp = excluded.whatsapp, email = excluded.email, payment_terms = excluded.payment_terms,
                   delivery_lead_time = excluded.delivery_lead_time, is_preferred = excluded.is_preferred,
                   is_blacklisted = excluded.is_blacklisted, is_active = excluded.is_active, version = excluded.version,
                   deleted_at = NULL",
                params![supplier.id.to_string(), supplier.business_code, supplier.name, country_id.to_string(), supplier.contact_name, supplier.address, supplier.city, supplier.country, supplier.phone, supplier.whatsapp, supplier.email, supplier.payment_terms, supplier.delivery_lead_time, supplier.is_preferred as i64, supplier.is_blacklisted as i64, supplier.is_active as i64, supplier.version],
            )
            .map_err(|_| AuthError::Database)?;
        insert_local_sync_outbox(&transaction, "supplier", supplier.id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn add_material_price(
        &self,
        price: MaterialPriceInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_material_mutation(now)?;
        let supplier_country_id: Option<String> = self
            .connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .query_row(
                "SELECT country_id FROM local_suppliers WHERE id = ?1 AND deleted_at IS NULL",
                [price.supplier_id.to_string()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?
            .flatten();
        let supplier_country_id = supplier_country_id
            .ok_or(AuthError::InvalidInput)
            .and_then(|value| Uuid::parse_str(&value).map_err(|_| AuthError::Database))?;
        self.require_active_scope_for_country(Some(supplier_country_id), now)?;
        let unit_price_minor = validate_material_price(&price)?;
        let payload = serde_json::to_string(&price).map_err(|_| AuthError::InvalidInput)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let material_is_active: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_materials WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL)",
                [price.material_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        let supplier_is_active: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_suppliers WHERE id = ?1 AND country_id IS NOT NULL AND is_active = 1 AND deleted_at IS NULL)",
                [price.supplier_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if !material_is_active || !supplier_is_active {
            return Err(AuthError::InvalidInput);
        }
        transaction
            .execute(
                "UPDATE local_material_prices SET is_active = 0
                 WHERE material_id = ?1 AND supplier_id = ?2 AND currency = ?3 AND is_active = 1 AND deleted_at IS NULL",
                params![price.material_id.to_string(), price.supplier_id.to_string(), price.currency],
            )
            .map_err(|_| AuthError::Database)?;
        transaction
            .execute(
                "INSERT INTO local_material_prices (id, material_id, supplier_id, currency, unit_price_minor, unit, effective_at, source_note, is_active, version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
                params![price.id.to_string(), price.material_id.to_string(), price.supplier_id.to_string(), price.currency, unit_price_minor, price.unit, price.effective_at, price.source_note, price.version],
            )
            .map_err(|_| AuthError::Database)?;
        insert_local_sync_outbox(&transaction, "material_price", price.id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn save_material_image(
        &self,
        image: MaterialImageInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_material_mutation(now)?;
        if image.source_file_name.trim().is_empty()
            || image.source_file_name.len() > 255
            || image.crop_json.len() > 10_000
            || serde_json::from_str::<serde_json::Value>(&image.crop_json).is_err()
        {
            return Err(AuthError::InvalidInput);
        }
        let source = decode_material_image(&image.source_base64)?;
        let square = decode_material_image(&image.square_crop_base64)?;
        if !square.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err(AuthError::InvalidInput);
        }
        fs::create_dir_all(&self.media_directory).map_err(|_| AuthError::Database)?;
        let source_path = self.media_directory.join(format!("{}-source", image.id));
        let square_path = self
            .media_directory
            .join(format!("{}-square.png", image.id));
        fs::write(&source_path, source).map_err(|_| AuthError::Database)?;
        if let Err(error) = fs::write(&square_path, square) {
            let _ = fs::remove_file(&source_path);
            return Err(match error.kind() {
                std::io::ErrorKind::InvalidInput => AuthError::InvalidInput,
                _ => AuthError::Database,
            });
        }
        let result = (|| {
            let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
            let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
            let material_exists: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM local_materials WHERE id = ?1 AND deleted_at IS NULL)",
                    [image.material_id.to_string()],
                    |row| row.get(0),
                )
                .map_err(|_| AuthError::Database)?;
            if !material_exists {
                return Err(AuthError::InvalidInput);
            }
            transaction
                .execute(
                    "UPDATE local_material_images SET deleted_at = ?1 WHERE material_id = ?2 AND deleted_at IS NULL",
                    params![unix_seconds(now), image.material_id.to_string()],
                )
                .map_err(|_| AuthError::Database)?;
            transaction
                .execute(
                    "INSERT INTO local_material_images (id, material_id, source_path, square_crop_path, crop_json, created_at, source_file_name)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![image.id.to_string(), image.material_id.to_string(), source_path.to_string_lossy(), square_path.to_string_lossy(), image.crop_json, unix_seconds(now), image.source_file_name],
                )
                .map_err(|_| AuthError::Database)?;
            transaction.commit().map_err(|_| AuthError::Database)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&source_path);
            let _ = fs::remove_file(&square_path);
        }
        result
    }

    pub fn get_material_square_image(
        &self,
        material_id: Uuid,
        now: SystemTime,
    ) -> Result<Option<String>, AuthError> {
        self.require_catalog_read(now)?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let path = connection
            .query_row(
                "SELECT square_crop_path FROM local_material_images
                 WHERE material_id = ?1 AND deleted_at IS NULL
                 ORDER BY created_at DESC LIMIT 1",
                [material_id.to_string()],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        path.map(|path| {
            let bytes = fs::read(path).map_err(|_| AuthError::Database)?;
            if bytes.len() > MAX_MATERIAL_IMAGE_BYTES || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
                return Err(AuthError::Database);
            }
            Ok(format!("data:image/png;base64,{}", BASE64.encode(bytes)))
        })
        .transpose()
    }

    pub fn save_requisition_draft(
        &self,
        draft: RequisitionDraftInput,
        now: SystemTime,
    ) -> Result<RequisitionTotalsView, AuthError> {
        self.save_requisition(draft, None, now)
    }

    pub fn revise_confirmed_requisition(
        &self,
        draft: RequisitionDraftInput,
        reason: String,
        now: SystemTime,
    ) -> Result<RequisitionTotalsView, AuthError> {
        self.save_requisition(draft, Some(reason), now)
    }

    pub fn list_requisition_history(
        &self,
        cursor: Option<RequisitionHistoryCursor>,
        filter: RequisitionHistoryFilter,
        now: SystemTime,
    ) -> Result<RequisitionHistoryPageView, AuthError> {
        self.require_catalog_read(now)?;
        let query = filter
            .query
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if query
            .as_ref()
            .is_some_and(|value| value.chars().count() > 100)
            || filter.workflow_status.as_deref().is_some_and(|value| {
                !matches!(
                    value,
                    "draft"
                        | "pending_confirmation"
                        | "rejected"
                        | "confirmed"
                        | "approved"
                        | "formally_issued"
                        | "executing"
                        | "receiving"
                        | "completed"
                        | "completed_with_conditions"
                        | "cancelled"
                )
            })
        {
            return Err(AuthError::InvalidInput);
        }
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let cursor_at = cursor.as_ref().map(|value| value.updated_at);
        let cursor_id = cursor.as_ref().map(|value| value.id.to_string());
        let mut statement = connection.prepare(
            "SELECT o.id, o.display_no, p.name, o.site, o.workflow_status, o.procurement_mode, o.primary_currency, o.total_minor, o.updated_at
             FROM local_purchase_orders o
             JOIN local_authorization_snapshots a ON a.account_id = ?1 AND a.project_id = o.project_id AND a.department_id = o.department_id AND a.team_id = o.team_id
             JOIN local_projects p ON p.id = o.project_id
             WHERE o.parent_order_id IS NULL AND o.deleted_at IS NULL
               AND (?2 IS NULL OR o.updated_at < ?2 OR (o.updated_at = ?2 AND o.id < ?3))
               AND (?4 IS NULL OR instr(lower(o.display_no), lower(?4)) > 0 OR instr(lower(p.name), lower(?4)) > 0 OR instr(lower(o.site), lower(?4)) > 0)
               AND (?5 IS NULL OR o.workflow_status = ?5)
               AND (?6 IS NULL OR o.project_id = ?6)
             ORDER BY o.updated_at DESC, o.id DESC LIMIT 51"
        ).map_err(|_| AuthError::Database)?;
        let mut records = statement
            .query_map(
                params![
                    account_id.to_string(),
                    cursor_at,
                    cursor_id,
                    query,
                    filter.workflow_status,
                    filter.project_id.map(|value| value.to_string())
                ],
                |row| {
                    Ok(RequisitionHistoryView {
                        id: Uuid::parse_str(&row.get::<_, String>(0)?)
                            .map_err(|_| rusqlite::Error::InvalidQuery)?,
                        display_no: row.get(1)?,
                        project_name: row.get(2)?,
                        site: row.get(3)?,
                        workflow_status: row.get(4)?,
                        procurement_mode: row.get(5)?,
                        primary_currency: row.get(6)?,
                        total_minor: row.get::<_, i64>(7)?.to_string(),
                        updated_at: row.get(8)?,
                    })
                },
            )
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        let has_more = records.len() > 50;
        records.truncate(50);
        let next_cursor = if has_more {
            records.last().map(|record| RequisitionHistoryCursor {
                updated_at: record.updated_at,
                id: record.id,
            })
        } else {
            None
        };
        Ok(RequisitionHistoryPageView {
            records,
            next_cursor,
        })
    }

    pub fn get_requisition_detail(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<RequisitionDetailView, AuthError> {
        let audits = self.list_order_audits(order_id, now)?;
        let connection = self.historical_order_connection(order_id, now)?;
        let (display_no, applicant_id, project_name, project_id, site, workflow_status, procurement_mode, order_date, delivery_address, expected_delivery_date, notes, primary_currency, total_minor) = connection.query_row(
            "SELECT o.display_no, o.applicant_id, p.name, o.project_id, o.site, o.workflow_status, o.procurement_mode, o.order_date, o.delivery_address, o.expected_delivery_date, o.notes, o.primary_currency, o.total_minor FROM local_purchase_orders o JOIN local_projects p ON p.id = o.project_id WHERE o.id = ?1 AND o.parent_order_id IS NULL AND o.deleted_at IS NULL",
            [order_id.to_string()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?, row.get::<_, Option<String>>(6)?, row.get::<_, String>(7)?, row.get::<_, String>(8)?, row.get::<_, Option<String>>(9)?, row.get::<_, Option<String>>(10)?, row.get::<_, String>(11)?, row.get::<_, i64>(12)?)),
        ).optional().map_err(|_| AuthError::Database)?.ok_or(AuthError::Forbidden)?;
        let lines = connection.prepare(
            "SELECT material_snapshot_json, quantity_decimal, unit, currency, unit_price_minor, line_total_minor FROM local_purchase_order_items WHERE order_id = ?1 ORDER BY sort_order, id"
        ).map_err(|_| AuthError::Database)?
            .query_map([order_id.to_string()], |row| {
                let snapshot: serde_json::Value = serde_json::from_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?;
                let field = |key: &str| snapshot.get(key).and_then(|value| value.as_str()).unwrap_or("").to_string();
                Ok(RequisitionDetailLineView {
                    material_name: field("nameZh"), model: field("model"), specification: field("specification"),
                    quantity: row.get(1)?, unit: row.get(2)?, currency: row.get(3)?,
                    unit_price_minor: row.get::<_, i64>(4)?.to_string(), line_total_minor: row.get::<_, i64>(5)?.to_string(),
                })
            }).map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)?;
        let attachments = connection.prepare(
            "SELECT id, original_name, content_type, byte_length, upload_state FROM local_order_attachments WHERE order_id = ?1 AND deleted_at IS NULL ORDER BY created_at, id"
        ).map_err(|_| AuthError::Database)?
            .query_map([order_id.to_string()], |row| Ok(RequisitionAttachmentView {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                original_name: row.get(1)?, content_type: row.get(2)?, byte_length: row.get(3)?, upload_state: row.get(4)?,
            })).map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)?;
        Ok(RequisitionDetailView {
            id: order_id,
            display_no,
            applicant_id: Uuid::parse_str(&applicant_id).map_err(|_| AuthError::Database)?,
            project_name,
            project_id: Uuid::parse_str(&project_id).map_err(|_| AuthError::Database)?,
            site,
            workflow_status,
            procurement_mode,
            order_date,
            delivery_address,
            expected_delivery_date,
            notes,
            primary_currency,
            total_minor: total_minor.to_string(),
            lines,
            attachments,
            audits,
        })
    }

    pub fn list_confirmed_procurement_orders(
        &self,
        now: SystemTime,
    ) -> Result<Vec<ProcurementExecutionOrderView>, AuthError> {
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let parents = connection
            .prepare("SELECT o.id, o.display_no, o.primary_currency, o.procurement_mode, o.workflow_status FROM local_purchase_orders o JOIN local_authorization_snapshots a ON a.account_id = ?1 AND a.project_id = o.project_id AND a.department_id = o.department_id AND a.team_id = o.team_id AND a.expires_at >= ?2 JOIN local_projects p ON p.id = o.project_id AND p.is_active = 1 AND p.deleted_at IS NULL JOIN local_departments d ON d.id = o.department_id AND d.is_active = 1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id = o.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL WHERE o.parent_order_id IS NULL AND o.workflow_status IN ('confirmed', 'approved', 'executing', 'receiving', 'completed', 'completed_with_conditions') AND (o.procurement_mode = 'honsen_self_purchase' OR o.procurement_mode IS NULL) AND o.deleted_at IS NULL ORDER BY o.updated_at DESC, o.id")
            .map_err(|_| AuthError::Database)?
            .query_map(params![account_id.to_string(), unix_seconds(now)], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, String>(4)?)))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        let read_lines = |order_id: &str| -> Result<Vec<ProcurementExecutionLineView>, AuthError> {
            connection
                .prepare("SELECT id, material_snapshot_json, quantity_decimal, unit, currency FROM local_purchase_order_items WHERE order_id = ?1 ORDER BY sort_order, id")
                .map_err(|_| AuthError::Database)?
                .query_map([order_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?)))
                .map_err(|_| AuthError::Database)?
                .map(|row| {
                    let (id, snapshot, quantity, unit, currency) = row.map_err(|_| AuthError::Database)?;
                    let material_name = serde_json::from_str::<serde_json::Value>(&snapshot)
                        .ok()
                        .and_then(|value| value.get("nameZh").and_then(|name| name.as_str()).map(ToOwned::to_owned))
                        .ok_or(AuthError::Database)?;
                    Ok(ProcurementExecutionLineView { id: Uuid::parse_str(&id).map_err(|_| AuthError::Database)?, material_name, quantity, unit, currency })
                })
                .collect::<Result<Vec<_>, _>>()
        };
        parents
            .into_iter()
            .map(|(id, display_no, primary_currency, procurement_mode, workflow_status)| {
                let children = connection
                    .prepare("SELECT id, display_no, currency, workflow_status FROM local_purchase_orders WHERE parent_order_id = ?1 AND deleted_at IS NULL ORDER BY created_at, id")
                    .map_err(|_| AuthError::Database)?
                    .query_map([&id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)))
                    .map_err(|_| AuthError::Database)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|_| AuthError::Database)?
                    .into_iter()
                    .map(|(child_id, child_display_no, currency, workflow_status)| Ok(ProcurementExecutionChildView { id: Uuid::parse_str(&child_id).map_err(|_| AuthError::Database)?, display_no: child_display_no, currency, workflow_status, lines: read_lines(&child_id)? }))
                    .collect::<Result<Vec<_>, AuthError>>()?;
                Ok(ProcurementExecutionOrderView { id: Uuid::parse_str(&id).map_err(|_| AuthError::Database)?, display_no, primary_currency, procurement_mode, workflow_status, lines: read_lines(&id)?, children })
            })
            .collect()
    }

    pub fn start_honsen_market_execution(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(order_id, now)?;
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let previous_status: String = transaction
            .query_row(
                "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
                [order_id.to_string()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?
            .ok_or(AuthError::Forbidden)?;
        let changed = transaction.execute(
            "UPDATE local_purchase_orders SET workflow_status = 'executing', version = version + 1, updated_at = ?2 WHERE id = ?1 AND parent_order_id IS NULL AND procurement_mode = 'honsen_self_purchase' AND workflow_status IN ('confirmed', 'approved') AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM local_purchase_orders child WHERE child.parent_order_id = ?1 AND child.deleted_at IS NULL)",
            params![order_id.to_string(), unix_seconds(now)],
        ).map_err(|_| AuthError::Database)?;
        if changed != 1 {
            return Err(AuthError::Forbidden);
        }
        append_order_audit(
            &transaction,
            order_id,
            actor_id,
            "market_execution_started",
            None,
            Some(&previous_status),
            Some("executing"),
            now,
        )?;
        let payload = order_sync_payload(&transaction, order_id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", order_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn save_owner_purchase_pricing(
        &self,
        input: OwnerPurchasePricingInput,
        now: SystemTime,
    ) -> Result<Vec<OwnerLinePricingView>, AuthError> {
        let privileged = self.require_order_mutation(now)?;
        self.require_active_scope_for_order(input.order_id, now)?;
        if input.lines.is_empty() || input.lines.len() > 500 {
            return Err(AuthError::Forbidden);
        }
        let actor_id = self.active_session_user_id()?;
        let mut seen = HashSet::new();
        if input
            .lines
            .iter()
            .any(|line| !seen.insert(line.order_item_id))
        {
            return Err(AuthError::InvalidInput);
        }
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (country_id, primary_currency, workflow_status, child_count, order_date, applicant_id): (String, String, String, i64, String, String) = transaction
            .query_row(
                "SELECT country_id, primary_currency, workflow_status, (SELECT COUNT(*) FROM local_purchase_orders child WHERE child.parent_order_id = local_purchase_orders.id AND child.deleted_at IS NULL), order_date, applicant_id FROM local_purchase_orders WHERE id = ?1 AND parent_order_id IS NULL AND deleted_at IS NULL",
                [input.order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .map_err(|_| AuthError::Database)?;
        if child_count != 0
            || !matches!(workflow_status.as_str(), "draft" | "confirmed")
            || (!privileged && (workflow_status != "draft" || applicant_id != actor_id.to_string()))
        {
            return Err(AuthError::Forbidden);
        }
        let previous = order_audit_snapshot(&transaction, input.order_id)?;
        let has_pricing: i64 = transaction
            .query_row("SELECT COUNT(*) FROM local_purchase_order_items WHERE order_id = ?1 AND owner_quote_source IS NOT NULL", [input.order_id.to_string()], |row| row.get(0))
            .map_err(|_| AuthError::Database)?;
        let has_pricing_audit: i64 = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_order_audit_entries WHERE order_id = ?1 AND action = 'owner_pricing_saved')",
                [input.order_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if (has_pricing != 0 || has_pricing_audit != 0)
            && !input
                .revision_reason
                .as_ref()
                .is_some_and(|reason| valid_required_text(reason, 1000))
        {
            return Err(AuthError::InvalidInput);
        }
        let item_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM local_purchase_order_items WHERE order_id = ?1",
                [input.order_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if item_count != input.lines.len() as i64 {
            return Err(AuthError::InvalidInput);
        }
        let mut views = Vec::with_capacity(input.lines.len());
        for line in input.lines {
            validate_adjustment(&line.markup)?;
            let (material_id, currency): (Option<String>, String) = transaction
                .query_row("SELECT material_id, currency FROM local_purchase_order_items WHERE id = ?1 AND order_id = ?2", params![line.order_item_id.to_string(), input.order_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|_| AuthError::InvalidInput)?;
            let (quote_source, catalog_price_id, source_unit_price, manual_reason, supplier) =
                match line.quote_source {
                    OwnerQuoteSourceInput::CatalogPrice { material_price_id } => {
                        let material_id = material_id.ok_or(AuthError::InvalidInput)?;
                        let price: (i64, String, String, String) = transaction
                        .query_row("SELECT p.unit_price_minor, p.currency, s.id, s.name FROM local_material_prices p JOIN local_suppliers s ON s.id = p.supplier_id WHERE p.id = ?1 AND p.material_id = ?2 AND p.is_active = 1 AND p.deleted_at IS NULL AND s.country_id = ?3 AND s.is_active = 1 AND s.is_blacklisted = 0 AND s.deleted_at IS NULL", params![material_price_id.to_string(), material_id, country_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
                        .map_err(|_| AuthError::InvalidInput)?;
                        if price.1 != currency {
                            return Err(AuthError::InvalidInput);
                        }
                        (
                            "catalog_price",
                            Some(material_price_id),
                            price.0,
                            None,
                            Some((price.2, price.3)),
                        )
                    }
                    OwnerQuoteSourceInput::ManualReference {
                        unit_price_minor,
                        reason,
                    } => {
                        if !valid_required_text(&reason, 1000) {
                            return Err(AuthError::InvalidInput);
                        }
                        (
                            "manual_reference",
                            None,
                            as_i64(parse_non_negative_minor(&unit_price_minor)?)?,
                            Some(reason),
                            None,
                        )
                    }
                };
            if !valid_non_zero_decimal_rate(&line.locked_exchange_rate_decimal)
                || (currency == primary_currency && line.locked_exchange_rate_decimal != "1")
            {
                return Err(AuthError::InvalidInput);
            }
            if currency != primary_currency {
                let rate_exists = transaction.query_row(
                    "SELECT EXISTS(SELECT 1 FROM local_exchange_rates WHERE from_currency = ?1 AND to_currency = ?2 AND rate_decimal = ?3 AND effective_at <= ?4 AND deleted_at IS NULL)",
                    params![currency, primary_currency, line.locked_exchange_rate_decimal, order_date],
                    |row| row.get::<_, i64>(0),
                ).map_err(|_| AuthError::Database)? != 0;
                if !rate_exists {
                    return Err(AuthError::InvalidInput);
                }
            }
            let converted = convert_minor_by_rate(
                source_unit_price,
                &currency,
                &primary_currency,
                &line.locked_exchange_rate_decimal,
            )?;
            let markup = as_i64(adjustment_amount(
                i128::from(converted),
                &line.markup,
                false,
            )?)?;
            let final_unit = converted
                .checked_add(markup)
                .ok_or(AuthError::InvalidInput)?;
            let markup_json =
                serde_json::to_string(&line.markup).map_err(|_| AuthError::InvalidInput)?;
            let manual_actor = manual_reason.as_ref().map(|_| actor_id.to_string());
            let manual_at = manual_reason.as_ref().map(|_| unix_seconds(now));
            let supplier_snapshot = supplier
                .as_ref()
                .map(|(id, name)| serde_json::json!({ "id": id, "name": name }).to_string());
            transaction.execute(
                "UPDATE local_purchase_order_items SET supplier_snapshot_json = ?2, owner_quote_source = ?3, owner_catalog_price_id = ?4, owner_manual_reference_reason = ?5, owner_manual_reference_actor_id = ?6, owner_manual_reference_at = ?7, owner_source_unit_price_minor = ?8, owner_locked_exchange_rate_decimal = ?9, owner_converted_reference_unit_minor = ?10, owner_markup_json = ?11, owner_final_unit_price_minor = ?12, updated_at = ?13 WHERE id = ?1",
                params![line.order_item_id.to_string(), supplier_snapshot, quote_source, catalog_price_id.map(|id| id.to_string()), manual_reason, manual_actor, manual_at, source_unit_price, line.locked_exchange_rate_decimal, converted, markup_json, final_unit, unix_seconds(now)],
            ).map_err(|_| AuthError::Database)?;
            views.push(OwnerLinePricingView {
                order_item_id: line.order_item_id,
                converted_reference_unit_minor: converted.to_string(),
                markup_minor: markup.to_string(),
                final_unit_price_minor: final_unit.to_string(),
            });
        }
        transaction.execute("UPDATE local_purchase_orders SET procurement_mode = 'owner_self_purchase', version = version + 1, updated_at = ?2 WHERE id = ?1", params![input.order_id.to_string(), unix_seconds(now)]).map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            input.order_id,
            actor_id,
            "owner_pricing_saved",
            input.revision_reason.as_deref(),
            Some(&previous),
            Some(&order_audit_snapshot(&transaction, input.order_id)?),
            now,
        )?;
        let payload = order_sync_payload(&transaction, input.order_id)?;
        insert_local_sync_outbox(
            &transaction,
            "purchase_order",
            input.order_id,
            &payload,
            now,
        )?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(views)
    }

    pub fn set_procurement_mode(
        &self,
        order_id: Uuid,
        mode: String,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if !matches!(
            mode.as_str(),
            "owner_self_purchase" | "honsen_self_purchase"
        ) {
            return Err(AuthError::InvalidInput);
        }
        let privileged = self.require_order_mutation(now)?;
        self.require_active_scope_for_order(order_id, now)?;
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (applicant_id, workflow_status, existing, children, rfqs, priced): (String, String, Option<String>, i64, i64, i64) = transaction.query_row(
            "SELECT o.applicant_id, o.workflow_status, o.procurement_mode, (SELECT COUNT(*) FROM local_purchase_orders c WHERE c.parent_order_id = o.id AND c.deleted_at IS NULL), (SELECT COUNT(*) FROM local_rfqs r WHERE r.source_order_id = o.id), (SELECT COUNT(*) FROM local_purchase_order_items i WHERE i.order_id = o.id AND i.owner_quote_source IS NOT NULL) FROM local_purchase_orders o WHERE o.id = ?1 AND o.deleted_at IS NULL",
            [order_id.to_string()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        ).map_err(|_| AuthError::Database)?;
        if workflow_status != "draft"
            || (!privileged && applicant_id != actor_id.to_string())
            || children != 0
            || rfqs != 0
            || (existing.as_deref().is_some_and(|value| value != mode) && priced != 0)
        {
            return Err(AuthError::Forbidden);
        }
        if existing.as_deref() == Some(mode.as_str()) {
            return Ok(());
        }
        let previous = order_audit_snapshot(&transaction, order_id)?;
        transaction.execute("UPDATE local_purchase_orders SET procurement_mode = ?2, version = version + 1, updated_at = ?3 WHERE id = ?1", params![order_id.to_string(), mode, unix_seconds(now)]).map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            order_id,
            actor_id,
            "procurement_mode_set",
            None,
            Some(&previous),
            Some(&order_audit_snapshot(&transaction, order_id)?),
            now,
        )?;
        let payload = order_sync_payload(&transaction, order_id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", order_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn allocate_supplier_child_orders(
        &self,
        parent_order_id: Uuid,
        allocations: Vec<SupplierChildAllocationInput>,
        now: SystemTime,
    ) -> Result<Vec<SupplierChildOrderView>, AuthError> {
        if !self.require_order_mutation(now)? || allocations.is_empty() {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(parent_order_id, now)?;
        let actor_id = self.active_session_user_id()?;
        let mut groups: Vec<(
            Uuid,
            String,
            String,
            String,
            Vec<SupplierChildAllocationInput>,
        )> = Vec::new();
        let mut allocated_items = HashSet::new();
        for allocation in allocations {
            if !allocated_items.insert(allocation.parent_item_id)
                || !valid_currency(&allocation.currency)
                || !valid_required_text(&allocation.child_display_no, 128)
                || !valid_non_zero_decimal_rate(&allocation.locked_exchange_rate_decimal)
            {
                return Err(AuthError::InvalidInput);
            }
            if let Some(group) = groups
                .iter_mut()
                .find(|group| group.0 == allocation.supplier_id && group.1 == allocation.currency)
            {
                if group.2 != allocation.child_display_no
                    || group.3 != allocation.locked_exchange_rate_decimal
                {
                    return Err(AuthError::InvalidInput);
                }
                group.4.push(allocation);
            } else {
                groups.push((
                    allocation.supplier_id,
                    allocation.currency.clone(),
                    allocation.child_display_no.clone(),
                    allocation.locked_exchange_rate_decimal.clone(),
                    vec![allocation],
                ));
            }
        }

        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let parent: (
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            Option<String>,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
        ) = transaction
            .query_row(
                "SELECT country_id, project_id, site, department_id, team_id, applicant_id, primary_currency, language_pair, urgency, urgency_reason, order_date, delivery_address, expected_delivery_date, notes, workflow_status FROM local_purchase_orders WHERE id = ?1 AND parent_order_id IS NULL AND deleted_at IS NULL",
                [parent_order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?, row.get(13)?, row.get(14)?)),
            )
            .map_err(|_| AuthError::Database)?;
        let parent_mode: Option<String> = transaction
            .query_row(
                "SELECT procurement_mode FROM local_purchase_orders WHERE id = ?1",
                [parent_order_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if !matches!(parent.14.as_str(), "confirmed" | "approved")
            || parent_mode.as_deref() == Some("owner_self_purchase")
        {
            return Err(AuthError::InvalidInput);
        }

        let mut item_statement = transaction
            .prepare(
                "SELECT id, material_id, material_snapshot_json, quantity_decimal, unit, unit_price_minor, currency FROM local_purchase_order_items WHERE order_id = ?1 ORDER BY sort_order, id",
            )
            .map_err(|_| AuthError::Database)?;
        let parent_items = item_statement
            .query_map([parent_order_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    (
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, String>(6)?,
                    ),
                ))
            })
            .map_err(|_| AuthError::Database)?
            .collect::<Result<HashMap<_, _>, _>>()
            .map_err(|_| AuthError::Database)?;
        drop(item_statement);
        if parent_items.is_empty() || parent_items.len() != allocated_items.len() {
            return Err(AuthError::InvalidInput);
        }
        for allocation in groups.iter().flat_map(|group| &group.4) {
            let item = parent_items
                .get(&allocation.parent_item_id.to_string())
                .ok_or(AuthError::InvalidInput)?;
            if item.5 != allocation.currency {
                return Err(AuthError::InvalidInput);
            }
        }
        let allocated_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM local_supplier_order_allocations WHERE parent_order_id = ?1",
                [parent_order_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if allocated_count != 0 {
            return Err(AuthError::InvalidInput);
        }

        let mut children = Vec::with_capacity(groups.len());
        let mut parent_primary_total = 0i128;
        for (supplier_id, currency, display_no, exchange_rate, group_allocations) in groups {
            let supplier_name = transaction
                .query_row(
                    "SELECT name FROM local_suppliers WHERE id = ?1 AND country_id = ?2 AND is_active = 1 AND is_blacklisted = 0 AND deleted_at IS NULL",
                    params![supplier_id.to_string(), parent.0],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|_| AuthError::Database)?
                .ok_or(AuthError::InvalidInput)?;
            let duplicate_display_no: Option<String> = transaction
                .query_row(
                    "SELECT id FROM local_purchase_orders WHERE display_no = ?1 AND deleted_at IS NULL",
                    [&display_no],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|_| AuthError::Database)?;
            if duplicate_display_no.is_some() {
                return Err(AuthError::InvalidInput);
            }
            let supplier_snapshot = serde_json::to_string(
                &serde_json::json!({ "id": supplier_id, "name": supplier_name }),
            )
            .map_err(|_| AuthError::Database)?;
            let child_order_id = Uuid::new_v4();
            let mut source_total = 0i128;
            let mut child_items = Vec::with_capacity(group_allocations.len());
            for allocation in group_allocations {
                let item = parent_items
                    .get(&allocation.parent_item_id.to_string())
                    .ok_or(AuthError::InvalidInput)?;
                let line_total = divide_half_up(
                    i128::from(item.4) * parse_quantity_hundredths(&item.2)?,
                    100,
                )?;
                source_total = source_total
                    .checked_add(line_total)
                    .ok_or(AuthError::InvalidInput)?;
                child_items.push((allocation.parent_item_id, item.clone(), as_i64(line_total)?));
            }
            let source_total = as_i64(source_total)?;
            let primary_total =
                convert_minor_by_rate(source_total, &currency, &parent.6, &exchange_rate)?;
            parent_primary_total = parent_primary_total
                .checked_add(i128::from(primary_total))
                .ok_or(AuthError::InvalidInput)?;
            transaction
                .execute(
                    "INSERT INTO local_purchase_orders (id, parent_order_id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, supplier_id, supplier_snapshot_json, currency, primary_currency, locked_exchange_rate_decimal, language_pair, status, workflow_status, urgency, urgency_reason, order_date, delivery_address, expected_delivery_date, notes, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, version, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'draft', 'draft', ?16, ?17, ?18, ?19, ?20, ?21, ?22, 0, 0, 0, 0, 0, ?22, 1, ?23, ?23)",
                    params![child_order_id.to_string(), parent_order_id.to_string(), display_no, parent.0, parent.1, parent.2, parent.3, parent.4, parent.5, supplier_id.to_string(), supplier_snapshot, currency, parent.6, exchange_rate, parent.7, parent.8, parent.9, parent.10, parent.11, parent.12, parent.13, source_total, unix_seconds(now)],
                )
                .map_err(|_| AuthError::Database)?;
            for (sort_order, (parent_item_id, item, line_total)) in
                child_items.into_iter().enumerate()
            {
                let child_item_id = Uuid::new_v4();
                transaction
                    .execute(
                        "INSERT INTO local_purchase_order_items (id, order_id, material_id, material_snapshot_json, supplier_snapshot_json, currency, quantity_decimal, unit, unit_price_minor, line_discount_json, line_freight_json, freight_included, line_total_minor, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '{\"kind\":\"fixed_minor\",\"minor\":\"0\"}', '{\"kind\":\"fixed_minor\",\"minor\":\"0\"}', 0, ?10, ?11, ?12, ?12)",
                        params![child_item_id.to_string(), child_order_id.to_string(), item.0, item.1, supplier_snapshot, currency, item.2, item.3, item.4, line_total, sort_order as i64, unix_seconds(now)],
                    )
                    .map_err(|_| AuthError::Database)?;
                transaction
                    .execute(
                        "INSERT INTO local_supplier_order_allocations (id, parent_order_id, child_order_id, parent_item_id, child_item_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![Uuid::new_v4().to_string(), parent_order_id.to_string(), child_order_id.to_string(), parent_item_id.to_string(), child_item_id.to_string(), unix_seconds(now)],
                    )
                    .map_err(|_| AuthError::Database)?;
            }
            append_order_audit(
                &transaction,
                child_order_id,
                actor_id,
                "created_from_parent",
                None,
                None,
                Some(&serde_json::json!({ "parentOrderId": parent_order_id }).to_string()),
                now,
            )?;
            children.push(SupplierChildOrderView {
                child_order_id,
                supplier_id,
                currency,
                source_total_minor: source_total.to_string(),
                primary_total_minor: primary_total.to_string(),
                locked_exchange_rate_decimal: exchange_rate,
            });
        }
        let parent_primary_total = as_i64(parent_primary_total)?;
        transaction
            .execute(
                "UPDATE local_purchase_orders SET subtotal_minor = ?2, line_discount_minor = 0, order_discount_minor = 0, freight_minor = 0, tax_minor = 0, total_minor = ?2, version = version + 1, updated_at = ?3 WHERE id = ?1",
                params![parent_order_id.to_string(), parent_primary_total, unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            parent_order_id,
            actor_id,
            "supplier_children_created",
            None,
            None,
            Some(
                &serde_json::json!({
                    "primaryCurrency": parent.6,
                    "primaryTotalMinor": parent_primary_total.to_string(),
                    "children": children,
                })
                .to_string(),
            ),
            now,
        )?;
        let parent_payload = order_sync_payload(&transaction, parent_order_id)?;
        insert_local_sync_outbox(
            &transaction,
            "purchase_order",
            parent_order_id,
            &parent_payload,
            now,
        )?;
        for child in &children {
            let child_payload = order_sync_payload(&transaction, child.child_order_id)?;
            insert_local_sync_outbox(
                &transaction,
                "purchase_order",
                child.child_order_id,
                &child_payload,
                now,
            )?;
        }
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(children)
    }

    pub fn save_supplier_child_terms(
        &self,
        input: SupplierChildTermsInput,
        now: SystemTime,
    ) -> Result<RequisitionTotalsView, AuthError> {
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(input.order_id, now)?;
        if input.lines.is_empty()
            || input.lines.len() > 500
            || !(0..=100_000).contains(&input.tax_rate_basis_points)
            || validate_adjustment(&input.order_discount).is_err()
            || validate_adjustment(&input.order_freight).is_err()
        {
            return Err(AuthError::InvalidInput);
        }
        let actor_id = self.active_session_user_id()?;
        let mut terms_by_item = HashMap::new();
        for terms in &input.lines {
            if validate_adjustment(&terms.line_discount).is_err()
                || validate_adjustment(&terms.line_freight).is_err()
                || terms_by_item
                    .insert(terms.order_item_id.to_string(), terms.clone())
                    .is_some()
            {
                return Err(AuthError::InvalidInput);
            }
        }
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let header: (
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            Option<String>,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
        ) = transaction
            .query_row(
                "SELECT display_no, country_id, project_id, site, department_id, team_id, applicant_id, currency, primary_currency, language_pair, urgency, urgency_reason, order_date, delivery_address, expected_delivery_date, notes, workflow_status FROM local_purchase_orders WHERE id = ?1 AND parent_order_id IS NOT NULL AND deleted_at IS NULL",
                [input.order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?, row.get(13)?, row.get(14)?, row.get(15)?, row.get(16)?)),
            )
            .map_err(|_| AuthError::Database)?;
        if header.16 != "draft" {
            return Err(AuthError::InvalidInput);
        }
        let mut statement = transaction
            .prepare(
                "SELECT id, material_id, material_snapshot_json, currency, quantity_decimal, unit, unit_price_minor, sort_order FROM local_purchase_order_items WHERE order_id = ?1 ORDER BY sort_order, id",
            )
            .map_err(|_| AuthError::Database)?;
        let saved_lines = statement
            .query_map([input.order_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i32>(7)?,
                ))
            })
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        drop(statement);
        if saved_lines.len() != terms_by_item.len() {
            return Err(AuthError::InvalidInput);
        }
        let mut lines = Vec::with_capacity(saved_lines.len());
        for (id, material_id, snapshot_json, currency, quantity, unit, unit_price, sort_order) in
            saved_lines
        {
            let terms = terms_by_item.get(&id).ok_or(AuthError::InvalidInput)?;
            lines.push(RequisitionLineInput {
                id: Uuid::parse_str(&id).map_err(|_| AuthError::Database)?,
                material_id: material_id
                    .as_deref()
                    .map(Uuid::parse_str)
                    .transpose()
                    .map_err(|_| AuthError::Database)?,
                material_snapshot: serde_json::from_str(&snapshot_json)
                    .map_err(|_| AuthError::Database)?,
                supplier_id: None,
                currency,
                quantity,
                unit,
                unit_price_minor: unit_price.to_string(),
                line_discount: terms.line_discount.clone(),
                line_freight: terms.line_freight.clone(),
                freight_included: terms.freight_included,
                sort_order,
            });
        }
        let draft = RequisitionDraftInput {
            id: input.order_id,
            display_no: header.0,
            country_id: Uuid::parse_str(&header.1).map_err(|_| AuthError::Database)?,
            project_id: Uuid::parse_str(&header.2).map_err(|_| AuthError::Database)?,
            site: header.3,
            department_id: Uuid::parse_str(&header.4).map_err(|_| AuthError::Database)?,
            team_id: Uuid::parse_str(&header.5).map_err(|_| AuthError::Database)?,
            applicant_id: Uuid::parse_str(&header.6).map_err(|_| AuthError::Database)?,
            currency: header.7,
            primary_currency: header.8,
            language_pair: header.9,
            urgency: header.10,
            urgency_reason: header.11,
            order_date: header.12,
            delivery_address: header.13,
            expected_delivery_date: header.14,
            notes: header.15,
            order_discount: input.order_discount,
            order_freight: input.order_freight,
            tax_rate_basis_points: input.tax_rate_basis_points,
            lines,
        };
        let calculated = calculate_requisition(&draft)?;
        let previous = order_audit_snapshot(&transaction, input.order_id)?;
        for line in &calculated.lines {
            transaction
                .execute(
                    "UPDATE local_purchase_order_items SET line_discount_json = ?2, line_freight_json = ?3, freight_included = ?4, line_total_minor = ?5, updated_at = ?6 WHERE id = ?1 AND order_id = ?7",
                    params![line.input.id.to_string(), serde_json::to_string(&line.input.line_discount).map_err(|_| AuthError::Database)?, serde_json::to_string(&line.input.line_freight).map_err(|_| AuthError::Database)?, if line.input.freight_included { 1 } else { 0 }, line.total, unix_seconds(now), input.order_id.to_string()],
                )
                .map_err(|_| AuthError::Database)?;
        }
        transaction
            .execute(
                "UPDATE local_purchase_orders SET subtotal_minor = ?2, line_discount_minor = ?3, order_discount_minor = ?4, freight_minor = ?5, tax_rate_basis_points = ?6, tax_minor = ?7, total_minor = ?8, supplier_terms_completed_at = ?9, version = version + 1, updated_at = ?9 WHERE id = ?1",
                params![input.order_id.to_string(), calculated.subtotal, calculated.line_discount, calculated.order_discount, calculated.freight, draft.tax_rate_basis_points, calculated.tax, calculated.total, unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        let next = order_audit_snapshot(&transaction, input.order_id)?;
        append_order_audit(
            &transaction,
            input.order_id,
            actor_id,
            "supplier_terms_completed",
            None,
            Some(&previous),
            Some(&next),
            now,
        )?;
        let payload = order_sync_payload(&transaction, input.order_id)?;
        insert_local_sync_outbox(
            &transaction,
            "purchase_order",
            input.order_id,
            &payload,
            now,
        )?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(calculated.view())
    }

    pub fn send_supplier_order(&self, order_id: Uuid, now: SystemTime) -> Result<(), AuthError> {
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(order_id, now)?;
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let ready: Option<String> = transaction
            .query_row(
                "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1 AND parent_order_id IS NOT NULL AND supplier_terms_completed_at IS NOT NULL AND deleted_at IS NULL",
                [order_id.to_string()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        if ready.as_deref() != Some("draft") {
            return Err(AuthError::InvalidInput);
        }
        transaction
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'sent', version = version + 1, updated_at = ?2 WHERE id = ?1",
                params![order_id.to_string(), unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            order_id,
            actor_id,
            "sent_to_supplier",
            None,
            None,
            None,
            now,
        )?;
        let payload = order_sync_payload(&transaction, order_id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", order_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn create_rfq(&self, input: CreateRfqInput, now: SystemTime) -> Result<RfqView, AuthError> {
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(input.source_order_id, now)?;
        if !valid_required_text(&input.display_no, 128) || !valid_currency(&input.currency) {
            return Err(AuthError::InvalidInput);
        }
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (status, country_id, mode): (String, String, Option<String>) = transaction
            .query_row(
                "SELECT workflow_status, country_id, procurement_mode FROM local_purchase_orders WHERE id = ?1 AND parent_order_id IS NULL AND deleted_at IS NULL",
                [input.source_order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|_| AuthError::Database)?;
        if !matches!(status.as_str(), "confirmed" | "approved")
            || mode.as_deref() == Some("owner_self_purchase")
        {
            return Err(AuthError::InvalidInput);
        }
        let supplier_name = transaction
            .query_row(
                "SELECT name FROM local_suppliers WHERE id = ?1 AND country_id = ?2 AND is_active = 1 AND is_blacklisted = 0 AND deleted_at IS NULL",
                params![input.supplier_id.to_string(), country_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?
            .ok_or(AuthError::InvalidInput)?;
        let source_items = transaction
            .prepare("SELECT id, material_snapshot_json, quantity_decimal, unit FROM local_purchase_order_items WHERE order_id = ?1 AND currency = ?2 ORDER BY sort_order, id")
            .map_err(|_| AuthError::Database)?
            .query_map(params![input.source_order_id.to_string(), input.currency], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        if source_items.is_empty() {
            return Err(AuthError::InvalidInput);
        }
        let snapshot =
            serde_json::json!({ "id": input.supplier_id, "name": supplier_name }).to_string();
        transaction.execute(
            "INSERT INTO local_rfqs (id, source_order_id, supplier_id, supplier_snapshot_json, display_no, currency, status, created_by, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, ?8, ?8)",
            params![input.id.to_string(), input.source_order_id.to_string(), input.supplier_id.to_string(), snapshot, input.display_no, input.currency, actor_id.to_string(), unix_seconds(now)],
        ).map_err(|_| AuthError::Database)?;
        for (sort_order, (source_item_id, material_snapshot, quantity, unit)) in
            source_items.iter().enumerate()
        {
            transaction.execute(
                "INSERT INTO local_rfq_items (id, rfq_id, source_item_id, material_snapshot_json, quantity_decimal, unit, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![Uuid::new_v4().to_string(), input.id.to_string(), source_item_id, material_snapshot, quantity, unit, sort_order as i64],
            ).map_err(|_| AuthError::Database)?;
        }
        append_order_audit(&transaction, input.source_order_id, actor_id, "rfq_created", None, None, Some(&serde_json::json!({ "rfqId": input.id, "supplierId": input.supplier_id, "currency": input.currency }).to_string()), now)?;
        let project_id: String = transaction
            .query_row(
                "SELECT project_id FROM local_purchase_orders WHERE id = ?1",
                [input.source_order_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        let rfq_payload = serde_json::json!({ "id": input.id, "sourceOrderId": input.source_order_id, "supplierId": input.supplier_id, "projectId": project_id, "displayNo": input.display_no, "currency": input.currency }).to_string();
        insert_local_sync_outbox(&transaction, "rfq", input.id, &rfq_payload, now)?;
        let source_payload = order_sync_payload(&transaction, input.source_order_id)?;
        insert_local_sync_outbox(
            &transaction,
            "purchase_order",
            input.source_order_id,
            &source_payload,
            now,
        )?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(RfqView {
            id: input.id,
            source_order_id: input.source_order_id,
            supplier_id: input.supplier_id,
            display_no: input.display_no,
            currency: input.currency,
            item_count: source_items.len() as i64,
        })
    }

    pub fn record_receipt(
        &self,
        input: RecordReceiptInput,
        now: SystemTime,
    ) -> Result<ReceiptView, AuthError> {
        let privileged = self.require_order_mutation(now)?;
        self.require_active_scope_for_order(input.order_id, now)?;
        if !valid_iso_date(&input.received_at)
            || input.items.is_empty()
            || input.items.len() > 500
            || !valid_optional_text(&input.over_receipt_reason, 1000)
        {
            return Err(AuthError::InvalidInput);
        }
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (applicant_id, status, is_child, mode): (String, String, i64, Option<String>) = transaction
            .query_row(
                "SELECT applicant_id, workflow_status, parent_order_id IS NOT NULL, procurement_mode FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
                [input.order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|_| AuthError::Database)?;
        let supplier_child = is_child != 0 && status == "sent";
        let market_parent = is_child == 0
            && mode.as_deref() == Some("honsen_self_purchase")
            && matches!(status.as_str(), "executing" | "receiving");
        if (!supplier_child && !market_parent)
            || (!privileged && applicant_id != actor_id.to_string())
        {
            return Err(AuthError::Forbidden);
        }
        let mut receipt_items = HashSet::new();
        let mut receipt_attachments = HashSet::new();
        let mut photo_count = 0usize;
        for attachment_id in &input.attachment_ids {
            if !receipt_attachments.insert(attachment_id) {
                return Err(AuthError::InvalidInput);
            }
            let content_type: String = transaction
                .query_row(
                    "SELECT content_type FROM local_order_attachments WHERE id = ?1 AND order_id = ?2 AND deleted_at IS NULL",
                    params![attachment_id.to_string(), input.order_id.to_string()],
                    |row| row.get(0),
                )
                .map_err(|_| AuthError::InvalidInput)?;
            if content_type.starts_with("image/") {
                photo_count += 1;
            }
        }
        if photo_count > 10 {
            return Err(AuthError::InvalidInput);
        }
        let mut is_over_receipt = false;
        for item in &input.items {
            if !receipt_items.insert(item.order_item_id) || !valid_required_text(&item.unit, 64) {
                return Err(AuthError::InvalidInput);
            }
            let received = parse_quantity_hundredths(&item.quantity)?;
            let (ordered_quantity, expected_unit): (String, String) = transaction
                .query_row(
                    "SELECT quantity_decimal, unit FROM local_purchase_order_items WHERE id = ?1 AND order_id = ?2",
                    params![item.order_item_id.to_string(), input.order_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|_| AuthError::InvalidInput)?;
            if item.unit != expected_unit {
                return Err(AuthError::InvalidInput);
            }
            let mut statement = transaction
                .prepare("SELECT ri.quantity_decimal FROM local_receipt_items ri JOIN local_receipts r ON r.id = ri.receipt_id WHERE ri.order_item_id = ?1")
                .map_err(|_| AuthError::Database)?;
            let prior_exact = statement
                .query_map([item.order_item_id.to_string()], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(|_| AuthError::Database)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| AuthError::Database)?
                .into_iter()
                .try_fold(0i128, |sum, value| {
                    parse_quantity_hundredths(&value)?
                        .checked_add(sum)
                        .ok_or(AuthError::InvalidInput)
                })?;
            if prior_exact
                .checked_add(received)
                .ok_or(AuthError::InvalidInput)?
                > parse_quantity_hundredths(&ordered_quantity)?
            {
                is_over_receipt = true;
            }
        }
        if is_over_receipt
            && input
                .over_receipt_reason
                .as_ref()
                .is_none_or(|value| !valid_required_text(value, 1000))
        {
            return Err(AuthError::InvalidInput);
        }
        transaction.execute(
            "INSERT INTO local_receipts (id, order_id, received_at, receiver_id, over_receipt_reason, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![input.id.to_string(), input.order_id.to_string(), input.received_at, input.receiver_id.to_string(), input.over_receipt_reason, actor_id.to_string(), unix_seconds(now)],
        ).map_err(|_| AuthError::Database)?;
        for item in &input.items {
            transaction.execute(
                "INSERT INTO local_receipt_items (id, receipt_id, order_item_id, quantity_decimal, unit) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![Uuid::new_v4().to_string(), input.id.to_string(), item.order_item_id.to_string(), item.quantity, item.unit],
            ).map_err(|_| AuthError::Database)?;
        }
        for attachment_id in &input.attachment_ids {
            transaction
                .execute(
                    "INSERT INTO local_receipt_attachment_links (receipt_id, attachment_id) VALUES (?1, ?2)",
                    params![input.id.to_string(), attachment_id.to_string()],
                )
                .map_err(|_| AuthError::Database)?;
        }
        let mut items_statement = transaction
            .prepare(
                "SELECT id, quantity_decimal FROM local_purchase_order_items WHERE order_id = ?1",
            )
            .map_err(|_| AuthError::Database)?;
        let order_items = items_statement
            .query_map([input.order_id.to_string()], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        drop(items_statement);
        let mut complete = true;
        for (item_id, ordered) in order_items {
            let receipt_quantities = transaction
                .prepare("SELECT ri.quantity_decimal FROM local_receipt_items ri JOIN local_receipts r ON r.id = ri.receipt_id WHERE ri.order_item_id = ?1")
                .map_err(|_| AuthError::Database)?
                .query_map([item_id], |row| row.get::<_, String>(0))
                .map_err(|_| AuthError::Database)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| AuthError::Database)?;
            let total = receipt_quantities
                .into_iter()
                .try_fold(0i128, |sum, value| {
                    parse_quantity_hundredths(&value)?
                        .checked_add(sum)
                        .ok_or(AuthError::InvalidInput)
                })?;
            if total < parse_quantity_hundredths(&ordered)? {
                complete = false;
            }
        }
        let workflow_status = if complete {
            "completed"
        } else if market_parent {
            "receiving"
        } else {
            "sent"
        };
        transaction.execute(
            "UPDATE local_purchase_orders SET workflow_status = ?2, version = version + 1, updated_at = ?3 WHERE id = ?1",
            params![input.order_id.to_string(), workflow_status, unix_seconds(now)],
        ).map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            input.order_id,
            actor_id,
            "receipt_recorded",
            input.over_receipt_reason.as_deref(),
            None,
            Some(&serde_json::json!({ "receiptId": input.id, "completed": complete }).to_string()),
            now,
        )?;
        let receipt_payload = receipt_sync_payload(&transaction, input.id, complete)?;
        insert_local_sync_outbox(&transaction, "receipt", input.id, &receipt_payload, now)?;
        let order_payload = order_sync_payload(&transaction, input.order_id)?;
        insert_local_sync_outbox(
            &transaction,
            "purchase_order",
            input.order_id,
            &order_payload,
            now,
        )?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(ReceiptView {
            id: input.id,
            order_id: input.order_id,
            workflow_status: workflow_status.into(),
            received_item_count: input.items.len() as i64,
        })
    }

    pub fn list_procurement_expenditures(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<Vec<ProcurementExpenditureView>, AuthError> {
        let connection = self.historical_order_connection(order_id, now)?;
        let mut statement = connection.prepare(
            "SELECT id, receipt_id, counterparty_type, supplier_id, payee_name, currency, amount_minor, payment_date, payment_method, payment_handler_id, notes, status, corrects_expenditure_id, correction_reason, created_by, created_at FROM local_procurement_expenditures WHERE order_id = ?1 ORDER BY created_at, id",
        ).map_err(|_| AuthError::Database)?;
        let rows = statement
            .query_map([order_id.to_string()], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, String>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, Option<String>>(13)?,
                    row.get::<_, String>(14)?,
                    row.get::<_, i64>(15)?,
                ))
            })
            .map_err(|_| AuthError::Database)?;
        rows.map(|row| {
            let (
                id,
                receipt_id,
                counterparty_type,
                supplier_id,
                payee_name,
                currency,
                amount_minor,
                payment_date,
                payment_method,
                payment_handler_id,
                notes,
                status,
                corrects_expenditure_id,
                correction_reason,
                created_by,
                created_at,
            ) = row.map_err(|_| AuthError::Database)?;
            Ok(ProcurementExpenditureView {
                id: Uuid::parse_str(&id).map_err(|_| AuthError::Database)?,
                order_id,
                receipt_id: receipt_id
                    .map(|id| Uuid::parse_str(&id).map_err(|_| AuthError::Database))
                    .transpose()?,
                counterparty_type,
                supplier_id: supplier_id
                    .map(|id| Uuid::parse_str(&id).map_err(|_| AuthError::Database))
                    .transpose()?,
                payee_name,
                currency,
                amount_minor: amount_minor.to_string(),
                payment_date,
                payment_method,
                payment_handler_id: Uuid::parse_str(&payment_handler_id)
                    .map_err(|_| AuthError::Database)?,
                notes,
                status,
                corrects_expenditure_id: corrects_expenditure_id
                    .map(|id| Uuid::parse_str(&id).map_err(|_| AuthError::Database))
                    .transpose()?,
                correction_reason,
                created_by: Uuid::parse_str(&created_by).map_err(|_| AuthError::Database)?,
                created_at,
            })
        })
        .collect()
    }

    pub fn record_procurement_expenditure(
        &self,
        input: RecordProcurementExpenditureInput,
        now: SystemTime,
    ) -> Result<ProcurementExpenditureView, AuthError> {
        self.write_procurement_expenditure(input, "recorded", now)
    }

    pub fn list_expenditure_vouchers(
        &self,
        expenditure_id: Uuid,
        now: SystemTime,
    ) -> Result<Vec<ExpenditureVoucherView>, AuthError> {
        let order_id: String = self
            .connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .query_row(
                "SELECT order_id FROM local_procurement_expenditures WHERE id = ?1",
                [expenditure_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Forbidden)?;
        drop(self.historical_order_connection(
            Uuid::parse_str(&order_id).map_err(|_| AuthError::Database)?,
            now,
        )?);
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        connection.prepare("SELECT id, original_name, content_type, byte_length, checksum, upload_state FROM local_attachments WHERE owner_type = 'procurement_expenditure' AND owner_id = ?1 ORDER BY created_at, id")
            .map_err(|_| AuthError::Database)?
            .query_map([expenditure_id.to_string()], |row| Ok(ExpenditureVoucherView {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                expenditure_id, original_name: row.get(1)?, content_type: row.get(2)?,
                byte_length: row.get(3)?, checksum: row.get(4)?, upload_state: row.get(5)?,
            }))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)
    }

    pub fn list_receipt_attachments(
        &self,
        receipt_id: Uuid,
        now: SystemTime,
    ) -> Result<Vec<ReceiptAttachmentView>, AuthError> {
        let order_id: String = self
            .connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .query_row(
                "SELECT order_id FROM local_receipts WHERE id = ?1",
                [receipt_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Forbidden)?;
        drop(self.historical_order_connection(
            Uuid::parse_str(&order_id).map_err(|_| AuthError::Database)?,
            now,
        )?);
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        connection.prepare("SELECT id, original_name, content_type, byte_length, checksum, upload_state FROM (SELECT id, original_name, content_type, byte_length, checksum, upload_state, created_at FROM local_attachments WHERE owner_type = 'receipt' AND owner_id = ?1 UNION ALL SELECT a.id, a.original_name, a.content_type, a.byte_length, COALESCE(a.checksum, ''), a.upload_state, a.created_at FROM local_receipt_attachment_links l JOIN local_order_attachments a ON a.id = l.attachment_id WHERE l.receipt_id = ?1 AND a.deleted_at IS NULL) ORDER BY created_at, id")
            .map_err(|_| AuthError::Database)?
            .query_map([receipt_id.to_string()], |row| Ok(ReceiptAttachmentView {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                receipt_id, original_name: row.get(1)?, content_type: row.get(2)?,
                byte_length: row.get(3)?, checksum: row.get(4)?, upload_state: row.get(5)?,
            }))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)
    }

    pub fn archive_expenditure_voucher(
        &self,
        expenditure_id: Uuid,
        source_path: &Path,
        now: SystemTime,
    ) -> Result<ExpenditureVoucherView, AuthError> {
        let (id, original_name, content_type, byte_length, checksum) =
            self.archive_attachment("procurement_expenditure", expenditure_id, source_path, now)?;
        Ok(ExpenditureVoucherView {
            id,
            expenditure_id,
            original_name,
            content_type,
            byte_length,
            checksum,
            upload_state: "pending_upload".into(),
        })
    }

    pub fn archive_receipt_attachment(
        &self,
        receipt_id: Uuid,
        source_path: &Path,
        now: SystemTime,
    ) -> Result<ReceiptAttachmentView, AuthError> {
        let (id, original_name, content_type, byte_length, checksum) =
            self.archive_attachment("receipt", receipt_id, source_path, now)?;
        Ok(ReceiptAttachmentView {
            id,
            receipt_id,
            original_name,
            content_type,
            byte_length,
            checksum,
            upload_state: "pending_upload".into(),
        })
    }

    fn archive_attachment(
        &self,
        owner_type: &str,
        owner_id: Uuid,
        source_path: &Path,
        now: SystemTime,
    ) -> Result<(Uuid, String, String, i64, String), AuthError> {
        let privileged = self.require_order_mutation(now)?;
        if owner_type == "procurement_expenditure" && !privileged {
            return Err(AuthError::Forbidden);
        }
        let original_name = source_path
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|name| valid_required_text(name, 255))
            .ok_or(AuthError::InvalidInput)?
            .to_owned();
        let content_type =
            attachment_content_type(&original_name).ok_or(AuthError::InvalidInput)?;
        let (order_id, project_id, owner_actor): (String, String, String) = {
            let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
            match owner_type {
                "procurement_expenditure" => connection.query_row(
                    "SELECT order_id, project_id, created_by FROM local_procurement_expenditures WHERE id = ?1",
                    [owner_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                ),
                "receipt" => connection.query_row(
                    "SELECT r.order_id, o.project_id, r.created_by FROM local_receipts r JOIN local_purchase_orders o ON o.id = r.order_id WHERE r.id = ?1",
                    [owner_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                ),
                _ => return Err(AuthError::InvalidInput),
            }.map_err(|_| AuthError::Forbidden)?
        };
        self.require_active_scope_for_order(
            Uuid::parse_str(&order_id).map_err(|_| AuthError::Database)?,
            now,
        )?;
        let actor_id = self.active_session_user_id()?;
        if owner_type == "receipt" && !privileged && owner_actor != actor_id.to_string() {
            return Err(AuthError::Forbidden);
        }
        let mut source = fs::File::open(source_path).map_err(|_| AuthError::InvalidInput)?;
        if !source
            .metadata()
            .map_err(|_| AuthError::InvalidInput)?
            .is_file()
        {
            return Err(AuthError::InvalidInput);
        }
        let directory = self.media_directory.join("attachments");
        fs::create_dir_all(&directory).map_err(|_| AuthError::Database)?;
        let id = Uuid::new_v4();
        let local_path = directory.join(id.to_string());
        let result = (|| -> Result<(Uuid, String, String, i64, String), AuthError> {
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&local_path)
                .map_err(|_| AuthError::Database)?;
            let byte_length =
                if owner_type == "receipt" && matches!(content_type, "image/jpeg" | "image/png") {
                    compress_receipt_photo(source_path, content_type, &mut output)?
                } else {
                    copy_attachment(&mut source, &mut output)?
                };
            if byte_length == 0 {
                return Err(AuthError::InvalidInput);
            }
            output.sync_all().map_err(|_| AuthError::Database)?;
            drop(output);
            let checksum = sha256_file(&local_path)?;
            let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
            let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
            let existing_bytes: i64 = transaction.query_row(
                "SELECT COALESCE((SELECT SUM(byte_length) FROM local_order_attachments WHERE order_id = ?1 AND deleted_at IS NULL), 0) + COALESCE((SELECT SUM(byte_length) FROM local_attachments WHERE order_id = ?1), 0)",
                [order_id.as_str()], |row| row.get(0),
            ).map_err(|_| AuthError::Database)?;
            if existing_bytes
                .checked_add(byte_length as i64)
                .is_none_or(|total| total > MAX_ORDER_ATTACHMENT_BYTES)
            {
                return Err(AuthError::InvalidInput);
            }
            if owner_type == "receipt" && content_type.starts_with("image/") {
                let photos: i64 = transaction.query_row(
                    "SELECT COUNT(*) FROM local_attachments WHERE owner_type = 'receipt' AND owner_id = ?1 AND content_type LIKE 'image/%'",
                    [owner_id.to_string()], |row| row.get(0),
                ).map_err(|_| AuthError::Database)?;
                if photos >= 10 {
                    return Err(AuthError::InvalidInput);
                }
            }
            transaction.execute("INSERT INTO local_attachments (id, owner_type, owner_id, order_id, project_id, original_name, content_type, byte_length, local_path, checksum, uploader_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![id.to_string(), owner_type, owner_id.to_string(), order_id, project_id, original_name, content_type, byte_length as i64, local_path.to_string_lossy(), checksum, actor_id.to_string(), unix_seconds(now)])
                .map_err(|_| AuthError::Database)?;
            transaction.commit().map_err(|_| AuthError::Database)?;
            Ok((
                id,
                original_name,
                content_type.into(),
                byte_length as i64,
                checksum,
            ))
        })();
        if result.is_err() {
            let _ = fs::remove_file(&local_path);
        }
        result
    }

    async fn upload_pending_attachments_https_with_progress(
        &self,
        now: SystemTime,
        reporter: Option<AttachmentTransferReporter>,
    ) -> Result<AttachmentTransferSummary, AuthError> {
        self.require_catalog_read(now)?;
        self.refresh_authorization_https(now).await?;
        let account_id = self.active_session_user_id()?;
        let token = self
            .credential_vault
            .load_sync_token(account_id)?
            .ok_or(AuthError::NoActiveSession)?;
        let pending = self.connection.lock().map_err(|_| AuthError::Database)?
            .prepare("SELECT id, owner_type, owner_id, order_id, project_id, original_name, content_type, byte_length, local_path, checksum, created_at FROM local_attachments WHERE upload_state = 'pending_upload' ORDER BY created_at, id LIMIT 10")
            .map_err(|_| AuthError::Database)?
            .query_map([], |row| Ok((
                row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?,
                row.get::<_, String>(6)?, row.get::<_, i64>(7)?, row.get::<_, String>(8)?, row.get::<_, String>(9)?, row.get::<_, i64>(10)?,
            )))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|_| AuthError::SyncTransport)?;
        let mut transferred = AttachmentTransferSummary::default();
        for (
            id,
            owner_type,
            owner_id,
            order_id,
            project_id,
            original_name,
            content_type,
            byte_length,
            local_path,
            checksum,
            created_at,
        ) in pending
        {
            let order_uuid = Uuid::parse_str(&order_id).map_err(|_| AuthError::Database)?;
            self.require_active_scope_for_order(order_uuid, now)?;
            let bytes = fs::read(&local_path).map_err(|_| AuthError::Database)?;
            if bytes.len() as i64 != byte_length
                || format!("{:x}", Sha256::digest(&bytes)) != checksum
            {
                return Err(AuthError::InvalidInput);
            }
            let transferred_bytes = bytes.len() as u64;
            report_attachment_transfer(&reporter, &id, "upload", 0, transferred_bytes, "preparing");
            let intent = client
                .post(attachment_endpoint("intents")?)
                .bearer_auth(&token)
                .json(&serde_json::json!({
                    "id": id, "ownerType": owner_type, "ownerId": owner_id,
                    "orderId": order_id, "projectId": project_id, "originalName": original_name,
                    "contentType": content_type, "byteLength": byte_length, "checksum": checksum,
                    "createdAt": created_at,
                }))
                .send()
                .await
                .map_err(|_| AuthError::SyncTransport)?;
            if intent.status() == reqwest::StatusCode::UNAUTHORIZED {
                return Err(AuthError::NoActiveSession);
            }
            if intent.status() == reqwest::StatusCode::FORBIDDEN {
                return Err(AuthError::Forbidden);
            }
            if !intent.status().is_success() {
                return Err(AuthError::SyncTransport);
            }
            let intent: AttachmentUploadIntentResponse =
                intent.json().await.map_err(|_| AuthError::SyncTransport)?;
            if !intent.uploaded {
                let url =
                    signed_attachment_url(intent.url.as_deref().ok_or(AuthError::SyncTransport)?)?;
                let body_bytes = Arc::new(bytes);
                let body_id = id.clone();
                let body_reporter = reporter.clone();
                let body_total = transferred_bytes;
                let body = reqwest::Body::wrap(StreamBody::new(
                    futures_util::stream::iter((0..body_bytes.len()).step_by(65_536)).map(
                        move |start| {
                            let end = (start + 65_536).min(body_bytes.len());
                            report_attachment_transfer(
                                &body_reporter,
                                &body_id,
                                "upload",
                                end as u64,
                                body_total,
                                "transferring",
                            );
                            Ok::<Frame<Bytes>, std::convert::Infallible>(Frame::data(
                                Bytes::copy_from_slice(&body_bytes[start..end]),
                            ))
                        },
                    ),
                ));
                let response = client
                    .put(url)
                    .header(reqwest::header::CONTENT_TYPE, content_type)
                    .body(body)
                    .send()
                    .await
                    .map_err(|_| AuthError::SyncTransport)?;
                if !response.status().is_success() {
                    return Err(AuthError::SyncTransport);
                }
                let completed = client
                    .post(attachment_endpoint(&format!("{id}/complete"))?)
                    .bearer_auth(&token)
                    .send()
                    .await
                    .map_err(|_| AuthError::SyncTransport)?;
                if !completed.status().is_success() {
                    return Err(AuthError::SyncTransport);
                }
            }
            self.connection.lock().map_err(|_| AuthError::Database)?
                .execute("UPDATE local_attachments SET upload_state = 'uploaded' WHERE id = ?1 AND upload_state = 'pending_upload'", [&id])
                .map_err(|_| AuthError::Database)?;
            transferred.count += 1;
            transferred.bytes = transferred
                .bytes
                .checked_add(transferred_bytes)
                .ok_or(AuthError::InvalidInput)?;
            report_attachment_transfer(
                &reporter,
                &id,
                "upload",
                transferred_bytes,
                transferred_bytes,
                "completed",
            );
        }
        Ok(transferred)
    }

    async fn download_pending_attachments_https_with_progress(
        &self,
        now: SystemTime,
        reporter: Option<AttachmentTransferReporter>,
    ) -> Result<AttachmentTransferSummary, AuthError> {
        self.require_catalog_read(now)?;
        self.refresh_authorization_https(now).await?;
        let account_id = self.active_session_user_id()?;
        let token = self
            .credential_vault
            .load_sync_token(account_id)?
            .ok_or(AuthError::NoActiveSession)?;
        let pending = self.connection.lock().map_err(|_| AuthError::Database)?
            .prepare("SELECT id, order_id, byte_length, checksum FROM local_attachments WHERE upload_state = 'pending_download' ORDER BY created_at, id LIMIT 10")
            .map_err(|_| AuthError::Database)?
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?, row.get::<_, String>(3)?)))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|_| AuthError::SyncTransport)?;
        let mut transferred = AttachmentTransferSummary::default();
        for (id, order_id, byte_length, checksum) in pending {
            let total_bytes = u64::try_from(byte_length).map_err(|_| AuthError::InvalidInput)?;
            self.require_active_scope_for_order(
                Uuid::parse_str(&order_id).map_err(|_| AuthError::Database)?,
                now,
            )?;
            let response = client
                .get(attachment_endpoint(&format!("{id}/download"))?)
                .bearer_auth(&token)
                .send()
                .await
                .map_err(|_| AuthError::SyncTransport)?;
            if response.status() == reqwest::StatusCode::UNAUTHORIZED {
                return Err(AuthError::NoActiveSession);
            }
            if response.status() == reqwest::StatusCode::FORBIDDEN {
                return Err(AuthError::Forbidden);
            }
            if !response.status().is_success() {
                return Err(AuthError::SyncTransport);
            }
            let link: AttachmentDownloadResponse = response
                .json()
                .await
                .map_err(|_| AuthError::SyncTransport)?;
            let signed = signed_attachment_url(&link.url)?;
            let mut response = client
                .get(signed)
                .send()
                .await
                .map_err(|_| AuthError::SyncTransport)?;
            if !response.status().is_success()
                || response
                    .content_length()
                    .is_some_and(|size| size > MAX_ATTACHMENT_BYTES)
            {
                return Err(AuthError::SyncTransport);
            }
            let mut bytes = Vec::with_capacity(byte_length as usize);
            report_attachment_transfer(&reporter, &id, "download", 0, total_bytes, "preparing");
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| AuthError::SyncTransport)?
            {
                if bytes
                    .len()
                    .checked_add(chunk.len())
                    .is_none_or(|size| size > MAX_ATTACHMENT_BYTES as usize)
                {
                    return Err(AuthError::InvalidInput);
                }
                bytes.extend_from_slice(&chunk);
                report_attachment_transfer(
                    &reporter,
                    &id,
                    "download",
                    bytes.len() as u64,
                    total_bytes,
                    "transferring",
                );
            }
            self.persist_downloaded_attachment_bytes(&id, byte_length, &checksum, &bytes)?;
            transferred.count += 1;
            transferred.bytes = transferred
                .bytes
                .checked_add(bytes.len() as u64)
                .ok_or(AuthError::InvalidInput)?;
            report_attachment_transfer(
                &reporter,
                &id,
                "download",
                bytes.len() as u64,
                total_bytes,
                "completed",
            );
        }
        Ok(transferred)
    }

    fn persist_downloaded_attachment_bytes(
        &self,
        id: &str,
        byte_length: i64,
        checksum: &str,
        bytes: &[u8],
    ) -> Result<(), AuthError> {
        if bytes.len() as i64 != byte_length || format!("{:x}", Sha256::digest(bytes)) != checksum {
            return Err(AuthError::InvalidInput);
        }
        let directory = self.media_directory.join("attachments");
        fs::create_dir_all(&directory).map_err(|_| AuthError::Database)?;
        let path = directory.join(id);
        if path.exists() {
            let existing = fs::read(&path).map_err(|_| AuthError::Database)?;
            if existing != bytes {
                return Err(AuthError::InvalidInput);
            }
        } else {
            write_attachment_bytes_atomically(&path, bytes)?;
        }
        self.connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .execute(
                "UPDATE local_attachments SET local_path = ?2, upload_state = 'uploaded' WHERE id = ?1 AND upload_state = 'pending_download'",
                params![id, path.to_string_lossy()],
            )
            .map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn reverse_procurement_expenditure(
        &self,
        expenditure_id: Uuid,
        reversal_id: Uuid,
        reason: String,
        now: SystemTime,
    ) -> Result<ProcurementExpenditureView, AuthError> {
        if !valid_required_text(&reason, 1000) {
            return Err(AuthError::InvalidInput);
        }
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        let prior = {
            let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
            connection.query_row(
                "SELECT order_id, receipt_id, counterparty_type, supplier_id, payee_name, currency, amount_minor, payment_date, payment_method, payment_handler_id, notes FROM local_procurement_expenditures WHERE id = ?1 AND status = 'recorded'",
                [expenditure_id.to_string()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?, row.get::<_, i64>(6)?, row.get::<_, String>(7)?, row.get::<_, String>(8)?, row.get::<_, String>(9)?, row.get::<_, Option<String>>(10)?)),
            ).optional().map_err(|_| AuthError::Database)?.ok_or(AuthError::Forbidden)?
        };
        self.write_procurement_expenditure(
            RecordProcurementExpenditureInput {
                id: reversal_id,
                order_id: Uuid::parse_str(&prior.0).map_err(|_| AuthError::Database)?,
                receipt_id: prior
                    .1
                    .map(|id| Uuid::parse_str(&id).map_err(|_| AuthError::Database))
                    .transpose()?,
                counterparty_type: prior.2,
                supplier_id: prior
                    .3
                    .map(|id| Uuid::parse_str(&id).map_err(|_| AuthError::Database))
                    .transpose()?,
                payee_name: prior.4,
                currency: prior.5,
                amount_minor: prior.6.to_string(),
                payment_date: prior.7,
                payment_method: prior.8,
                payment_handler_id: Uuid::parse_str(&prior.9).map_err(|_| AuthError::Database)?,
                notes: prior.10,
                corrects_expenditure_id: Some(expenditure_id),
                correction_reason: Some(reason),
            },
            "reversed",
            now,
        )
    }

    fn write_procurement_expenditure(
        &self,
        input: RecordProcurementExpenditureInput,
        status: &str,
        now: SystemTime,
    ) -> Result<ProcurementExpenditureView, AuthError> {
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(input.order_id, now)?;
        let amount_minor = input
            .amount_minor
            .parse::<i64>()
            .map_err(|_| AuthError::InvalidInput)?;
        if amount_minor <= 0
            || !valid_currency(&input.currency)
            || !valid_iso_date(&input.payment_date)
            || !matches!(
                input.payment_method.as_str(),
                "cash" | "bank_transfer" | "mobile_payment" | "other"
            )
            || !valid_required_text(&input.payee_name, 255)
            || !valid_optional_text(&input.notes, 2000)
            || input
                .correction_reason
                .as_ref()
                .is_some_and(|reason| !valid_required_text(reason, 1000))
            || (input.corrects_expenditure_id.is_some() != input.correction_reason.is_some())
            || (status == "reversed" && input.corrects_expenditure_id.is_none())
            || (input.counterparty_type == "market_casual" && input.supplier_id.is_some())
            || (input.counterparty_type == "registered_supplier" && input.supplier_id.is_none())
            || !matches!(
                input.counterparty_type.as_str(),
                "market_casual" | "registered_supplier"
            )
        {
            return Err(AuthError::InvalidInput);
        }
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (project_id, country_id, mode, workflow_status, is_child): (String, String, Option<String>, String, i64) = transaction.query_row(
            "SELECT o.project_id, o.country_id, COALESCE(o.procurement_mode, parent.procurement_mode), o.workflow_status, o.parent_order_id IS NOT NULL FROM local_purchase_orders o LEFT JOIN local_purchase_orders parent ON parent.id = o.parent_order_id WHERE o.id = ?1 AND o.deleted_at IS NULL",
            [input.order_id.to_string()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).map_err(|_| AuthError::Forbidden)?;
        if mode.as_deref() != Some("honsen_self_purchase")
            || !(if is_child == 0 {
                matches!(
                    workflow_status.as_str(),
                    "executing" | "receiving" | "completed" | "completed_with_conditions"
                )
            } else {
                matches!(
                    workflow_status.as_str(),
                    "sent" | "receiving" | "completed" | "completed_with_conditions"
                )
            })
        {
            return Err(AuthError::Forbidden);
        }
        if let Some(receipt_id) = input.receipt_id {
            let linked: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM local_receipts WHERE id = ?1 AND order_id = ?2)",
                    params![receipt_id.to_string(), input.order_id.to_string()],
                    |row| row.get(0),
                )
                .map_err(|_| AuthError::Database)?;
            if !linked {
                return Err(AuthError::InvalidInput);
            }
        }
        let prior_snapshot = if let Some(corrects_id) = input.corrects_expenditure_id {
            let expected_status = if status == "reversed" {
                "recorded"
            } else {
                "reversed"
            };
            let prior: Option<(String, String, i64, Option<String>)> = transaction.query_row(
                "SELECT order_id, status, amount_minor, counterparty_snapshot_json FROM local_procurement_expenditures WHERE id = ?1",
                [corrects_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            ).optional().map_err(|_| AuthError::Database)?;
            match prior {
                Some((order_id, prior_status, prior_amount, snapshot))
                    if order_id == input.order_id.to_string()
                        && prior_status == expected_status
                        && (status != "reversed" || prior_amount == amount_minor) =>
                {
                    snapshot
                }
                _ => return Err(AuthError::InvalidInput),
            }
        } else {
            None
        };
        let counterparty_snapshot = if status == "reversed" {
            prior_snapshot
        } else if let Some(supplier_id) = input.supplier_id {
            let supplier: (String, String) = transaction.query_row(
                "SELECT name, country_id FROM local_suppliers WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
                [supplier_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?)),
            ).map_err(|_| AuthError::InvalidInput)?;
            if supplier.1 != country_id || supplier.0 != input.payee_name {
                return Err(AuthError::InvalidInput);
            }
            Some(
                serde_json::json!({"id": supplier_id, "name": supplier.0, "countryId": supplier.1})
                    .to_string(),
            )
        } else {
            None
        };
        let created_at = unix_seconds(now);
        transaction.execute(
            "INSERT INTO local_procurement_expenditures (id, order_id, project_id, receipt_id, counterparty_type, supplier_id, payee_name, counterparty_snapshot_json, currency, amount_minor, payment_date, payment_method, payment_handler_id, notes, status, corrects_expenditure_id, correction_reason, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            params![input.id.to_string(), input.order_id.to_string(), project_id, input.receipt_id.map(|id| id.to_string()), input.counterparty_type, input.supplier_id.map(|id| id.to_string()), input.payee_name, counterparty_snapshot, input.currency, amount_minor, input.payment_date, input.payment_method, input.payment_handler_id.to_string(), input.notes, status, input.corrects_expenditure_id.map(|id| id.to_string()), input.correction_reason, actor_id.to_string(), created_at],
        ).map_err(|_| AuthError::Database)?;
        let payload = serde_json::json!({"id": input.id, "orderId": input.order_id, "projectId": project_id, "receiptId": input.receipt_id, "counterpartyType": input.counterparty_type, "supplierId": input.supplier_id, "payeeName": input.payee_name, "counterpartySnapshot": counterparty_snapshot.as_ref().and_then(|value| serde_json::from_str::<serde_json::Value>(value).ok()), "currency": input.currency, "amountMinor": amount_minor.to_string(), "paymentDate": input.payment_date, "paymentMethod": input.payment_method, "paymentHandlerId": input.payment_handler_id, "notes": input.notes, "status": status, "correctsExpenditureId": input.corrects_expenditure_id, "correctionReason": input.correction_reason, "createdBy": actor_id, "createdAt": created_at}).to_string();
        append_order_audit(
            &transaction,
            input.order_id,
            actor_id,
            if status == "reversed" {
                "expenditure_reversed"
            } else {
                "expenditure_recorded"
            },
            input.correction_reason.as_deref(),
            None,
            Some(&payload),
            now,
        )?;
        insert_local_sync_outbox(
            &transaction,
            "procurement_expenditure",
            input.id,
            &payload,
            now,
        )?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(ProcurementExpenditureView {
            id: input.id,
            order_id: input.order_id,
            receipt_id: input.receipt_id,
            counterparty_type: input.counterparty_type,
            supplier_id: input.supplier_id,
            payee_name: input.payee_name,
            currency: input.currency,
            amount_minor: amount_minor.to_string(),
            payment_date: input.payment_date,
            payment_method: input.payment_method,
            payment_handler_id: input.payment_handler_id,
            notes: input.notes,
            status: status.into(),
            corrects_expenditure_id: input.corrects_expenditure_id,
            correction_reason: input.correction_reason,
            created_by: actor_id,
            created_at,
        })
    }

    pub fn close_supplier_order_with_conditions(
        &self,
        order_id: Uuid,
        reason: String,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        let privileged = self.require_order_mutation(now)?;
        self.require_active_scope_for_order(order_id, now)?;
        if !valid_required_text(&reason, 1000) {
            return Err(AuthError::InvalidInput);
        }
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (applicant_id, status, is_child, mode): (String, String, i64, Option<String>) = transaction
            .query_row(
                "SELECT applicant_id, workflow_status, parent_order_id IS NOT NULL, procurement_mode FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
                [order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|_| AuthError::Database)?;
        let supplier_child = is_child != 0 && status == "sent";
        let market_parent = is_child == 0
            && mode.as_deref() == Some("honsen_self_purchase")
            && status == "receiving";
        if (!supplier_child && !market_parent)
            || (!privileged && applicant_id != actor_id.to_string())
        {
            return Err(AuthError::Forbidden);
        }
        transaction
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'completed_with_conditions', version = version + 1, updated_at = ?2 WHERE id = ?1",
                params![order_id.to_string(), unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            order_id,
            actor_id,
            "closed_with_conditions",
            Some(&reason),
            None,
            None,
            now,
        )?;
        let payload = order_sync_payload(&transaction, order_id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", order_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    fn save_requisition(
        &self,
        draft: RequisitionDraftInput,
        revision_reason: Option<String>,
        now: SystemTime,
    ) -> Result<RequisitionTotalsView, AuthError> {
        let privileged = self.require_order_mutation(now)?;
        let actor_id = self.active_session_user_id()?;
        if !privileged && actor_id != draft.applicant_id {
            return Err(AuthError::Forbidden);
        }
        validate_requisition_draft(&draft)?;
        let calculated = calculate_requisition(&draft)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let authorized_scope: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_authorization_snapshots a JOIN local_projects p ON p.id = a.project_id AND p.country_id = ?2 AND p.is_active = 1 AND p.deleted_at IS NULL JOIN local_departments d ON d.id = a.department_id AND d.is_active = 1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id = a.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL WHERE a.account_id = ?1 AND a.project_id = ?3 AND a.department_id = ?4 AND a.team_id = ?5 AND a.expires_at >= ?6)",
            params![actor_id.to_string(), draft.country_id.to_string(), draft.project_id.to_string(), draft.department_id.to_string(), draft.team_id.to_string(), unix_seconds(now)],
            |row| row.get(0),
        ).map_err(|_| AuthError::Database)?;
        if !authorized_scope {
            return Err(AuthError::Forbidden);
        }
        let selected_site_is_disabled: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_sites WHERE project_id = ?1 AND name = ?2 AND is_active = 0 AND deleted_at IS NULL)",
                params![draft.project_id.to_string(), draft.site],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if selected_site_is_disabled {
            return Err(AuthError::InvalidInput);
        }
        let prior = transaction
            .query_row(
                "SELECT workflow_status, version, applicant_id, country_id, project_id, department_id, team_id, display_no FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
                [draft.id.to_string()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?, row.get::<_, String>(6)?, row.get::<_, String>(7)?)),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        if prior.as_ref().is_some_and(
            |(_, _, applicant_id, country_id, project_id, department_id, team_id, display_no)| {
                applicant_id != &draft.applicant_id.to_string()
                    || country_id != &draft.country_id.to_string()
                    || project_id != &draft.project_id.to_string()
                    || department_id != &draft.department_id.to_string()
                    || team_id != &draft.team_id.to_string()
                    || display_no != &draft.display_no
            },
        ) {
            return Err(AuthError::Forbidden);
        }
        let is_revision = prior
            .as_ref()
            .is_some_and(|(status, ..)| status == "confirmed");
        if is_revision
            && (!privileged
                || !revision_reason
                    .as_ref()
                    .is_some_and(|value| valid_required_text(value, 1000)))
        {
            return Err(AuthError::Forbidden);
        }
        if is_revision {
            let child_order_count: i64 = transaction
                .query_row(
                    "SELECT COUNT(*) FROM local_purchase_orders WHERE parent_order_id = ?1 AND deleted_at IS NULL",
                    [draft.id.to_string()],
                    |row| row.get(0),
                )
                .map_err(|_| AuthError::Database)?;
            let rfq_count: i64 = transaction
                .query_row(
                    "SELECT COUNT(*) FROM local_rfqs WHERE source_order_id = ?1",
                    [draft.id.to_string()],
                    |row| row.get(0),
                )
                .map_err(|_| AuthError::Database)?;
            if child_order_count != 0 || rfq_count != 0 {
                return Err(AuthError::InvalidInput);
            }
        }
        if !is_revision
            && (revision_reason.is_some()
                || prior
                    .as_ref()
                    .is_some_and(|(status, ..)| status != "draft" && status != "rejected"))
        {
            return Err(AuthError::InvalidInput);
        }
        let previous_snapshot = if is_revision {
            Some(order_audit_snapshot(&transaction, draft.id)?)
        } else {
            None
        };
        let version = prior.as_ref().map_or(1, |(_, version, ..)| version + 1);
        let workflow_status = if is_revision { "confirmed" } else { "draft" };
        transaction
            .execute(
                "INSERT INTO local_purchase_orders (id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, currency, primary_currency, language_pair, status, workflow_status, urgency, urgency_reason, order_date, delivery_address, expected_delivery_date, notes, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, version, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'draft', ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?27)
                 ON CONFLICT(id) DO UPDATE SET display_no = excluded.display_no, country_id = excluded.country_id, project_id = excluded.project_id, site = excluded.site, department_id = excluded.department_id, team_id = excluded.team_id, applicant_id = excluded.applicant_id, currency = excluded.currency, primary_currency = excluded.primary_currency, language_pair = excluded.language_pair, urgency = excluded.urgency, urgency_reason = excluded.urgency_reason, order_date = excluded.order_date, delivery_address = excluded.delivery_address, expected_delivery_date = excluded.expected_delivery_date, notes = excluded.notes, subtotal_minor = excluded.subtotal_minor, line_discount_minor = excluded.line_discount_minor, order_discount_minor = excluded.order_discount_minor, freight_minor = excluded.freight_minor, tax_rate_basis_points = excluded.tax_rate_basis_points, tax_minor = excluded.tax_minor, total_minor = excluded.total_minor, workflow_status = excluded.workflow_status, rejection_reason = NULL, version = excluded.version, updated_at = excluded.updated_at",
                params![draft.id.to_string(), draft.display_no, draft.country_id.to_string(), draft.project_id.to_string(), draft.site, draft.department_id.to_string(), draft.team_id.to_string(), draft.applicant_id.to_string(), draft.currency, draft.primary_currency, draft.language_pair, workflow_status, draft.urgency, draft.urgency_reason, draft.order_date, draft.delivery_address, draft.expected_delivery_date, draft.notes, calculated.subtotal, calculated.line_discount, calculated.order_discount, calculated.freight, draft.tax_rate_basis_points, calculated.tax, calculated.total, version, unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        transaction
            .execute(
                "DELETE FROM local_purchase_order_items WHERE order_id = ?1",
                [draft.id.to_string()],
            )
            .map_err(|_| AuthError::Database)?;
        for line in &calculated.lines {
            let material_snapshot = material_snapshot(&transaction, &line.input)?;
            let supplier_snapshot = supplier_snapshot(&transaction, draft.country_id, &line.input)?;
            transaction
                .execute(
                    "INSERT INTO local_purchase_order_items (id, order_id, material_id, material_snapshot_json, supplier_snapshot_json, currency, quantity_decimal, unit, unit_price_minor, line_discount_json, line_freight_json, freight_included, line_total_minor, sort_order, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)",
                    params![line.input.id.to_string(), draft.id.to_string(), line.input.material_id.map(|value| value.to_string()), material_snapshot, supplier_snapshot, line.input.currency, line.input.quantity, line.input.unit, line.unit_price_minor, serde_json::to_string(&line.input.line_discount).map_err(|_| AuthError::InvalidInput)?, serde_json::to_string(&line.input.line_freight).map_err(|_| AuthError::InvalidInput)?, line.input.freight_included as i64, line.total, line.input.sort_order, unix_seconds(now)],
                )
                .map_err(|_| AuthError::Database)?;
        }
        if let (Some(previous), Some(reason)) = (previous_snapshot, revision_reason.as_deref()) {
            append_order_audit(
                &transaction,
                draft.id,
                actor_id,
                "confirmed_revised",
                Some(reason),
                Some(&previous),
                Some(&order_audit_snapshot(&transaction, draft.id)?),
                now,
            )?;
        }
        let payload = order_sync_payload(&transaction, draft.id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", draft.id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(calculated.view())
    }

    pub fn submit_requisition_draft(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        let privileged = self.require_order_mutation(now)?;
        self.require_active_scope_for_order(order_id, now)?;
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (applicant_id, status, line_count, procurement_mode, priced_line_count): (String, String, i64, Option<String>, i64) = transaction
            .query_row(
                "SELECT o.applicant_id, o.workflow_status, COUNT(i.id), o.procurement_mode, SUM(CASE WHEN i.owner_quote_source IS NOT NULL AND i.owner_source_unit_price_minor IS NOT NULL AND i.owner_locked_exchange_rate_decimal IS NOT NULL AND i.owner_converted_reference_unit_minor IS NOT NULL AND i.owner_markup_json IS NOT NULL AND i.owner_final_unit_price_minor IS NOT NULL THEN 1 ELSE 0 END) FROM local_purchase_orders o LEFT JOIN local_purchase_order_items i ON i.order_id = o.id WHERE o.id = ?1 AND o.deleted_at IS NULL GROUP BY o.id",
                [order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get::<_, Option<i64>>(4)?.unwrap_or(0))),
            )
            .map_err(|_| AuthError::Database)?;
        if status != "draft"
            || line_count == 0
            || (procurement_mode.as_deref() == Some("owner_self_purchase")
                && priced_line_count != line_count)
            || (!privileged
                && Uuid::parse_str(&applicant_id).map_err(|_| AuthError::Database)? != actor_id)
        {
            return Err(AuthError::Forbidden);
        }
        transaction
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'pending_confirmation', version = version + 1, updated_at = ?2 WHERE id = ?1",
                params![order_id.to_string(), unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            order_id,
            actor_id,
            "submitted",
            None,
            Some("draft"),
            Some("pending_confirmation"),
            now,
        )?;
        let payload = order_sync_payload(&transaction, order_id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", order_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn withdraw_requisition(&self, order_id: Uuid, now: SystemTime) -> Result<(), AuthError> {
        self.require_order_mutation(now)?;
        self.require_active_scope_for_order(order_id, now)?;
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let changed = transaction.execute(
            "UPDATE local_purchase_orders SET workflow_status = 'draft', version = version + 1, updated_at = ?2 WHERE id = ?1 AND applicant_id = ?3 AND workflow_status = 'pending_confirmation' AND parent_order_id IS NULL AND deleted_at IS NULL",
            params![order_id.to_string(), unix_seconds(now), actor_id.to_string()],
        ).map_err(|_| AuthError::Database)?;
        if changed != 1 {
            return Err(AuthError::Forbidden);
        }
        append_order_audit(
            &transaction,
            order_id,
            actor_id,
            "withdrawn",
            None,
            Some("pending_confirmation"),
            Some("draft"),
            now,
        )?;
        let payload = order_sync_payload(&transaction, order_id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", order_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn confirm_requisition(&self, order_id: Uuid, now: SystemTime) -> Result<(), AuthError> {
        if !self.require_order_mutation(now)? {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(order_id, now)?;
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (applicant_id, status): (String, String) = transaction
            .query_row(
                "SELECT applicant_id, workflow_status FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
                [order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| AuthError::Database)?;
        let is_self_approval =
            Uuid::parse_str(&applicant_id).map_err(|_| AuthError::Database)? == actor_id;
        let allow_self_approval: bool = transaction
            .query_row(
                "SELECT allow_self_approval FROM local_approval_policy WHERE singleton = 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?
            .unwrap_or(0)
            != 0;
        if status != "pending_confirmation" || (is_self_approval && !allow_self_approval) {
            return Err(AuthError::Forbidden);
        }
        transaction
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'confirmed', confirmed_by = ?2, confirmed_at = ?3, self_approved = ?4, version = version + 1, updated_at = ?3 WHERE id = ?1",
                params![order_id.to_string(), actor_id.to_string(), unix_seconds(now), is_self_approval as i64],
            )
            .map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            order_id,
            actor_id,
            if is_self_approval {
                "self_confirmed"
            } else {
                "confirmed"
            },
            None,
            Some("pending_confirmation"),
            Some("confirmed"),
            now,
        )?;
        let payload = order_sync_payload(&transaction, order_id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", order_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn approval_policy(&self, now: SystemTime) -> Result<ApprovalPolicyView, AuthError> {
        self.require_catalog_read(now)?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let allow_self_approval = connection
            .query_row(
                "SELECT allow_self_approval FROM local_approval_policy WHERE singleton = 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?
            .unwrap_or(0)
            != 0;
        Ok(ApprovalPolicyView {
            allow_self_approval,
        })
    }

    pub fn set_approval_policy(
        &self,
        allow_self_approval: bool,
        reason: String,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_role(Role::SuperAdministrator, now)?;
        if !valid_required_text(&reason, 1000) {
            return Err(AuthError::InvalidInput);
        }
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        transaction
            .execute(
                "UPDATE local_approval_policy SET allow_self_approval = ?1, updated_by = ?2, updated_at = ?3 WHERE singleton = 1",
                params![allow_self_approval as i64, actor_id.to_string(), unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        transaction
            .execute(
                "INSERT INTO local_approval_policy_audit_entries (id, actor_id, allow_self_approval, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![Uuid::new_v4().to_string(), actor_id.to_string(), allow_self_approval as i64, reason, unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn reject_requisition(
        &self,
        order_id: Uuid,
        reason: String,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if !self.require_order_mutation(now)? || !valid_required_text(&reason, 1000) {
            return Err(AuthError::Forbidden);
        }
        self.require_active_scope_for_order(order_id, now)?;
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let status: String = transaction
            .query_row(
                "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
                [order_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if status != "pending_confirmation" {
            return Err(AuthError::Forbidden);
        }
        transaction
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'rejected', rejection_reason = ?2, version = version + 1, updated_at = ?3 WHERE id = ?1",
                params![order_id.to_string(), reason, unix_seconds(now)],
            )
            .map_err(|_| AuthError::Database)?;
        append_order_audit(
            &transaction,
            order_id,
            actor_id,
            "rejected",
            Some(&reason),
            Some("pending_confirmation"),
            Some("rejected"),
            now,
        )?;
        let payload = order_sync_payload(&transaction, order_id)?;
        insert_local_sync_outbox(&transaction, "purchase_order", order_id, &payload, now)?;
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn add_order_comment(
        &self,
        order_id: Uuid,
        body: String,
        now: SystemTime,
    ) -> Result<OrderCommentView, AuthError> {
        let privileged = self.require_order_mutation(now)?;
        self.require_active_scope_for_order(order_id, now)?;
        if !valid_required_text(&body, 4000) {
            return Err(AuthError::InvalidInput);
        }
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let (applicant_id, project_id): (String, String) = transaction
            .query_row(
                "SELECT applicant_id, project_id FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
                [order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| AuthError::Database)?;
        if !privileged && applicant_id != actor_id.to_string() {
            return Err(AuthError::Forbidden);
        }
        let mut comment = OrderCommentView {
            id: Uuid::new_v4(),
            order_id,
            author_id: actor_id,
            body,
            created_at: unix_seconds(now),
            notification_count: 0,
        };
        let sync_payload = serde_json::to_string(&serde_json::json!({
            "orderId": comment.order_id,
            "authorId": comment.author_id,
            "projectId": project_id,
            "body": comment.body,
            "createdAt": comment.created_at,
        }))
        .map_err(|_| AuthError::InvalidInput)?;
        transaction
            .execute(
                "INSERT INTO local_order_comments (id, order_id, author_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![comment.id.to_string(), comment.order_id.to_string(), comment.author_id.to_string(), comment.body, comment.created_at],
            )
            .map_err(|_| AuthError::Database)?;
        for username in mentioned_usernames(&comment.body) {
            let recipient_id = transaction
                .query_row(
                    "SELECT id FROM local_accounts WHERE username = ?1 AND enabled = 1",
                    [username],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|_| AuthError::Database)?;
            if recipient_id.as_deref() == Some(&comment.author_id.to_string()) {
                continue;
            }
            if let Some(recipient_id) = recipient_id {
                comment.notification_count += transaction
                    .execute(
                        "INSERT OR IGNORE INTO local_order_notifications (id, recipient_id, order_id, comment_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![Uuid::new_v4().to_string(), recipient_id, comment.order_id.to_string(), comment.id.to_string(), comment.created_at],
                    )
                    .map_err(|_| AuthError::Database)? as i64;
            }
        }
        insert_local_sync_outbox(
            &transaction,
            "order_comment",
            comment.id,
            &sync_payload,
            now,
        )?;
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(comment)
    }

    pub fn list_order_comments(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<Vec<OrderCommentView>, AuthError> {
        let connection = self.historical_order_connection(order_id, now)?;
        let mut statement = connection
            .prepare(
                "SELECT id, order_id, author_id, body, created_at FROM local_order_comments WHERE order_id = ?1 ORDER BY created_at, id",
            )
            .map_err(|_| AuthError::Database)?;
        statement
            .query_map([order_id.to_string()], |row| {
                Ok(OrderCommentView {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    order_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    author_id: Uuid::parse_str(&row.get::<_, String>(2)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    body: row.get(3)?,
                    created_at: row.get(4)?,
                    notification_count: 0,
                })
            })
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)
    }

    pub fn list_order_audits(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<Vec<OrderAuditView>, AuthError> {
        let connection = self.historical_order_connection(order_id, now)?;
        let mut statement = connection
            .prepare(
                "SELECT id, order_id, actor_id, action, reason, previous_json, next_json, created_at FROM local_order_audit_entries WHERE order_id = ?1 ORDER BY created_at, id",
            )
            .map_err(|_| AuthError::Database)?;
        statement
            .query_map([order_id.to_string()], |row| {
                Ok(OrderAuditView {
                    id: Uuid::parse_str(&row.get::<_, String>(0)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    order_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    actor_id: Uuid::parse_str(&row.get::<_, String>(2)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    action: row.get(3)?,
                    reason: row.get(4)?,
                    previous_json: row.get(5)?,
                    next_json: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)
    }

    pub fn search_catalog(
        &self,
        query: &str,
        project_id: Option<Uuid>,
        now: SystemTime,
    ) -> Result<Vec<CatalogMaterialView>, AuthError> {
        self.require_catalog_read(now)?;
        let account_id = self.active_session_user_id()?;
        if query.len() > 255 {
            return Err(AuthError::InvalidInput);
        }
        let pattern = format!("%{}%", query.trim());
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let mut materials = connection
            .prepare(
                "SELECT id, sku, name_zh, name_fr, aliases_json, brand, model, specification, unit, notes, version
                 FROM local_materials
                 WHERE is_active = 1 AND deleted_at IS NULL
                   AND (?1 = '%%' OR name_zh LIKE ?1 COLLATE NOCASE OR COALESCE(name_fr, '') LIKE ?1 COLLATE NOCASE
                     OR aliases_json LIKE ?1 COLLATE NOCASE OR model LIKE ?1 COLLATE NOCASE
                     OR specification LIKE ?1 COLLATE NOCASE OR COALESCE(sku, '') LIKE ?1 COLLATE NOCASE)
                 ORDER BY name_zh, model
                 LIMIT 100",
            )
            .map_err(|_| AuthError::Database)?;
        let rows = materials
            .query_map([pattern], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, i64>(10)?,
                ))
            })
            .map_err(|_| AuthError::Database)?;
        let material_rows = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        if let Some(project_id) = project_id {
            let project_exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM local_projects WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL)",
                    [project_id.to_string()],
                    |row| row.get(0),
                )
                .map_err(|_| AuthError::Database)?;
            if !project_exists {
                return Err(AuthError::InvalidInput);
            }
        }
        let mut prices = connection
            .prepare(
                "SELECT p.id, s.id, s.name, s.is_preferred, p.currency, p.unit_price_minor, p.unit, p.effective_at
                 FROM local_material_prices p
                 JOIN local_suppliers s ON s.id = p.supplier_id
                 WHERE p.material_id = ?1 AND p.is_active = 1 AND p.deleted_at IS NULL
                   AND s.country_id IS NOT NULL AND s.is_active = 1 AND s.is_blacklisted = 0 AND s.deleted_at IS NULL
                   AND (?2 IS NULL OR s.country_id = (SELECT country_id FROM local_projects WHERE id = ?2 AND deleted_at IS NULL))
                   AND EXISTS (SELECT 1 FROM local_authorization_snapshots a JOIN local_projects authorized_project ON authorized_project.id = a.project_id AND authorized_project.is_active = 1 AND authorized_project.deleted_at IS NULL JOIN local_departments d ON d.id = a.department_id AND d.is_active = 1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id = a.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL WHERE a.account_id = ?3 AND a.expires_at >= ?4 AND authorized_project.country_id = s.country_id AND (?2 IS NULL OR a.project_id = ?2))
                 ORDER BY s.is_preferred DESC, p.effective_at DESC, s.name
                 LIMIT 4",
            )
            .map_err(|_| AuthError::Database)?;
        material_rows
            .into_iter()
            .map(
                |(
                    id,
                    sku,
                    name_zh,
                    name_fr,
                    aliases_json,
                    brand,
                    model,
                    specification,
                    unit,
                    notes,
                    version,
                )| {
                    let material_id = Uuid::parse_str(&id).map_err(|_| AuthError::Database)?;
                    let aliases =
                        serde_json::from_str(&aliases_json).map_err(|_| AuthError::Database)?;
                    let price_rows = prices
                        .query_map(
                            params![
                                &id,
                                project_id.map(|value| value.to_string()),
                                account_id.to_string(),
                                unix_seconds(now)
                            ],
                            |row| {
                                Ok((
                                    row.get::<_, String>(0)?,
                                    row.get::<_, String>(1)?,
                                    row.get::<_, String>(2)?,
                                    row.get::<_, i64>(3)?,
                                    row.get::<_, String>(4)?,
                                    row.get::<_, i64>(5)?,
                                    row.get::<_, String>(6)?,
                                    row.get::<_, String>(7)?,
                                ))
                            },
                        )
                        .map_err(|_| AuthError::Database)?;
                    let prices = price_rows
                        .map(|row| {
                            let (
                                price_id,
                                supplier_id,
                                supplier_name,
                                preferred,
                                currency,
                                minor,
                                unit,
                                effective_at,
                            ) = row.map_err(|_| AuthError::Database)?;
                            Ok(CatalogPriceView {
                                price_id: Uuid::parse_str(&price_id)
                                    .map_err(|_| AuthError::Database)?,
                                supplier_id: Uuid::parse_str(&supplier_id)
                                    .map_err(|_| AuthError::Database)?,
                                supplier_name,
                                is_preferred_supplier: preferred != 0,
                                currency,
                                unit_price_minor: minor.to_string(),
                                unit,
                                effective_at,
                            })
                        })
                        .collect::<Result<Vec<_>, AuthError>>()?;
                    Ok(CatalogMaterialView {
                        id: material_id,
                        sku,
                        name_zh,
                        name_fr,
                        aliases,
                        brand,
                        model,
                        specification,
                        unit,
                        notes,
                        version,
                        prices,
                    })
                },
            )
            .collect()
    }

    pub fn list_suppliers(&self, now: SystemTime) -> Result<Vec<SupplierView>, AuthError> {
        self.require_catalog_read(now)?;
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let mut statement = connection
            .prepare(
                "SELECT id, business_code, name, contact_name, address, city, country, phone, whatsapp, email,
                        payment_terms, delivery_lead_time, is_preferred, is_blacklisted, is_active, version
                 FROM local_suppliers
                 WHERE deleted_at IS NULL AND country_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM local_authorization_snapshots a JOIN local_projects p ON p.id = a.project_id AND p.is_active = 1 AND p.deleted_at IS NULL JOIN local_departments d ON d.id = a.department_id AND d.is_active = 1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id = a.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL WHERE a.account_id = ?1 AND a.expires_at >= ?2 AND p.country_id = local_suppliers.country_id)
                 ORDER BY is_active DESC, name",
            )
            .map_err(|_| AuthError::Database)?;
        statement
            .query_map(params![account_id.to_string(), unix_seconds(now)], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, i64>(12)?,
                    row.get::<_, i64>(13)?,
                    row.get::<_, i64>(14)?,
                    row.get::<_, i64>(15)?,
                ))
            })
            .map_err(|_| AuthError::Database)?
            .map(|row| {
                let (
                    id,
                    business_code,
                    name,
                    contact_name,
                    address,
                    city,
                    country,
                    phone,
                    whatsapp,
                    email,
                    payment_terms,
                    delivery_lead_time,
                    is_preferred,
                    is_blacklisted,
                    is_active,
                    version,
                ) = row.map_err(|_| AuthError::Database)?;
                Ok(SupplierView {
                    id: Uuid::parse_str(&id).map_err(|_| AuthError::Database)?,
                    business_code,
                    name,
                    contact_name,
                    address,
                    city,
                    country,
                    phone,
                    whatsapp,
                    email,
                    payment_terms,
                    delivery_lead_time,
                    is_preferred: is_preferred != 0,
                    is_blacklisted: is_blacklisted != 0,
                    is_active: is_active != 0,
                    version,
                })
            })
            .collect()
    }

    pub fn pending_sync_events(
        &self,
        limit: usize,
        now: SystemTime,
    ) -> Result<Vec<SyncOutboxEventView>, AuthError> {
        self.require_catalog_read(now)?;
        if limit == 0 || limit > 100 {
            return Err(AuthError::InvalidInput);
        }
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let mut events = connection
            .prepare("SELECT event_id, entity_type, entity_id, operation, base_version, payload_json FROM local_sync_outbox WHERE acknowledged_at IS NULL AND superseded_at IS NULL ORDER BY rowid LIMIT ?1")
            .map_err(|_| AuthError::Database)?
            .query_map([limit as i64], |row| Ok(SyncOutboxEventView {
                event_id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                entity_type: row.get(1)?, entity_id: Uuid::parse_str(&row.get::<_, String>(2)?).map_err(|_| rusqlite::Error::InvalidQuery)?, operation: row.get(3)?, base_version: row.get(4)?, payload_json: row.get(5)?
            }))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        for event in &mut events {
            if event.entity_type == "receipt"
                && serde_json::from_str::<serde_json::Value>(&event.payload_json)
                    .map_err(|_| AuthError::Database)?
                    .get("items")
                    .is_none()
            {
                let completed = serde_json::from_str::<serde_json::Value>(&event.payload_json)
                    .map_err(|_| AuthError::Database)?["completed"]
                    .as_bool()
                    .ok_or(AuthError::InvalidInput)?;
                event.payload_json = receipt_sync_payload(&connection, event.entity_id, completed)?;
            }
        }
        Ok(events)
    }

    pub fn apply_sync_acknowledgements(
        &self,
        acknowledgements: Vec<SyncAcknowledgementInput>,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_catalog_read(now)?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        for acknowledgement in acknowledgements {
            if acknowledgement.status != "accepted"
                || acknowledgement.server_version.unwrap_or(-1) < 1
            {
                continue;
            }
            let entity: Option<(String, String)> = transaction.query_row(
                "SELECT entity_type, entity_id FROM local_sync_outbox WHERE event_id = ?1 AND acknowledged_at IS NULL AND superseded_at IS NULL",
                [acknowledgement.event_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?)),
            ).optional().map_err(|_| AuthError::Database)?;
            if let Some((entity_type, entity_id)) = entity {
                transaction.execute("UPDATE local_sync_outbox SET acknowledged_at = ?2, last_error = NULL WHERE event_id = ?1", params![acknowledgement.event_id.to_string(), unix_seconds(now)]).map_err(|_| AuthError::Database)?;
                transaction.execute("INSERT INTO local_sync_entity_versions (entity_type, entity_id, server_version) VALUES (?1, ?2, ?3) ON CONFLICT(entity_type, entity_id) DO UPDATE SET server_version = MAX(server_version, excluded.server_version)", params![entity_type, entity_id, acknowledgement.server_version]).map_err(|_| AuthError::Database)?;
            }
        }
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn apply_sync_pull_page(
        &self,
        page: SyncPullPageInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_catalog_read(now)?;
        if page.changes.len() > 500 || !valid_sync_cursor(&page.next_cursor) {
            return Err(AuthError::InvalidInput);
        }
        let mut prior_cursor = -1_i64;
        for change in &page.changes {
            let cursor = parse_sync_cursor(&change.cursor)?;
            if cursor <= prior_cursor
                || !matches!(change.operation.as_str(), "upsert" | "soft_delete")
                || change.version < 1
                || !change.payload.is_object()
                || change.changed_at.len() > 64
            {
                return Err(AuthError::InvalidInput);
            }
            prior_cursor = cursor;
        }
        if !page.changes.is_empty() && parse_sync_cursor(&page.next_cursor)? < prior_cursor {
            return Err(AuthError::InvalidInput);
        }
        if self.record_divergent_attachment_pull_conflicts(&page, now)? {
            return Err(AuthError::InvalidInput);
        }
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        for change in &page.changes {
            if attachment_pull_conflict_was_kept_locally(&transaction, change)? {
                transaction.execute(
                    "INSERT INTO local_sync_entity_versions (entity_type, entity_id, server_version) VALUES (?1, ?2, ?3) ON CONFLICT(entity_type, entity_id) DO UPDATE SET server_version = MAX(server_version, excluded.server_version)",
                    params![change.entity_type, change.entity_id.to_string(), change.version],
                ).map_err(|_| AuthError::Database)?;
                continue;
            }
            let remote_payload =
                serde_json::to_string(&change.payload).map_err(|_| AuthError::Database)?;
            let pending: Option<(String, i64, String)> = transaction.query_row(
                "SELECT event_id, base_version, payload_json FROM local_sync_outbox WHERE entity_type = ?1 AND entity_id = ?2 AND acknowledged_at IS NULL AND superseded_at IS NULL ORDER BY rowid LIMIT 1",
                params![change.entity_type, change.entity_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            ).optional().map_err(|_| AuthError::Database)?;
            if let Some((event_id, base_version, local_payload)) = pending {
                let conflict_exists: bool = transaction.query_row(
                    "SELECT EXISTS(SELECT 1 FROM local_sync_conflicts WHERE event_id = ?1 AND server_version = ?2)",
                    params![event_id, change.version], |row| row.get(0),
                ).map_err(|_| AuthError::Database)?;
                if !conflict_exists {
                    transaction.execute(
                        "INSERT INTO local_sync_conflicts (id, event_id, entity_type, entity_id, base_version, server_version, local_payload_json, server_payload_json, server_operation, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                        params![Uuid::new_v4().to_string(), event_id, change.entity_type, change.entity_id.to_string(), base_version, change.version, local_payload, remote_payload, change.operation, unix_seconds(now)],
                    ).map_err(|_| AuthError::Database)?;
                }
                continue;
            }
            transaction.execute(
                "INSERT INTO local_sync_remote_entities (entity_type, entity_id, operation, server_version, payload_json, changed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(entity_type, entity_id) DO UPDATE SET operation = excluded.operation, server_version = excluded.server_version, payload_json = excluded.payload_json, changed_at = excluded.changed_at WHERE excluded.server_version >= local_sync_remote_entities.server_version",
                params![change.entity_type, change.entity_id.to_string(), change.operation, change.version, remote_payload, change.changed_at],
            ).map_err(|_| AuthError::Database)?;
            project_remote_catalog_change(&transaction, change, now)?;
            project_remote_master_data_change(&transaction, change, now)?;
            transaction.execute(
                "INSERT INTO local_sync_entity_versions (entity_type, entity_id, server_version) VALUES (?1, ?2, ?3) ON CONFLICT(entity_type, entity_id) DO UPDATE SET server_version = MAX(server_version, excluded.server_version)",
                params![change.entity_type, change.entity_id.to_string(), change.version],
            ).map_err(|_| AuthError::Database)?;
        }
        project_staged_purchase_orders(&transaction, now)?;
        project_staged_order_comments(&transaction)?;
        project_staged_receipts(&transaction)?;
        project_staged_procurement_expenditures(&transaction)?;
        project_staged_attachments(&transaction)?;
        transaction.execute(
            "UPDATE local_sync_state SET last_pull_cursor = ?1, last_success_at = ?2 WHERE singleton = 1",
            params![page.next_cursor, unix_seconds(now)],
        ).map_err(|_| AuthError::Database)?;
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn list_sync_conflicts(&self, now: SystemTime) -> Result<Vec<SyncConflictView>, AuthError> {
        self.require_conflict_resolution(now)?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        connection.prepare("SELECT id, entity_type, entity_id, server_version, local_payload_json, server_payload_json, server_operation FROM (SELECT id, entity_type, entity_id, server_version, local_payload_json, server_payload_json, server_operation, created_at FROM local_sync_conflicts WHERE resolved_at IS NULL UNION ALL SELECT id, 'attachment', attachment_id, server_version, local_payload_json, server_payload_json, 'upsert', created_at FROM local_attachment_pull_conflicts WHERE resolved_at IS NULL) ORDER BY created_at, id")
            .map_err(|_| AuthError::Database)?
            .query_map([], |row| Ok(SyncConflictView { id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?, entity_type: row.get(1)?, entity_id: Uuid::parse_str(&row.get::<_, String>(2)?).map_err(|_| rusqlite::Error::InvalidQuery)?, server_version: row.get(3)?, local_payload_json: row.get(4)?, server_payload_json: row.get(5)?, server_operation: row.get(6)? }))
            .map_err(|_| AuthError::Database)?.collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)
    }

    fn record_divergent_attachment_pull_conflicts(
        &self,
        page: &SyncPullPageInput,
        now: SystemTime,
    ) -> Result<bool, AuthError> {
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let mut found = false;
        for change in page
            .changes
            .iter()
            .filter(|change| change.entity_type == "attachment")
        {
            if change.operation != "upsert" {
                continue;
            }
            let remote: RemoteAttachmentPayload =
                match serde_json::from_value(change.payload.clone()) {
                    Ok(remote) => remote,
                    Err(_) => continue,
                };
            if remote.id != change.entity_id {
                continue;
            }
            let local: Option<(String, String, String, String, String, String, i64, String, String, i64)> = transaction.query_row(
                "SELECT owner_type, owner_id, order_id, project_id, original_name, content_type, byte_length, checksum, uploader_id, created_at FROM local_attachments WHERE id = ?1",
                [remote.id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?)),
            ).optional().map_err(|_| AuthError::Database)?;
            let Some(local) = local else {
                continue;
            };
            let expected = (
                remote.owner_type.clone(),
                remote.owner_id.to_string(),
                remote.order_id.to_string(),
                remote.project_id.to_string(),
                remote.original_name.clone(),
                remote.content_type.clone(),
                remote.byte_length,
                remote.checksum.clone(),
                remote.uploader_id.to_string(),
                remote.created_at,
            );
            if local == expected {
                continue;
            }
            let server_payload_json =
                serde_json::to_string(&change.payload).map_err(|_| AuthError::Database)?;
            let existing: Option<(String, Option<i64>)> = transaction.query_row(
                "SELECT server_payload_json, resolved_at FROM local_attachment_pull_conflicts WHERE attachment_id = ?1 AND server_version = ?2",
                params![remote.id.to_string(), change.version],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).optional().map_err(|_| AuthError::Database)?;
            if let Some((prior_payload, resolved_at)) = existing {
                if prior_payload != server_payload_json {
                    return Err(AuthError::InvalidInput);
                }
                if resolved_at.is_none() {
                    found = true;
                }
                continue;
            }
            let local_payload_json = serde_json::to_string(&serde_json::json!({
                "id": remote.id, "ownerType": local.0, "ownerId": local.1,
                "orderId": local.2, "projectId": local.3, "originalName": local.4,
                "contentType": local.5, "byteLength": local.6, "checksum": local.7,
                "uploaderId": local.8, "createdAt": local.9,
            }))
            .map_err(|_| AuthError::Database)?;
            transaction.execute(
                "INSERT INTO local_attachment_pull_conflicts (id, attachment_id, server_version, local_payload_json, server_payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![Uuid::new_v4().to_string(), remote.id.to_string(), change.version, local_payload_json, server_payload_json, unix_seconds(now)],
            ).map_err(|_| AuthError::Database)?;
            found = true;
        }
        transaction.commit().map_err(|_| AuthError::Database)?;
        Ok(found)
    }

    pub fn resolve_sync_conflict(
        &self,
        input: ResolveSyncConflictInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_conflict_resolution(now)?;
        if !matches!(input.resolution.as_str(), "keep_local" | "use_server")
            || !valid_required_text(&input.reason, 1000)
        {
            return Err(AuthError::InvalidInput);
        }
        let actor_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        let attachment_conflict: Option<String> = transaction.query_row(
            "SELECT attachment_id FROM local_attachment_pull_conflicts WHERE id = ?1 AND resolved_at IS NULL",
            [input.conflict_id.to_string()],
            |row| row.get(0),
        ).optional().map_err(|_| AuthError::Database)?;
        if attachment_conflict.is_some() {
            if input.resolution != "keep_local" {
                return Err(AuthError::InvalidInput);
            }
            transaction.execute(
                "UPDATE local_attachment_pull_conflicts SET resolved_at = ?2, resolved_by = ?3, resolution_reason = ?4 WHERE id = ?1",
                params![input.conflict_id.to_string(), unix_seconds(now), actor_id.to_string(), input.reason],
            ).map_err(|_| AuthError::Database)?;
            return transaction.commit().map_err(|_| AuthError::Database);
        }
        let row: (String, String, String, i64, String, String, String) = transaction.query_row("SELECT c.entity_type, c.entity_id, c.event_id, c.server_version, c.local_payload_json, c.server_payload_json, c.server_operation FROM local_sync_conflicts c WHERE c.id = ?1 AND c.resolved_at IS NULL", [input.conflict_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?))).map_err(|_| AuthError::InvalidInput)?;
        let entity_id = Uuid::parse_str(&row.1).map_err(|_| AuthError::Database)?;
        if !is_directly_resolvable_sync_entity(&row.0) {
            return Err(AuthError::InvalidInput);
        }
        transaction.execute("UPDATE local_sync_outbox SET superseded_at = ?2, last_error = 'resolved_by_administrator' WHERE event_id = ?1", params![row.2, unix_seconds(now)]).map_err(|_| AuthError::Database)?;
        transaction.execute("INSERT INTO local_sync_entity_versions (entity_type, entity_id, server_version) VALUES (?1, ?2, ?3) ON CONFLICT(entity_type, entity_id) DO UPDATE SET server_version = MAX(server_version, excluded.server_version)", params![row.0, row.1, row.3]).map_err(|_| AuthError::Database)?;
        if input.resolution == "keep_local" {
            transaction.execute("INSERT INTO local_sync_outbox (event_id, entity_type, entity_id, operation, base_version, payload_json, created_at) VALUES (?1, ?2, ?3, 'upsert', ?4, ?5, ?6)", params![Uuid::new_v4().to_string(), row.0, entity_id.to_string(), row.3, row.4, unix_seconds(now)]).map_err(|_| AuthError::Database)?;
        } else {
            let payload = serde_json::from_str(&row.5).map_err(|_| AuthError::Database)?;
            let change = SyncPullChangeInput {
                cursor: "0".into(),
                entity_type: row.0.clone(),
                entity_id,
                operation: row.6.clone(),
                version: row.3,
                payload,
                changed_at: "resolved".into(),
            };
            project_remote_catalog_change(&transaction, &change, now)?;
            project_remote_master_data_change(&transaction, &change, now)?;
            project_remote_order_comment(&transaction, &change)?;
        }
        transaction.execute("UPDATE local_sync_conflicts SET resolved_at = ?2, resolved_by = ?3, resolution_reason = ?4 WHERE id = ?1", params![input.conflict_id.to_string(), unix_seconds(now), actor_id.to_string(), input.reason]).map_err(|_| AuthError::Database)?;
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub fn cache_sync_access_token(&self, account_id: Uuid, token: &str) -> Result<(), AuthError> {
        if token.len() < 32 {
            return Err(AuthError::InvalidInput);
        }
        self.credential_vault.save_sync_token(account_id, token)?;
        self.connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .execute(
                "UPDATE local_sync_state SET last_authenticated_user_id = ?1 WHERE singleton = 1",
                [account_id.to_string()],
            )
            .map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub async fn push_pending_https(&self, now: SystemTime) -> Result<SyncPushView, AuthError> {
        self.push_pending_https_with_progress(now, None).await
    }

    async fn push_pending_https_with_progress(
        &self,
        now: SystemTime,
        reporter: Option<AttachmentTransferReporter>,
    ) -> Result<SyncPushView, AuthError> {
        self.require_catalog_read(now)?;
        self.refresh_authorization_https(now).await?;
        let events = self.pending_sync_events(100, now)?;
        if events.is_empty() {
            let transfer = self
                .upload_pending_attachments_https_with_progress(now, reporter.clone())
                .await;
            let attachment_sync_failed = transfer.is_err();
            let transfer = transfer.unwrap_or_default();
            return Ok(SyncPushView {
                accepted_count: 0,
                pending_count: 0,
                pending_attachment_count: self.pending_attachment_count("pending_upload")?,
                attachment_sync_failed,
                attachment_transfer_count: transfer.count,
                attachment_transfer_bytes: transfer.bytes,
            });
        }
        let account_id = self.active_session_user_id()?;
        let token = self
            .credential_vault
            .load_sync_token(account_id)?
            .ok_or(AuthError::NoActiveSession)?;
        let installation_id: String = self
            .connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .query_row(
                "SELECT installation_id FROM local_sync_state WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        let endpoint = sync_push_endpoint()?;
        let request_events = events.iter().map(|event| serde_json::json!({
            "eventId": event.event_id,
            "entityType": event.entity_type,
            "entityId": event.entity_id,
            "operation": event.operation,
            "baseVersion": event.base_version,
            "payload": serde_json::from_str::<serde_json::Value>(&event.payload_json).unwrap_or(serde_json::Value::Null),
        })).collect::<Vec<_>>();
        if request_events
            .iter()
            .any(|event| event["payload"].is_null())
        {
            return Err(AuthError::Database);
        }
        let response = reqwest::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AuthError::SyncTransport)?
            .post(endpoint)
            .bearer_auth(token)
            .json(&serde_json::json!({ "deviceId": installation_id, "events": request_events }))
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AuthError::NoActiveSession);
        }
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        let acknowledgements = response
            .json::<SyncPushResponse>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        let accepted_count = acknowledgements
            .results
            .iter()
            .filter(|result| result.status == "accepted")
            .count();
        self.apply_sync_acknowledgements(acknowledgements.results, now)?;
        let transfer = self
            .upload_pending_attachments_https_with_progress(now, reporter)
            .await;
        let attachment_sync_failed = transfer.is_err();
        let transfer = transfer.unwrap_or_default();
        Ok(SyncPushView {
            accepted_count,
            pending_count: self.pending_sync_events(100, now)?.len(),
            pending_attachment_count: self.pending_attachment_count("pending_upload")?,
            attachment_sync_failed,
            attachment_transfer_count: transfer.count,
            attachment_transfer_bytes: transfer.bytes,
        })
    }

    pub async fn pull_sync_https(&self, now: SystemTime) -> Result<SyncPullView, AuthError> {
        self.pull_sync_https_with_progress(now, None).await
    }

    async fn pull_sync_https_with_progress(
        &self,
        now: SystemTime,
        reporter: Option<AttachmentTransferReporter>,
    ) -> Result<SyncPullView, AuthError> {
        self.require_catalog_read(now)?;
        self.refresh_authorization_https(now).await?;
        let account_id = self.active_session_user_id()?;
        let token = self
            .credential_vault
            .load_sync_token(account_id)?
            .ok_or(AuthError::NoActiveSession)?;
        let mut cursor: String = self
            .connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .query_row(
                "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        let endpoint = sync_pull_endpoint()?;
        let client = reqwest::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AuthError::SyncTransport)?;
        let mut applied_count = 0;
        loop {
            let response = client
                .get(endpoint.clone())
                .bearer_auth(&token)
                .query(&[("cursor", cursor.as_str()), ("limit", "500")])
                .send()
                .await
                .map_err(|_| AuthError::SyncTransport)?;
            if response.status() == reqwest::StatusCode::UNAUTHORIZED {
                return Err(AuthError::NoActiveSession);
            }
            if !response.status().is_success() {
                return Err(AuthError::SyncTransport);
            }
            let page = response
                .json::<SyncPullPageInput>()
                .await
                .map_err(|_| AuthError::SyncTransport)?;
            let has_more = pull_page_has_more(&cursor, &page)?;
            let next_cursor = page.next_cursor.clone();
            applied_count += page.changes.len();
            self.apply_sync_pull_page(page, now)?;
            cursor = next_cursor;
            if !has_more {
                break;
            }
        }
        let transfer = self
            .download_pending_attachments_https_with_progress(now, reporter)
            .await;
        let attachment_sync_failed = transfer.is_err();
        let transfer = transfer.unwrap_or_default();
        Ok(SyncPullView {
            applied_count,
            next_cursor: cursor,
            pending_attachment_count: self.pending_attachment_count("pending_download")?,
            attachment_sync_failed,
            attachment_transfer_count: transfer.count,
            attachment_transfer_bytes: transfer.bytes,
        })
    }

    fn pending_attachment_count(&self, state: &str) -> Result<usize, AuthError> {
        self.connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .query_row(
                "SELECT COUNT(*) FROM local_attachments WHERE upload_state = ?1",
                [state],
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count as usize)
            .map_err(|_| AuthError::Database)
    }

    fn require_master_data_mutation(&self, now: SystemTime) -> Result<(), AuthError> {
        for role in [
            Role::SuperAdministrator,
            Role::Administrator,
            Role::Purchaser,
        ] {
            match self.require_role(role, now) {
                Ok(()) => return Ok(()),
                Err(AuthError::Forbidden) => continue,
                Err(error) => return Err(error),
            }
        }
        Err(AuthError::Forbidden)
    }

    fn require_catalog_read(&self, now: SystemTime) -> Result<(), AuthError> {
        for role in [
            Role::SuperAdministrator,
            Role::Administrator,
            Role::Purchaser,
            Role::Engineer,
            Role::Viewer,
        ] {
            match self.require_role(role, now) {
                Ok(()) => return Ok(()),
                Err(AuthError::Forbidden) => continue,
                Err(error) => return Err(error),
            }
        }
        Err(AuthError::Forbidden)
    }

    fn require_order_mutation(&self, now: SystemTime) -> Result<bool, AuthError> {
        match self.require_role(Role::Purchaser, now) {
            Ok(()) => Ok(true),
            Err(AuthError::Forbidden) => match self.require_role(Role::Administrator, now) {
                Ok(()) => Ok(true),
                Err(AuthError::Forbidden) => {
                    self.require_role(Role::Engineer, now)?;
                    Ok(false)
                }
                Err(error) => Err(error),
            },
            Err(error) => Err(error),
        }
    }

    fn active_session_user_id(&self) -> Result<Uuid, AuthError> {
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let user_id = connection
            .query_row("SELECT user_id FROM local_session", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|_| AuthError::Database)?
            .ok_or(AuthError::NoActiveSession)?;
        Uuid::parse_str(&user_id).map_err(|_| AuthError::Database)
    }

    fn historical_order_connection(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<MutexGuard<'_, Connection>, AuthError> {
        self.require_catalog_read(now)?;
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let authorized: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_purchase_orders o JOIN local_authorization_snapshots a ON a.account_id = ?2 AND a.project_id = o.project_id AND a.department_id = o.department_id AND a.team_id = o.team_id WHERE o.id = ?1 AND o.deleted_at IS NULL)",
            params![order_id.to_string(), account_id.to_string()],
            |row| row.get(0),
        ).map_err(|_| AuthError::Database)?;
        if authorized {
            Ok(connection)
        } else {
            Err(AuthError::Forbidden)
        }
    }

    fn require_active_scope_for_order(
        &self,
        order_id: Uuid,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let authorized: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_purchase_orders o JOIN local_authorization_snapshots a ON a.account_id = ?2 AND a.project_id = o.project_id AND a.department_id = o.department_id AND a.team_id = o.team_id AND a.expires_at >= ?3 JOIN local_projects p ON p.id = o.project_id AND p.country_id = o.country_id AND p.is_active = 1 AND p.deleted_at IS NULL JOIN local_departments d ON d.id = o.department_id AND d.is_active = 1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id = o.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL WHERE o.id = ?1 AND o.deleted_at IS NULL)",
                params![order_id.to_string(), account_id.to_string(), unix_seconds(now)],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if authorized {
            Ok(())
        } else {
            Err(AuthError::Forbidden)
        }
    }

    fn require_active_scope_for_country(
        &self,
        country_id: Option<Uuid>,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let authorized: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_authorization_snapshots a JOIN local_projects p ON p.id = a.project_id AND p.is_active = 1 AND p.deleted_at IS NULL JOIN local_departments d ON d.id = a.department_id AND d.is_active = 1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id = a.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL WHERE a.account_id = ?1 AND a.expires_at >= ?2 AND (?3 IS NULL OR p.country_id = ?3))",
            params![account_id.to_string(), unix_seconds(now), country_id.map(|value| value.to_string())],
            |row| row.get(0),
        ).map_err(|_| AuthError::Database)?;
        if authorized {
            Ok(())
        } else {
            Err(AuthError::Forbidden)
        }
    }

    fn replace_authorization_snapshots(
        &self,
        scopes: &[CloudAuthorizationScope],
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if scopes.len() > 5_000 {
            return Err(AuthError::InvalidInput);
        }
        let mut unique = HashSet::new();
        for scope in scopes {
            if !unique.insert((scope.project_id, scope.department_id, scope.team_id))
                || !valid_required_text(&scope.site, 255)
                || currency_minor_digits(&scope.currency).is_err()
                || !matches!(scope.language_pair.as_str(), "zh_fr" | "zh_en")
            {
                return Err(AuthError::InvalidInput);
            }
        }
        let account_id = self.active_session_user_id()?;
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        transaction
            .execute(
                "DELETE FROM local_authorization_snapshots WHERE account_id = ?1",
                [account_id.to_string()],
            )
            .map_err(|_| AuthError::Database)?;
        for scope in scopes {
            transaction
                .execute(
                    "INSERT INTO local_authorization_snapshots (account_id, project_id, department_id, team_id, verified_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![account_id.to_string(), scope.project_id.to_string(), scope.department_id.to_string(), scope.team_id.to_string(), unix_seconds(now), unix_seconds(now + AUTHORIZATION_CACHE_WINDOW)],
                )
                .map_err(|_| AuthError::Database)?;
        }
        transaction.commit().map_err(|_| AuthError::Database)
    }

    pub async fn refresh_authorization_https(&self, now: SystemTime) -> Result<(), AuthError> {
        self.require_catalog_read(now)?;
        let account_id = self.active_session_user_id()?;
        let token = self
            .credential_vault
            .load_sync_token(account_id)?
            .ok_or(AuthError::NoActiveSession)?;
        let endpoint = authorization_context_endpoint()?;
        let response = reqwest::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AuthError::SyncTransport)?
            .get(endpoint)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AuthError::NoActiveSession);
        }
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        let scopes = response
            .json::<Vec<CloudAuthorizationScope>>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        self.replace_authorization_snapshots(&scopes, now)
    }

    fn authorization_management_token(&self, now: SystemTime) -> Result<String, AuthError> {
        match self.require_role(Role::Administrator, now) {
            Ok(()) => {}
            Err(AuthError::Forbidden) => self.require_role(Role::SuperAdministrator, now)?,
            Err(error) => return Err(error),
        }
        let account_id = self.active_session_user_id()?;
        self.credential_vault
            .load_sync_token(account_id)?
            .ok_or(AuthError::NoActiveSession)
    }

    pub async fn list_managed_authorizations(
        &self,
        account_id: Uuid,
        now: SystemTime,
    ) -> Result<Vec<CloudAuthorizationScope>, AuthError> {
        let token = self.authorization_management_token(now)?;
        let endpoint = authorization_binding_endpoint(account_id)?;
        let response = reqwest::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AuthError::SyncTransport)?
            .get(endpoint)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AuthError::NoActiveSession);
        }
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(AuthError::Forbidden);
        }
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        response
            .json::<Vec<CloudAuthorizationScope>>()
            .await
            .map_err(|_| AuthError::SyncTransport)
    }

    pub async fn change_managed_authorization(
        &self,
        account_id: Uuid,
        binding: ManagedAuthorizationBinding,
        revoke: bool,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        let token = self.authorization_management_token(now)?;
        let endpoint = authorization_binding_endpoint(account_id)?;
        let client = reqwest::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AuthError::SyncTransport)?;
        let request = if revoke {
            client.delete(endpoint)
        } else {
            client.put(endpoint)
        };
        let response = request
            .bearer_auth(token)
            .json(&binding)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AuthError::NoActiveSession);
        }
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(AuthError::Forbidden);
        }
        if response.status() == reqwest::StatusCode::BAD_REQUEST {
            return Err(AuthError::InvalidInput);
        }
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        if account_id == self.active_session_user_id()? {
            self.refresh_authorization_https(now).await?;
        }
        Ok(())
    }

    pub async fn replace_managed_authorization(
        &self,
        account_id: Uuid,
        replacement: ManagedAuthorizationReplacement,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        let token = self.authorization_management_token(now)?;
        let response = reqwest::Client::builder()
            .https_only(true)
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AuthError::SyncTransport)?
            .patch(authorization_binding_endpoint(account_id)?)
            .bearer_auth(token)
            .json(&replacement)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AuthError::NoActiveSession);
        }
        if response.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(AuthError::Forbidden);
        }
        if response.status() == reqwest::StatusCode::BAD_REQUEST {
            return Err(AuthError::InvalidInput);
        }
        if !response.status().is_success() {
            return Err(AuthError::SyncTransport);
        }
        if account_id == self.active_session_user_id()? {
            self.refresh_authorization_https(now).await?;
        }
        Ok(())
    }

    pub fn authorization_context(
        &self,
        now: SystemTime,
    ) -> Result<AuthorizationContextView, AuthError> {
        self.require_catalog_read(now)?;
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        connection.query_row(
            "SELECT p.country_id, p.id, p.name, p.site, d.id, d.name, t.id, t.name, p.default_currency, p.default_currency, p.default_language_pair
             FROM local_authorization_snapshots a
             JOIN local_projects p ON p.id = a.project_id AND p.is_active = 1 AND p.deleted_at IS NULL
             JOIN local_departments d ON d.id = a.department_id AND d.is_active = 1 AND d.deleted_at IS NULL
             JOIN local_teams t ON t.id = a.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL
             LEFT JOIN local_selected_authorization_contexts s ON s.account_id = a.account_id AND s.project_id = a.project_id AND s.department_id = a.department_id AND s.team_id = a.team_id
             WHERE a.account_id = ?1 AND a.expires_at >= ?2
             ORDER BY (s.account_id IS NOT NULL) DESC, a.verified_at DESC, p.name, d.name, t.name LIMIT 1",
            params![account_id.to_string(), unix_seconds(now)],
            |row| Ok(AuthorizationContextView {
                country_id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                project_id: Uuid::parse_str(&row.get::<_, String>(1)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                project_name: row.get(2)?,
                site: row.get(3)?,
                department_id: Uuid::parse_str(&row.get::<_, String>(4)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                department_name: row.get(5)?,
                team_id: Uuid::parse_str(&row.get::<_, String>(6)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                team_name: row.get(7)?,
                currency: row.get(8)?,
                primary_currency: row.get(9)?,
                language_pair: row.get(10)?,
            }),
        ).optional().map_err(|_| AuthError::Database)?.ok_or(AuthError::Forbidden)
    }

    pub fn list_authorization_contexts(
        &self,
        now: SystemTime,
    ) -> Result<Vec<AuthorizationContextView>, AuthError> {
        self.require_catalog_read(now)?;
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let mut statement = connection.prepare("SELECT p.country_id, p.id, p.name, p.site, d.id, d.name, t.id, t.name, p.default_currency, p.default_currency, p.default_language_pair FROM local_authorization_snapshots a JOIN local_projects p ON p.id = a.project_id AND p.is_active = 1 AND p.deleted_at IS NULL JOIN local_departments d ON d.id = a.department_id AND d.is_active = 1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id = a.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL WHERE a.account_id = ?1 AND a.expires_at >= ?2 ORDER BY p.name, d.name, t.name").map_err(|_| AuthError::Database)?;
        statement
            .query_map(params![account_id.to_string(), unix_seconds(now)], |row| {
                Ok(AuthorizationContextView {
                    country_id: Uuid::parse_str(&row.get::<_, String>(0)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    project_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    project_name: row.get(2)?,
                    site: row.get(3)?,
                    department_id: Uuid::parse_str(&row.get::<_, String>(4)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    department_name: row.get(5)?,
                    team_id: Uuid::parse_str(&row.get::<_, String>(6)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                    team_name: row.get(7)?,
                    currency: row.get(8)?,
                    primary_currency: row.get(9)?,
                    language_pair: row.get(10)?,
                })
            })
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)
    }

    pub fn select_authorization_context(
        &self,
        selection: AuthorizationContextSelectionInput,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        self.require_catalog_read(now)?;
        let account_id = self.active_session_user_id()?;
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let valid: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM local_authorization_snapshots a JOIN local_projects p ON p.id = a.project_id AND p.is_active = 1 AND p.deleted_at IS NULL JOIN local_departments d ON d.id = a.department_id AND d.is_active = 1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id = a.team_id AND t.department_id = d.id AND t.is_active = 1 AND t.deleted_at IS NULL WHERE a.account_id = ?1 AND a.project_id = ?2 AND a.department_id = ?3 AND a.team_id = ?4 AND a.expires_at >= ?5)", params![account_id.to_string(), selection.project_id.to_string(), selection.department_id.to_string(), selection.team_id.to_string(), unix_seconds(now)], |row| row.get(0)).map_err(|_| AuthError::Database)?;
        if !valid {
            return Err(AuthError::Forbidden);
        }
        connection.execute("INSERT INTO local_selected_authorization_contexts (account_id, project_id, department_id, team_id, selected_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(account_id) DO UPDATE SET project_id = excluded.project_id, department_id = excluded.department_id, team_id = excluded.team_id, selected_at = excluded.selected_at", params![account_id.to_string(), selection.project_id.to_string(), selection.department_id.to_string(), selection.team_id.to_string(), unix_seconds(now)]).map_err(|_| AuthError::Database)?;
        Ok(())
    }

    pub fn lock(&self) -> Result<(), AuthError> {
        self.connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .execute("DELETE FROM local_session", [])
            .map_err(|_| AuthError::Database)?;
        Ok(())
    }
}

pub mod commands {
    use super::{
        AttachmentTransferReporter, AuthError, AuthenticatedSession, CaptchaChallenge,
        LocalAuthService,
    };
    use serde::{Deserialize, Serialize};
    use std::{sync::Arc, time::SystemTime};
    use tauri::{AppHandle, Emitter, State};
    use uuid::Uuid;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct OfflineLoginRequest {
        pub username: String,
        pub password: String,
        pub captcha_id: Uuid,
        pub captcha_answer: u8,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct OnlineLoginRequest {
        pub username: String,
        pub password: String,
        pub local_captcha_id: Uuid,
        pub local_captcha_answer: u8,
        pub cloud_captcha_id: Uuid,
        pub cloud_captcha_answer: String,
    }

    #[derive(Serialize)]
    pub struct CommandError {
        pub code: &'static str,
    }

    impl From<AuthError> for CommandError {
        fn from(error: AuthError) -> Self {
            let code = match error {
                AuthError::InvalidCredentials => "invalid_credentials",
                AuthError::OfflineWindowExpired => "offline_window_expired",
                AuthError::AccountLocked => "account_locked",
                AuthError::NoActiveSession => "reauthentication_required",
                AuthError::Forbidden => "forbidden",
                AuthError::Database => "local_storage_error",
                AuthError::InvalidInput => "invalid_input",
                AuthError::ImmutableBusinessCode => "immutable_business_code",
                AuthError::PasswordHashing | AuthError::SecureStorage => "credential_storage_error",
                AuthError::SyncTransport => "sync_transport_error",
            };
            Self { code }
        }
    }

    #[tauri::command]
    pub fn get_requisition_detail(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<super::RequisitionDetailView, CommandError> {
        auth.get_requisition_detail(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_requisition_history(
        auth: State<'_, LocalAuthService>,
        cursor: Option<super::RequisitionHistoryCursor>,
        filter: Option<super::RequisitionHistoryFilter>,
    ) -> Result<super::RequisitionHistoryPageView, CommandError> {
        auth.list_requisition_history(cursor, filter.unwrap_or_default(), SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_confirmed_procurement_orders(
        auth: State<'_, LocalAuthService>,
    ) -> Result<Vec<super::ProcurementExecutionOrderView>, CommandError> {
        auth.list_confirmed_procurement_orders(SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn start_honsen_market_execution(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<(), CommandError> {
        auth.start_honsen_market_execution(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn allocate_supplier_child_orders(
        auth: State<'_, LocalAuthService>,
        parent_order_id: Uuid,
        allocations: Vec<super::SupplierChildAllocationInput>,
    ) -> Result<Vec<super::SupplierChildOrderView>, CommandError> {
        auth.allocate_supplier_child_orders(parent_order_id, allocations, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn close_supplier_order_with_conditions(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
        reason: String,
    ) -> Result<(), CommandError> {
        auth.close_supplier_order_with_conditions(order_id, reason, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub async fn push_pending_sync(
        app: AppHandle,
        auth: State<'_, LocalAuthService>,
    ) -> Result<super::SyncPushView, CommandError> {
        let reporter: AttachmentTransferReporter = Arc::new(move |progress| {
            let _ = app.emit("attachment-transfer-progress", progress);
        });
        auth.push_pending_https_with_progress(SystemTime::now(), Some(reporter))
            .await
            .map_err(Into::into)
    }

    #[tauri::command]
    pub async fn pull_sync(
        app: AppHandle,
        auth: State<'_, LocalAuthService>,
    ) -> Result<super::SyncPullView, CommandError> {
        let reporter: AttachmentTransferReporter = Arc::new(move |progress| {
            let _ = app.emit("attachment-transfer-progress", progress);
        });
        auth.pull_sync_https_with_progress(SystemTime::now(), Some(reporter))
            .await
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_sync_conflicts(
        auth: State<'_, LocalAuthService>,
    ) -> Result<Vec<super::SyncConflictView>, CommandError> {
        auth.list_sync_conflicts(SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn resolve_sync_conflict(
        auth: State<'_, LocalAuthService>,
        input: super::ResolveSyncConflictInput,
    ) -> Result<(), CommandError> {
        auth.resolve_sync_conflict(input, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn create_rfq(
        auth: State<'_, LocalAuthService>,
        input: super::CreateRfqInput,
    ) -> Result<super::RfqView, CommandError> {
        auth.create_rfq(input, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_owner_purchase_pricing(
        auth: State<'_, LocalAuthService>,
        input: super::OwnerPurchasePricingInput,
    ) -> Result<Vec<super::OwnerLinePricingView>, CommandError> {
        auth.save_owner_purchase_pricing(input, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn set_procurement_mode(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
        mode: String,
    ) -> Result<(), CommandError> {
        auth.set_procurement_mode(order_id, mode, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn record_receipt(
        auth: State<'_, LocalAuthService>,
        input: super::RecordReceiptInput,
    ) -> Result<super::ReceiptView, CommandError> {
        auth.record_receipt(input, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_procurement_expenditures(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<Vec<super::ProcurementExpenditureView>, CommandError> {
        auth.list_procurement_expenditures(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn record_procurement_expenditure(
        auth: State<'_, LocalAuthService>,
        input: super::RecordProcurementExpenditureInput,
    ) -> Result<super::ProcurementExpenditureView, CommandError> {
        auth.record_procurement_expenditure(input, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn reverse_procurement_expenditure(
        auth: State<'_, LocalAuthService>,
        expenditure_id: Uuid,
        reversal_id: Uuid,
        reason: String,
    ) -> Result<super::ProcurementExpenditureView, CommandError> {
        auth.reverse_procurement_expenditure(expenditure_id, reversal_id, reason, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_expenditure_vouchers(
        auth: State<'_, LocalAuthService>,
        expenditure_id: Uuid,
    ) -> Result<Vec<super::ExpenditureVoucherView>, CommandError> {
        auth.list_expenditure_vouchers(expenditure_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub async fn choose_expenditure_voucher(
        app: tauri::AppHandle,
        auth: State<'_, LocalAuthService>,
        expenditure_id: Uuid,
    ) -> Result<Option<super::ExpenditureVoucherView>, CommandError> {
        use tauri_plugin_dialog::DialogExt;
        let Some(path) = app.dialog().file().blocking_pick_file() else {
            return Ok(None);
        };
        let path = path
            .into_path()
            .map_err(|_| CommandError::from(super::AuthError::InvalidInput))?;
        auth.archive_expenditure_voucher(expenditure_id, &path, SystemTime::now())
            .map(Some)
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_receipt_attachments(
        auth: State<'_, LocalAuthService>,
        receipt_id: Uuid,
    ) -> Result<Vec<super::ReceiptAttachmentView>, CommandError> {
        auth.list_receipt_attachments(receipt_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub async fn choose_receipt_attachment(
        app: tauri::AppHandle,
        auth: State<'_, LocalAuthService>,
        receipt_id: Uuid,
    ) -> Result<Option<super::ReceiptAttachmentView>, CommandError> {
        use tauri_plugin_dialog::DialogExt;
        let Some(path) = app.dialog().file().blocking_pick_file() else {
            return Ok(None);
        };
        let path = path
            .into_path()
            .map_err(|_| CommandError::from(super::AuthError::InvalidInput))?;
        auth.archive_receipt_attachment(receipt_id, &path, SystemTime::now())
            .map(Some)
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_supplier_child_terms(
        auth: State<'_, LocalAuthService>,
        input: super::SupplierChildTermsInput,
    ) -> Result<super::RequisitionTotalsView, CommandError> {
        auth.save_supplier_child_terms(input, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn send_supplier_order(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<(), CommandError> {
        auth.send_supplier_order(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn issue_local_captcha(
        auth: State<'_, LocalAuthService>,
    ) -> Result<CaptchaChallenge, CommandError> {
        auth.issue_captcha(SystemTime::now()).map_err(Into::into)
    }

    #[tauri::command]
    pub async fn issue_cloud_captcha(
        auth: State<'_, LocalAuthService>,
    ) -> Result<super::CloudCaptchaChallenge, CommandError> {
        auth.issue_cloud_captcha().await.map_err(Into::into)
    }

    #[tauri::command]
    pub async fn online_login(
        auth: State<'_, LocalAuthService>,
        request: OnlineLoginRequest,
    ) -> Result<AuthenticatedSession, CommandError> {
        auth.online_login(
            &request.username,
            &request.password,
            request.local_captcha_id,
            request.local_captcha_answer,
            request.cloud_captcha_id,
            &request.cloud_captcha_answer,
            SystemTime::now(),
        )
        .await
        .map_err(Into::into)
    }

    #[tauri::command]
    pub fn offline_login(
        auth: State<'_, LocalAuthService>,
        request: OfflineLoginRequest,
    ) -> Result<AuthenticatedSession, CommandError> {
        auth.offline_login(
            &request.username,
            &request.password,
            request.captcha_id,
            request.captcha_answer,
            SystemTime::now(),
        )
        .map_err(Into::into)
    }

    #[tauri::command]
    pub fn lock_session(auth: State<'_, LocalAuthService>) -> Result<(), CommandError> {
        auth.lock().map_err(Into::into)
    }

    #[tauri::command]
    pub fn get_authorization_context(
        auth: State<'_, LocalAuthService>,
    ) -> Result<super::AuthorizationContextView, CommandError> {
        auth.authorization_context(SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub async fn refresh_authorization(
        auth: State<'_, LocalAuthService>,
    ) -> Result<(), CommandError> {
        auth.refresh_authorization_https(SystemTime::now())
            .await
            .map_err(Into::into)
    }

    #[tauri::command]
    pub async fn list_managed_authorizations(
        auth: State<'_, LocalAuthService>,
        account_id: Uuid,
    ) -> Result<Vec<super::CloudAuthorizationScope>, CommandError> {
        auth.list_managed_authorizations(account_id, SystemTime::now())
            .await
            .map_err(Into::into)
    }

    #[tauri::command]
    pub async fn change_managed_authorization(
        auth: State<'_, LocalAuthService>,
        account_id: Uuid,
        binding: super::ManagedAuthorizationBinding,
        revoke: bool,
    ) -> Result<(), CommandError> {
        auth.change_managed_authorization(account_id, binding, revoke, SystemTime::now())
            .await
            .map_err(Into::into)
    }

    #[tauri::command]
    pub async fn replace_managed_authorization(
        auth: State<'_, LocalAuthService>,
        account_id: Uuid,
        replacement: super::ManagedAuthorizationReplacement,
    ) -> Result<(), CommandError> {
        auth.replace_managed_authorization(account_id, replacement, SystemTime::now())
            .await
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_authorization_contexts(
        auth: State<'_, LocalAuthService>,
    ) -> Result<Vec<super::AuthorizationContextView>, CommandError> {
        auth.list_authorization_contexts(SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn select_authorization_context(
        auth: State<'_, LocalAuthService>,
        selection: super::AuthorizationContextSelectionInput,
    ) -> Result<(), CommandError> {
        auth.select_authorization_context(selection, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn authorize_material_mutation(
        auth: State<'_, LocalAuthService>,
    ) -> Result<(), CommandError> {
        auth.require_material_mutation(SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn confirm_requisition(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<(), CommandError> {
        auth.confirm_requisition(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn get_approval_policy(
        auth: State<'_, LocalAuthService>,
    ) -> Result<super::ApprovalPolicyView, CommandError> {
        auth.approval_policy(SystemTime::now()).map_err(Into::into)
    }

    #[tauri::command]
    pub fn set_approval_policy(
        auth: State<'_, LocalAuthService>,
        allow_self_approval: bool,
        reason: String,
    ) -> Result<(), CommandError> {
        auth.set_approval_policy(allow_self_approval, reason, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn reject_requisition(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
        reason: String,
    ) -> Result<(), CommandError> {
        auth.reject_requisition(order_id, reason, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn add_order_comment(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
        body: String,
    ) -> Result<super::OrderCommentView, CommandError> {
        auth.add_order_comment(order_id, body, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn withdraw_requisition(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<(), CommandError> {
        auth.withdraw_requisition(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_order_comments(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<Vec<super::OrderCommentView>, CommandError> {
        auth.list_order_comments(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_order_audits(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<Vec<super::OrderAuditView>, CommandError> {
        auth.list_order_audits(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_requisition_draft(
        auth: State<'_, LocalAuthService>,
        draft: super::RequisitionDraftInput,
    ) -> Result<super::RequisitionTotalsView, CommandError> {
        auth.save_requisition_draft(draft, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn revise_confirmed_requisition(
        auth: State<'_, LocalAuthService>,
        draft: super::RequisitionDraftInput,
        reason: String,
    ) -> Result<super::RequisitionTotalsView, CommandError> {
        auth.revise_confirmed_requisition(draft, reason, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn submit_requisition_draft(
        auth: State<'_, LocalAuthService>,
        order_id: Uuid,
    ) -> Result<(), CommandError> {
        auth.submit_requisition_draft(order_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_material(
        auth: State<'_, LocalAuthService>,
        material: super::MaterialInput,
    ) -> Result<(), CommandError> {
        auth.save_material(material, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_supplier(
        auth: State<'_, LocalAuthService>,
        supplier: super::SupplierInput,
    ) -> Result<(), CommandError> {
        auth.save_supplier(supplier, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn add_material_price(
        auth: State<'_, LocalAuthService>,
        price: super::MaterialPriceInput,
    ) -> Result<(), CommandError> {
        auth.add_material_price(price, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_material_image(
        auth: State<'_, LocalAuthService>,
        image: super::MaterialImageInput,
    ) -> Result<(), CommandError> {
        auth.save_material_image(image, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn get_material_square_image(
        auth: State<'_, LocalAuthService>,
        material_id: Uuid,
    ) -> Result<Option<String>, CommandError> {
        auth.get_material_square_image(material_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn search_catalog(
        auth: State<'_, LocalAuthService>,
        query: String,
        project_id: Option<Uuid>,
    ) -> Result<Vec<super::CatalogMaterialView>, CommandError> {
        auth.search_catalog(&query, project_id, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_suppliers(
        auth: State<'_, LocalAuthService>,
    ) -> Result<Vec<super::SupplierView>, CommandError> {
        auth.list_suppliers(SystemTime::now()).map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_project_defaults(
        auth: State<'_, LocalAuthService>,
        defaults: super::ProjectDefaultsInput,
    ) -> Result<(), CommandError> {
        auth.save_project_defaults(defaults, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_project_defaults(
        auth: State<'_, LocalAuthService>,
    ) -> Result<Vec<super::ProjectDefaultsView>, CommandError> {
        auth.list_project_defaults(SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_reference_master_data(
        auth: State<'_, LocalAuthService>,
        record: super::ReferenceMasterDataInput,
    ) -> Result<(), CommandError> {
        auth.save_reference_master_data(record, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn list_reference_master_data(
        auth: State<'_, LocalAuthService>,
    ) -> Result<Vec<super::ReferenceMasterDataInput>, CommandError> {
        auth.list_reference_master_data(SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_tax_template(
        auth: State<'_, LocalAuthService>,
        template: super::TaxTemplateInput,
    ) -> Result<(), CommandError> {
        auth.save_tax_template(template, SystemTime::now())
            .map_err(Into::into)
    }

    #[tauri::command]
    pub fn save_exchange_rate(
        auth: State<'_, LocalAuthService>,
        rate: super::ExchangeRateInput,
    ) -> Result<(), CommandError> {
        auth.save_exchange_rate(rate, SystemTime::now())
            .map_err(Into::into)
    }
}

fn migrate(connection: &mut Connection) -> Result<(), AuthError> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS local_schema_migrations (
                version TEXT PRIMARY KEY,
                checksum TEXT NOT NULL,
                applied_at INTEGER NOT NULL
            );",
        )
        .map_err(|_| AuthError::Database)?;

    for migration in [
        (
            "0001_local_auth",
            include_str!("../migrations/0001_local_auth.sql"),
        ),
        (
            "0002_master_data",
            include_str!("../migrations/0002_master_data.sql"),
        ),
        (
            "0003_reference_master_data",
            include_str!("../migrations/0003_reference_master_data.sql"),
        ),
        (
            "0004_local_catalog",
            include_str!("../migrations/0004_local_catalog.sql"),
        ),
        (
            "0005_local_material_images",
            include_str!("../migrations/0005_local_material_images.sql"),
        ),
        (
            "0006_local_requisitions",
            include_str!("../migrations/0006_local_requisitions.sql"),
        ),
        (
            "0007_order_workflow",
            include_str!("../migrations/0007_order_workflow.sql"),
        ),
        (
            "0008_approval_policy",
            include_str!("../migrations/0008_approval_policy.sql"),
        ),
        (
            "0009_order_notifications",
            include_str!("../migrations/0009_order_notifications.sql"),
        ),
        (
            "0010_supplier_child_orders",
            include_str!("../migrations/0010_supplier_child_orders.sql"),
        ),
        (
            "0011_order_item_currency",
            include_str!("../migrations/0011_order_item_currency.sql"),
        ),
        ("0012_rfqs", include_str!("../migrations/0012_rfqs.sql")),
        (
            "0013_receipts",
            include_str!("../migrations/0013_receipts.sql"),
        ),
        (
            "0014_supplier_child_terms",
            include_str!("../migrations/0014_supplier_child_terms.sql"),
        ),
        (
            "0015_receipt_attachment_links",
            include_str!("../migrations/0015_receipt_attachment_links.sql"),
        ),
        (
            "0016_local_sync_outbox",
            include_str!("../migrations/0016_local_sync_outbox.sql"),
        ),
        (
            "0017_local_sync_state",
            include_str!("../migrations/0017_local_sync_state.sql"),
        ),
        (
            "0018_local_sync_remote_entities",
            include_str!("../migrations/0018_local_sync_remote_entities.sql"),
        ),
        (
            "0019_local_exchange_rate_tombstones",
            include_str!("../migrations/0019_local_exchange_rate_tombstones.sql"),
        ),
        (
            "0020_local_sync_outbox_superseded",
            include_str!("../migrations/0020_local_sync_outbox_superseded.sql"),
        ),
        (
            "0021_local_sync_conflict_server_operation",
            include_str!("../migrations/0021_local_sync_conflict_server_operation.sql"),
        ),
        (
            "0022_owner_purchase_pricing",
            include_str!("../migrations/0022_owner_purchase_pricing.sql"),
        ),
        (
            "0023_material_categories",
            include_str!("../migrations/0023_material_categories.sql"),
        ),
        (
            "0024_currency_expansion",
            include_str!("../migrations/0024_currency_expansion.sql"),
        ),
        (
            "0025_project_defaults_seed_compat",
            include_str!("../migrations/0025_project_defaults_seed_compat.sql"),
        ),
        (
            "0026_master_data_seed_audit",
            include_str!("../migrations/0026_master_data_seed_audit.sql"),
        ),
        (
            "0027_master_data_audit",
            include_str!("../migrations/0027_master_data_audit.sql"),
        ),
        (
            "0028_authorization_snapshots",
            include_str!("../migrations/0028_authorization_snapshots.sql"),
        ),
        (
            "0029_authorization_selection",
            include_str!("../migrations/0029_authorization_selection.sql"),
        ),
        (
            "0030_authorization_remote_cache",
            include_str!("../migrations/0030_authorization_remote_cache.sql"),
        ),
        (
            "0031_procurement_workflow_states",
            include_str!("../migrations/0031_procurement_workflow_states.sql"),
        ),
        (
            "0032_procurement_expenditures",
            include_str!("../migrations/0032_procurement_expenditures.sql"),
        ),
        (
            "0033_local_attachments",
            include_str!("../migrations/0033_local_attachments.sql"),
        ),
        (
            "0034_receipt_attachments",
            include_str!("../migrations/0034_receipt_attachments.sql"),
        ),
        (
            "0035_legacy_receipt_attachment_links",
            include_str!("../migrations/0035_legacy_receipt_attachment_links.sql"),
        ),
        (
            "0036_attachment_pull_conflicts",
            include_str!("../migrations/0036_attachment_pull_conflicts.sql"),
        ),
    ] {
        let checksum = format!("{:x}", Sha256::digest(migration.1.as_bytes()));
        let recorded_checksum = connection
            .query_row(
                "SELECT checksum FROM local_schema_migrations WHERE version = ?1",
                [migration.0],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        match recorded_checksum {
            Some(value) if value == checksum => continue,
            Some(_) => return Err(AuthError::Database),
            None => {
                if migration.0 == "0024_currency_expansion" {
                    apply_currency_expansion(connection, migration.0, &checksum)?;
                    continue;
                }
                if migration.0 == "0025_project_defaults_seed_compat" {
                    apply_project_defaults_seed_compat(connection, migration.0, &checksum)?;
                    continue;
                }
                let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
                transaction
                    .execute_batch(migration.1)
                    .map_err(|_| AuthError::Database)?;
                transaction
                .execute(
                    "INSERT INTO local_schema_migrations (version, checksum, applied_at) VALUES (?1, ?2, ?3)",
                    params![migration.0, checksum, unix_seconds(SystemTime::now())],
                )
                .map_err(|_| AuthError::Database)?;
                transaction.commit().map_err(|_| AuthError::Database)?;
            }
        }
    }
    Ok(())
}

fn apply_currency_expansion(
    connection: &mut Connection,
    version: &str,
    checksum: &str,
) -> Result<(), AuthError> {
    let foreign_keys: i64 = connection
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .map_err(|_| AuthError::Database)?;
    if foreign_keys != 0 {
        connection
            .execute_batch("PRAGMA foreign_keys = OFF")
            .map_err(|_| AuthError::Database)?;
    }
    let result = (|| -> Result<(), AuthError> {
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        for table in [
            "local_projects",
            "local_exchange_rates",
            "local_material_prices",
            "local_purchase_orders",
            "local_purchase_order_items",
            "local_rfqs",
        ] {
            rebuild_currency_table(&transaction, table)?;
        }
        let violations: i64 = transaction
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .map_err(|_| AuthError::Database)?;
        if violations != 0 {
            return Err(AuthError::Database);
        }
        transaction.execute(
            "INSERT INTO local_schema_migrations (version, checksum, applied_at) VALUES (?1, ?2, ?3)",
            params![version, checksum, unix_seconds(SystemTime::now())],
        ).map_err(|_| AuthError::Database)?;
        transaction.commit().map_err(|_| AuthError::Database)
    })();
    if foreign_keys != 0 {
        connection
            .execute_batch("PRAGMA foreign_keys = ON")
            .map_err(|_| AuthError::Database)?;
    }
    result
}

fn apply_project_defaults_seed_compat(
    connection: &mut Connection,
    version: &str,
    checksum: &str,
) -> Result<(), AuthError> {
    let foreign_keys: i64 = connection
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .map_err(|_| AuthError::Database)?;
    if foreign_keys != 0 {
        connection
            .execute_batch("PRAGMA foreign_keys = OFF")
            .map_err(|_| AuthError::Database)?;
    }
    let result = (|| {
        let transaction = connection.transaction().map_err(|_| AuthError::Database)?;
        rebuild_currency_table(&transaction, "local_project_print_defaults")?;
        let violations: i64 = transaction
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .map_err(|_| AuthError::Database)?;
        if violations != 0 {
            return Err(AuthError::Database);
        }
        transaction.execute(
            "INSERT INTO local_schema_migrations (version, checksum, applied_at) VALUES (?1, ?2, ?3)",
            params![version, checksum, unix_seconds(SystemTime::now())],
        ).map_err(|_| AuthError::Database)?;
        transaction.commit().map_err(|_| AuthError::Database)
    })();
    if foreign_keys != 0 {
        connection
            .execute_batch("PRAGMA foreign_keys = ON")
            .map_err(|_| AuthError::Database)?;
    }
    result
}

fn rebuild_currency_table(transaction: &Transaction<'_>, table: &str) -> Result<(), AuthError> {
    let create_sql: String = transaction
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1 AND sql IS NOT NULL",
            [table],
            |row| row.get(0),
        )
        .map_err(|_| AuthError::Database)?;
    let expanded = create_sql
        .replace(
            "IN ('XOF', 'CNY', 'USD', 'EUR')",
            "IN ('XOF', 'XAF', 'CNY', 'USD', 'EUR', 'ETB')",
        )
        .replace("company_contact TEXT NOT NULL", "company_contact TEXT");
    if expanded == create_sql {
        return Err(AuthError::Database);
    }
    let temporary = format!("{table}__currency_upgrade");
    let create_temporary = expanded.replacen(
        &format!("CREATE TABLE {table}"),
        &format!("CREATE TABLE {temporary}"),
        1,
    );
    if create_temporary == expanded {
        return Err(AuthError::Database);
    }
    let objects = transaction.prepare(
        "SELECT sql FROM sqlite_master WHERE tbl_name = ?1 AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
    ).map_err(|_| AuthError::Database)?
    .query_map([table], |row| row.get::<_, String>(0)).map_err(|_| AuthError::Database)?
    .collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)?;
    transaction
        .execute_batch(&create_temporary)
        .map_err(|_| AuthError::Database)?;
    transaction.execute_batch(&format!("INSERT INTO {temporary} SELECT * FROM {table}; DROP TABLE {table}; ALTER TABLE {temporary} RENAME TO {table};")).map_err(|_| AuthError::Database)?;
    for sql in objects {
        transaction
            .execute_batch(&sql)
            .map_err(|_| AuthError::Database)?;
    }
    Ok(())
}

fn validate_project_defaults(defaults: &ProjectDefaultsInput) -> Result<(), AuthError> {
    if [&defaults.department_title, &defaults.company_address]
        .iter()
        .any(|value| value.trim().is_empty() || value.len() > 1000)
        || defaults
            .company_contact
            .as_deref()
            .is_some_and(|value| value.len() > 255)
        || !valid_currency(&defaults.default_currency)
        || !matches!(defaults.default_language_pair.as_str(), "zh_fr" | "zh_en")
    {
        return Err(AuthError::Database);
    }
    Ok(())
}

fn validate_material(material: &MaterialInput) -> Result<(), AuthError> {
    if material.version < 1
        || !valid_required_text(&material.name_zh, 255)
        || !valid_required_text(&material.model, 255)
        || !valid_required_text(&material.specification, 2000)
        || !valid_required_text(&material.unit, 64)
        || material
            .sku
            .as_ref()
            .is_some_and(|value| !valid_required_text(value, 128))
        || material.aliases.len() > 50
        || material
            .aliases
            .iter()
            .any(|value| !valid_required_text(value, 255))
        || !valid_optional_text(&material.name_fr, 255)
        || !valid_optional_text(&material.brand, 1000)
        || !valid_optional_text(&material.notes, 1000)
    {
        return Err(AuthError::InvalidInput);
    }
    Ok(())
}

fn validate_supplier(supplier: &SupplierInput) -> Result<(), AuthError> {
    if supplier.version < 1
        || !valid_business_code(&supplier.business_code)
        || !valid_required_text(&supplier.name, 255)
        || [
            (&supplier.contact_name, 1000),
            (&supplier.address, 1000),
            (&supplier.city, 1000),
            (&supplier.country, 1000),
            (&supplier.phone, 1000),
            (&supplier.whatsapp, 1000),
            (&supplier.payment_terms, 1000),
            (&supplier.delivery_lead_time, 1000),
        ]
        .iter()
        .any(|(value, max)| !valid_optional_text(value, *max))
        || supplier.email.as_ref().is_some_and(|value| {
            !valid_required_text(value, 255)
                || value.matches('@').count() != 1
                || value.starts_with('@')
                || value.ends_with('@')
        })
    {
        return Err(AuthError::InvalidInput);
    }
    Ok(())
}

fn validate_material_price(price: &MaterialPriceInput) -> Result<i64, AuthError> {
    if price.version < 1
        || !valid_currency(&price.currency)
        || !valid_required_text(&price.unit, 64)
        || !valid_iso_date(&price.effective_at)
        || !valid_optional_text(&price.source_note, 1000)
    {
        return Err(AuthError::InvalidInput);
    }
    price
        .unit_price_minor
        .parse::<i64>()
        .ok()
        .filter(|value| {
            *value >= 0
                && !price.unit_price_minor.is_empty()
                && price
                    .unit_price_minor
                    .bytes()
                    .all(|character| character.is_ascii_digit())
        })
        .ok_or(AuthError::InvalidInput)
}

fn project_remote_catalog_change(
    transaction: &Transaction<'_>,
    change: &SyncPullChangeInput,
    now: SystemTime,
) -> Result<(), AuthError> {
    match (change.entity_type.as_str(), change.operation.as_str()) {
        ("material", "soft_delete") => {
            transaction
                .execute(
                    "UPDATE local_materials SET is_active = 0, version = MAX(version, ?2), deleted_at = COALESCE(deleted_at, ?3) WHERE id = ?1",
                    params![change.entity_id.to_string(), change.version, unix_seconds(now)],
                )
                .map_err(|_| AuthError::Database)?;
        }
        ("supplier", "soft_delete") => {
            transaction
                .execute(
                    "UPDATE local_suppliers SET is_active = 0, version = MAX(version, ?2), deleted_at = COALESCE(deleted_at, ?3) WHERE id = ?1",
                    params![change.entity_id.to_string(), change.version, unix_seconds(now)],
                )
                .map_err(|_| AuthError::Database)?;
        }
        ("material_price", "soft_delete") => {
            transaction
                .execute(
                    "UPDATE local_material_prices SET is_active = 0, version = MAX(version, ?2), deleted_at = COALESCE(deleted_at, ?3) WHERE id = ?1",
                    params![change.entity_id.to_string(), change.version, unix_seconds(now)],
                )
                .map_err(|_| AuthError::Database)?;
        }
        ("material", "upsert") => {
            let material: MaterialInput = serde_json::from_value(change.payload.clone())
                .map_err(|_| AuthError::InvalidInput)?;
            if material.id != change.entity_id {
                return Err(AuthError::InvalidInput);
            }
            validate_material(&material)?;
            let aliases =
                serde_json::to_string(&material.aliases).map_err(|_| AuthError::InvalidInput)?;
            transaction
                .execute(
                    "INSERT INTO local_materials (id, sku, category_id, name_zh, name_fr, aliases_json, brand, model, specification, unit, notes, is_active, version)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                     ON CONFLICT(id) DO UPDATE SET sku = excluded.sku, name_zh = excluded.name_zh, name_fr = excluded.name_fr,
                       category_id = excluded.category_id, aliases_json = excluded.aliases_json, brand = excluded.brand, model = excluded.model,
                       specification = excluded.specification, unit = excluded.unit, notes = excluded.notes,
                       is_active = excluded.is_active, version = excluded.version, deleted_at = NULL",
                    params![material.id.to_string(), material.sku, material.category_id.map(|value| value.to_string()), material.name_zh, material.name_fr, aliases, material.brand, material.model, material.specification, material.unit, material.notes, material.is_active as i64, change.version],
                )
                .map_err(|_| AuthError::Database)?;
        }
        ("supplier", "upsert") => {
            let supplier: SupplierInput = serde_json::from_value(change.payload.clone())
                .map_err(|_| AuthError::InvalidInput)?;
            if supplier.id != change.entity_id {
                return Err(AuthError::InvalidInput);
            }
            validate_supplier(&supplier)?;
            if let Some(country_id) = supplier.country_id {
                let country_exists: bool = transaction
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM local_countries WHERE id = ?1 AND deleted_at IS NULL)",
                        [country_id.to_string()],
                        |row| row.get(0),
                    )
                    .map_err(|_| AuthError::Database)?;
                let prior_country_id: Option<String> = transaction
                    .query_row(
                        "SELECT country_id FROM local_suppliers WHERE id = ?1 AND deleted_at IS NULL",
                        [supplier.id.to_string()],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|_| AuthError::Database)?
                    .flatten();
                if !country_exists
                    || prior_country_id
                        .as_deref()
                        .is_some_and(|value| value != country_id.to_string())
                {
                    return Err(AuthError::InvalidInput);
                }
            }
            transaction
                .execute(
                    "INSERT INTO local_suppliers (id, business_code, name, country_id, contact_name, address, city, country, phone, whatsapp, email, payment_terms, delivery_lead_time, is_preferred, is_blacklisted, is_active, version)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                     ON CONFLICT(id) DO UPDATE SET business_code = excluded.business_code, name = excluded.name,
                       country_id = COALESCE(local_suppliers.country_id, excluded.country_id), contact_name = excluded.contact_name, address = excluded.address, city = excluded.city,
                       country = excluded.country, phone = excluded.phone, whatsapp = excluded.whatsapp,
                       email = excluded.email, payment_terms = excluded.payment_terms,
                       delivery_lead_time = excluded.delivery_lead_time, is_preferred = excluded.is_preferred,
                       is_blacklisted = excluded.is_blacklisted, is_active = excluded.is_active,
                       version = excluded.version, deleted_at = NULL",
                    params![supplier.id.to_string(), supplier.business_code, supplier.name, supplier.country_id.map(|value| value.to_string()), supplier.contact_name, supplier.address, supplier.city, supplier.country, supplier.phone, supplier.whatsapp, supplier.email, supplier.payment_terms, supplier.delivery_lead_time, supplier.is_preferred as i64, supplier.is_blacklisted as i64, supplier.is_active as i64, change.version],
                )
                .map_err(|_| AuthError::Database)?;
        }
        ("material_price", "upsert") => {
            let price: MaterialPriceInput = serde_json::from_value(change.payload.clone())
                .map_err(|_| AuthError::InvalidInput)?;
            if price.id != change.entity_id {
                return Err(AuthError::InvalidInput);
            }
            let unit_price_minor = validate_material_price(&price)?;
            transaction
                .execute(
                    "UPDATE local_material_prices SET is_active = 0
                     WHERE material_id = ?1 AND supplier_id = ?2 AND currency = ?3 AND id <> ?4
                       AND is_active = 1 AND deleted_at IS NULL",
                    params![
                        price.material_id.to_string(),
                        price.supplier_id.to_string(),
                        price.currency,
                        price.id.to_string()
                    ],
                )
                .map_err(|_| AuthError::Database)?;
            transaction
                .execute(
                    "INSERT INTO local_material_prices (id, material_id, supplier_id, currency, unit_price_minor, unit, effective_at, source_note, is_active, version)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)
                     ON CONFLICT(id) DO UPDATE SET material_id = excluded.material_id, supplier_id = excluded.supplier_id,
                       currency = excluded.currency, unit_price_minor = excluded.unit_price_minor, unit = excluded.unit,
                       effective_at = excluded.effective_at, source_note = excluded.source_note, is_active = 1,
                       version = excluded.version, deleted_at = NULL",
                    params![price.id.to_string(), price.material_id.to_string(), price.supplier_id.to_string(), price.currency, unit_price_minor, price.unit, price.effective_at, price.source_note, change.version],
                )
                .map_err(|_| AuthError::Database)?;
        }
        _ => {}
    }
    Ok(())
}

fn is_directly_resolvable_sync_entity(entity_type: &str) -> bool {
    matches!(
        entity_type,
        "country"
            | "project"
            | "site"
            | "department"
            | "team"
            | "unit"
            | "tax_template"
            | "exchange_rate"
            | "project_defaults"
            | "material_category"
            | "material"
            | "supplier"
            | "material_price"
            | "order_comment"
    )
}

fn attachment_pull_conflict_was_kept_locally(
    transaction: &Transaction<'_>,
    change: &SyncPullChangeInput,
) -> Result<bool, AuthError> {
    if change.entity_type != "attachment" || change.operation != "upsert" {
        return Ok(false);
    }
    let payload = serde_json::to_string(&change.payload).map_err(|_| AuthError::Database)?;
    transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM local_attachment_pull_conflicts WHERE attachment_id = ?1 AND server_version = ?2 AND server_payload_json = ?3 AND resolved_at IS NOT NULL)",
            params![change.entity_id.to_string(), change.version, payload],
            |row| row.get(0),
        )
        .map_err(|_| AuthError::Database)
}

fn project_remote_master_data_change(
    transaction: &Transaction<'_>,
    change: &SyncPullChangeInput,
    now: SystemTime,
) -> Result<(), AuthError> {
    if change.operation == "soft_delete" {
        let table = match change.entity_type.as_str() {
            "country" => Some("local_countries"),
            "project" => Some("local_projects"),
            "site" => Some("local_sites"),
            "department" => Some("local_departments"),
            "team" => Some("local_teams"),
            "unit" => Some("local_units"),
            "tax_template" => Some("local_tax_templates"),
            "exchange_rate" => Some("local_exchange_rates"),
            "material_category" => Some("local_material_categories"),
            _ => None,
        };
        if let Some(table) = table {
            let query = format!(
                "UPDATE {table} SET {} WHERE id = ?1",
                if table == "local_exchange_rates" {
                    "version = MAX(version, ?2), deleted_at = COALESCE(deleted_at, ?3)"
                } else {
                    "is_active = 0, version = MAX(version, ?2), deleted_at = COALESCE(deleted_at, ?3)"
                }
            );
            let entity_id = change.entity_id.to_string();
            if table == "local_exchange_rates" {
                transaction
                    .execute(
                        &query,
                        params![entity_id, change.version, unix_seconds(now)],
                    )
                    .map_err(|_| AuthError::Database)?;
            } else {
                transaction
                    .execute(
                        &query,
                        params![entity_id, change.version, unix_seconds(now)],
                    )
                    .map_err(|_| AuthError::Database)?;
            }
        } else if change.entity_type == "project_defaults" {
            transaction
                .execute(
                    "DELETE FROM local_project_print_defaults WHERE project_id = ?1",
                    [change.entity_id.to_string()],
                )
                .map_err(|_| AuthError::Database)?;
        }
        return Ok(());
    }
    if change.operation != "upsert" {
        return Ok(());
    }
    match change.entity_type.as_str() {
        "country" | "project" | "site" | "department" | "team" | "unit" => {
            let record: ReferenceMasterDataInput = serde_json::from_value(change.payload.clone())
                .map_err(|_| AuthError::InvalidInput)?;
            project_remote_reference_master_data(transaction, &record, change)?;
        }
        "material_category" => {
            let category: MaterialCategoryInput = serde_json::from_value(change.payload.clone())
                .map_err(|_| AuthError::InvalidInput)?;
            if category.id != change.entity_id {
                return Err(AuthError::InvalidInput);
            }
            validate_reference(&category.business_code, &category.name, category.version)?;
            assert_immutable_local_business_code(
                transaction,
                "local_material_categories",
                category.id,
                &category.business_code,
            )?;
            transaction.execute("INSERT INTO local_material_categories (id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![category.id.to_string(), category.business_code, category.name, category.is_active as i64, change.version]).map_err(|_| AuthError::Database)?;
        }
        "tax_template" => {
            let template: TaxTemplateInput = serde_json::from_value(change.payload.clone())
                .map_err(|_| AuthError::InvalidInput)?;
            if template.id != change.entity_id {
                return Err(AuthError::InvalidInput);
            }
            validate_reference(&template.business_code, &template.name, template.version)?;
            if template.rate_basis_points < 0
                || template.rate_basis_points > 100_000
                || !valid_iso_date(&template.effective_at)
            {
                return Err(AuthError::InvalidInput);
            }
            assert_immutable_local_business_code(
                transaction,
                "local_tax_templates",
                template.id,
                &template.business_code,
            )?;
            transaction.execute("INSERT INTO local_tax_templates (id, business_code, name, country_id, rate_basis_points, effective_at, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(id) DO UPDATE SET name = excluded.name, country_id = excluded.country_id, rate_basis_points = excluded.rate_basis_points, effective_at = excluded.effective_at, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![template.id.to_string(), template.business_code, template.name, template.country_id.map(|value| value.to_string()), template.rate_basis_points, template.effective_at, template.is_active as i64, change.version]).map_err(|_| AuthError::Database)?;
        }
        "exchange_rate" => {
            let rate: ExchangeRateInput = serde_json::from_value(change.payload.clone())
                .map_err(|_| AuthError::InvalidInput)?;
            if rate.id != change.entity_id
                || !valid_currency(&rate.from_currency)
                || !valid_currency(&rate.to_currency)
                || !valid_decimal_rate(&rate.rate_decimal)
                || !valid_iso_date(&rate.effective_at)
                || !matches!(rate.source.as_str(), "public_daily" | "manual")
                || (rate.source == "manual"
                    && rate
                        .reason
                        .as_ref()
                        .is_none_or(|value| !valid_required_text(value, 1000)))
                || rate.reason.as_ref().is_some_and(|value| value.len() > 1000)
            {
                return Err(AuthError::InvalidInput);
            }
            transaction.execute("INSERT INTO local_exchange_rates (id, from_currency, to_currency, rate_decimal, effective_at, source, reason, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(id) DO UPDATE SET from_currency = excluded.from_currency, to_currency = excluded.to_currency, rate_decimal = excluded.rate_decimal, effective_at = excluded.effective_at, source = excluded.source, reason = excluded.reason, version = excluded.version, deleted_at = NULL", params![rate.id.to_string(), rate.from_currency, rate.to_currency, rate.rate_decimal, rate.effective_at, rate.source, rate.reason, change.version]).map_err(|_| AuthError::Database)?;
        }
        "project_defaults" => {
            let defaults: ProjectDefaultsInput = serde_json::from_value(change.payload.clone())
                .map_err(|_| AuthError::InvalidInput)?;
            if defaults.project_id != change.entity_id {
                return Err(AuthError::InvalidInput);
            }
            validate_project_defaults(&defaults)?;
            transaction.execute("INSERT INTO local_project_print_defaults (project_id, department_title, company_address, company_contact, default_currency, default_language_pair, default_tax_template_id, version, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(project_id) DO UPDATE SET department_title = excluded.department_title, company_address = excluded.company_address, company_contact = excluded.company_contact, default_currency = excluded.default_currency, default_language_pair = excluded.default_language_pair, default_tax_template_id = excluded.default_tax_template_id, version = excluded.version, updated_at = excluded.updated_at", params![defaults.project_id.to_string(), defaults.department_title, defaults.company_address, defaults.company_contact, defaults.default_currency, defaults.default_language_pair, defaults.default_tax_template_id.map(|value| value.to_string()), change.version, unix_seconds(now)]).map_err(|_| AuthError::Database)?;
        }
        _ => {}
    }
    Ok(())
}

fn project_remote_purchase_order_change(
    transaction: &Transaction<'_>,
    change: &SyncPullChangeInput,
    now: SystemTime,
) -> Result<bool, AuthError> {
    if change.entity_type != "purchase_order" {
        return Ok(true);
    }
    let existing_workflow_status: Option<String> = transaction
        .query_row(
            "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
            [change.entity_id.to_string()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| AuthError::Database)?;
    if existing_workflow_status
        .as_deref()
        .is_some_and(|status| !matches!(status, "draft" | "pending_confirmation" | "rejected"))
    {
        if change.operation != "upsert" {
            return Err(AuthError::InvalidInput);
        }
        let remote: RemotePurchaseOrderPayload =
            serde_json::from_value(change.payload.clone()).map_err(|_| AuthError::InvalidInput)?;
        validate_remote_purchase_order(&remote)?;
        let local: (String, Option<String>) = transaction
            .query_row(
                "SELECT project_id, procurement_mode FROM local_purchase_orders WHERE id = ?1",
                [change.entity_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| AuthError::Database)?;
        if local.0 != remote.project_id.to_string()
            || (local.1.is_some() && local.1 != remote.procurement_mode)
        {
            return Err(AuthError::InvalidInput);
        }
        let local_payload: serde_json::Value =
            serde_json::from_str(&order_sync_payload(transaction, change.entity_id)?)
                .map_err(|_| AuthError::Database)?;
        for field in [
            "parentOrderId",
            "displayNo",
            "countryId",
            "projectId",
            "site",
            "departmentId",
            "teamId",
            "applicantId",
            "supplierId",
            "supplierSnapshotJson",
            "currency",
            "primaryCurrency",
            "lockedExchangeRateDecimal",
            "languagePair",
            "urgency",
            "urgencyReason",
            "orderDate",
            "deliveryAddress",
            "expectedDeliveryDate",
            "notes",
            "subtotalMinor",
            "lineDiscountMinor",
            "orderDiscountMinor",
            "freightMinor",
            "taxRateBasisPoints",
            "taxMinor",
            "totalMinor",
            "confirmedBy",
            "confirmedAt",
            "selfApproved",
            "supplierTermsCompletedAt",
        ] {
            if local_payload.get(field) != change.payload.get(field) {
                return Err(AuthError::InvalidInput);
            }
        }
        let local_lines = local_payload["lines"]
            .as_array()
            .ok_or(AuthError::Database)?;
        let remote_lines = change.payload["lines"]
            .as_array()
            .ok_or(AuthError::InvalidInput)?;
        if local_lines.len() != remote_lines.len() {
            return Err(AuthError::InvalidInput);
        }
        for local_line in local_lines {
            let remote_line = remote_lines
                .iter()
                .find(|line| line.get("id") == local_line.get("id"))
                .ok_or(AuthError::InvalidInput)?;
            for field in [
                "materialId",
                "materialSnapshotJson",
                "supplierSnapshotJson",
                "currency",
                "quantity",
                "unit",
                "unitPriceMinor",
                "lineDiscountJson",
                "lineFreightJson",
                "freightIncluded",
                "lineTotalMinor",
                "sortOrder",
                "createdAt",
                "updatedAt",
            ] {
                if local_line.get(field) != remote_line.get(field) {
                    return Err(AuthError::InvalidInput);
                }
            }
        }
        if local.1.is_none() {
            transaction
                .execute(
                    "UPDATE local_purchase_orders SET procurement_mode = ?2 WHERE id = ?1",
                    params![change.entity_id.to_string(), remote.procurement_mode],
                )
                .map_err(|_| AuthError::Database)?;
        }
        return Ok(true);
    }
    if change.operation == "soft_delete" {
        transaction
            .execute(
                "UPDATE local_purchase_orders SET deleted_at = COALESCE(deleted_at, ?2), version = MAX(version, ?3) WHERE id = ?1",
                params![change.entity_id.to_string(), unix_seconds(now), change.version],
            )
            .map_err(|_| AuthError::Database)?;
        return Ok(true);
    }
    if change.operation != "upsert" {
        return Err(AuthError::InvalidInput);
    }
    let order: RemotePurchaseOrderPayload =
        serde_json::from_value(change.payload.clone()).map_err(|_| AuthError::InvalidInput)?;
    validate_remote_purchase_order(&order)?;
    if !remote_order_references_exist(transaction, &order)? {
        return Ok(false);
    }
    if order.parent_order_id.is_some_and(|parent_id| {
        !transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL)",
                [parent_id.to_string()],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|_| AuthError::Database)
            .unwrap_or(false)
    }) {
        return Ok(false);
    }
    let is_mutable = matches!(
        order.workflow_status.as_str(),
        "draft" | "pending_confirmation" | "rejected"
    );
    if is_mutable {
        transaction
            .execute(
                "DELETE FROM local_purchase_order_items WHERE order_id = ?1",
                [change.entity_id.to_string()],
            )
            .map_err(|_| AuthError::Database)?;
    }
    transaction
        .execute(
            "INSERT INTO local_purchase_orders (id, parent_order_id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, supplier_id, supplier_snapshot_json, currency, primary_currency, locked_exchange_rate_decimal, language_pair, status, workflow_status, urgency, urgency_reason, order_date, delivery_address, expected_delivery_date, notes, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, version, created_at, updated_at, confirmed_by, confirmed_at, rejection_reason, self_approved, supplier_terms_completed_at, procurement_mode)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39)
             ON CONFLICT(id) DO UPDATE SET parent_order_id = excluded.parent_order_id, display_no = excluded.display_no, country_id = excluded.country_id, project_id = excluded.project_id, site = excluded.site, department_id = excluded.department_id, team_id = excluded.team_id, applicant_id = excluded.applicant_id, supplier_id = excluded.supplier_id, supplier_snapshot_json = excluded.supplier_snapshot_json, currency = excluded.currency, primary_currency = excluded.primary_currency, locked_exchange_rate_decimal = excluded.locked_exchange_rate_decimal, language_pair = excluded.language_pair, status = excluded.status, workflow_status = excluded.workflow_status, urgency = excluded.urgency, urgency_reason = excluded.urgency_reason, order_date = excluded.order_date, delivery_address = excluded.delivery_address, expected_delivery_date = excluded.expected_delivery_date, notes = excluded.notes, subtotal_minor = excluded.subtotal_minor, line_discount_minor = excluded.line_discount_minor, order_discount_minor = excluded.order_discount_minor, freight_minor = excluded.freight_minor, tax_rate_basis_points = excluded.tax_rate_basis_points, tax_minor = excluded.tax_minor, total_minor = excluded.total_minor, version = excluded.version, updated_at = excluded.updated_at, confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at, rejection_reason = excluded.rejection_reason, self_approved = excluded.self_approved, supplier_terms_completed_at = excluded.supplier_terms_completed_at, procurement_mode = excluded.procurement_mode, deleted_at = NULL WHERE excluded.version >= local_purchase_orders.version",
            params![change.entity_id.to_string(), order.parent_order_id.map(|value| value.to_string()), order.display_no, order.country_id.to_string(), order.project_id.to_string(), order.site, order.department_id.to_string(), order.team_id.to_string(), order.applicant_id.to_string(), order.supplier_id.map(|value| value.to_string()), order.supplier_snapshot_json, order.currency, order.primary_currency, order.locked_exchange_rate_decimal, order.language_pair, order.status, order.workflow_status, order.urgency, order.urgency_reason, order.order_date, order.delivery_address, order.expected_delivery_date, order.notes, remote_minor(&order.subtotal_minor)?, remote_minor(&order.line_discount_minor)?, remote_minor(&order.order_discount_minor)?, remote_minor(&order.freight_minor)?, order.tax_rate_basis_points, remote_minor(&order.tax_minor)?, remote_minor(&order.total_minor)?, change.version, unix_seconds(now), unix_seconds(now), order.confirmed_by.map(|value| value.to_string()), order.confirmed_at, order.rejection_reason, order.self_approved as i64, order.supplier_terms_completed_at, order.procurement_mode],
        )
        .map_err(|_| AuthError::Database)?;
    for line in order.lines {
        transaction
            .execute(
                "INSERT INTO local_purchase_order_items (id, order_id, material_id, material_snapshot_json, supplier_snapshot_json, currency, quantity_decimal, unit, unit_price_minor, line_discount_json, line_freight_json, freight_included, line_total_minor, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
                 ON CONFLICT(id) DO UPDATE SET material_id = excluded.material_id, material_snapshot_json = excluded.material_snapshot_json, supplier_snapshot_json = excluded.supplier_snapshot_json, currency = excluded.currency, quantity_decimal = excluded.quantity_decimal, unit = excluded.unit, unit_price_minor = excluded.unit_price_minor, line_discount_json = excluded.line_discount_json, line_freight_json = excluded.line_freight_json, freight_included = excluded.freight_included, line_total_minor = excluded.line_total_minor, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
                params![line.id.to_string(), change.entity_id.to_string(), line.material_id.map(|value| value.to_string()), line.material_snapshot_json, line.supplier_snapshot_json, line.currency, line.quantity, line.unit, remote_minor(&line.unit_price_minor)?, line.line_discount_json, line.line_freight_json, line.freight_included as i64, remote_minor(&line.line_total_minor)?, line.sort_order, line.created_at, line.updated_at],
            )
            .map_err(|_| AuthError::Database)?;
    }
    Ok(true)
}

fn project_staged_purchase_orders(
    transaction: &Transaction<'_>,
    now: SystemTime,
) -> Result<(), AuthError> {
    let mut changes = transaction
        .prepare("SELECT entity_id, operation, server_version, payload_json, changed_at FROM local_sync_remote_entities WHERE entity_type = 'purchase_order' ORDER BY entity_id")
        .map_err(|_| AuthError::Database)?
        .query_map([], |row| {
            Ok(SyncPullChangeInput {
                cursor: "0".into(),
                entity_type: "purchase_order".into(),
                entity_id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                operation: row.get(1)?,
                version: row.get(2)?,
                payload: serde_json::from_str(&row.get::<_, String>(3)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                changed_at: row.get(4)?,
            })
        })
        .map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| AuthError::Database)?;
    while !changes.is_empty() {
        let mut projected_any = false;
        let mut deferred = Vec::new();
        for change in changes {
            if project_remote_purchase_order_change(transaction, &change, now)? {
                projected_any = true;
            } else {
                deferred.push(change);
            }
        }
        if !projected_any {
            return Ok(());
        }
        changes = deferred;
    }
    Ok(())
}

fn project_staged_order_comments(transaction: &Transaction<'_>) -> Result<(), AuthError> {
    let changes = transaction
        .prepare("SELECT entity_id, operation, server_version, payload_json, changed_at FROM local_sync_remote_entities WHERE entity_type = 'order_comment' ORDER BY entity_id")
        .map_err(|_| AuthError::Database)?
        .query_map([], |row| {
            Ok(SyncPullChangeInput {
                cursor: "0".into(),
                entity_type: "order_comment".into(),
                entity_id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                operation: row.get(1)?,
                version: row.get(2)?,
                payload: serde_json::from_str(&row.get::<_, String>(3)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                changed_at: row.get(4)?,
            })
        })
        .map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| AuthError::Database)?;
    for change in &changes {
        project_remote_order_comment(transaction, change)?;
    }
    Ok(())
}

fn project_staged_receipts(transaction: &Transaction<'_>) -> Result<(), AuthError> {
    let changes = transaction.prepare("SELECT entity_id, operation, server_version, payload_json, changed_at FROM local_sync_remote_entities WHERE entity_type = 'receipt' ORDER BY entity_id")
        .map_err(|_| AuthError::Database)?
        .query_map([], |row| Ok(SyncPullChangeInput {
            cursor: "0".into(), entity_type: "receipt".into(),
            entity_id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
            operation: row.get(1)?, version: row.get(2)?,
            payload: serde_json::from_str(&row.get::<_, String>(3)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
            changed_at: row.get(4)?,
        })).map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)?;
    for change in &changes {
        project_remote_receipt(transaction, change)?;
    }
    Ok(())
}

fn project_remote_receipt(
    transaction: &Transaction<'_>,
    change: &SyncPullChangeInput,
) -> Result<bool, AuthError> {
    if change.operation != "upsert" {
        return Err(AuthError::InvalidInput);
    }
    if change.payload.get("items").is_none() {
        return Ok(false);
    }
    let value: RemoteReceiptPayload =
        serde_json::from_value(change.payload.clone()).map_err(|_| AuthError::InvalidInput)?;
    if value.id != change.entity_id
        || !valid_iso_date(&value.received_at)
        || value.created_at < 0
        || value.items.is_empty()
        || value.items.len() > 500
        || value.attachment_ids.len() > 10
        || value
            .over_receipt_reason
            .as_ref()
            .is_some_and(|reason| !valid_required_text(reason, 1000))
    {
        return Err(AuthError::InvalidInput);
    }
    if value.attachment_ids.iter().collect::<HashSet<_>>().len() != value.attachment_ids.len() {
        return Err(AuthError::InvalidInput);
    }
    let mut line_ids = HashSet::new();
    for item in &value.items {
        if !line_ids.insert(item.order_item_id)
            || parse_quantity_hundredths(&item.quantity).is_err()
            || !valid_required_text(&item.unit, 64)
        {
            return Err(AuthError::InvalidInput);
        }
    }
    let project_id: Option<String> = transaction
        .query_row(
            "SELECT project_id FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
            [value.order_id.to_string()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| AuthError::Database)?;
    let Some(project_id) = project_id else {
        return Ok(false);
    };
    if project_id != value.project_id.to_string() {
        return Err(AuthError::InvalidInput);
    }
    for item in &value.items {
        let linked: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM local_purchase_order_items WHERE id = ?1 AND order_id = ?2)",
            params![item.order_item_id.to_string(), value.order_id.to_string()], |row| row.get(0),
        ).map_err(|_| AuthError::Database)?;
        if !linked {
            return Ok(false);
        }
    }
    let prior: Option<(String, String, String, Option<String>, String, i64)> = transaction.query_row(
        "SELECT order_id, received_at, receiver_id, over_receipt_reason, created_by, created_at FROM local_receipts WHERE id = ?1",
        [value.id.to_string()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
    ).optional().map_err(|_| AuthError::Database)?;
    if let Some(prior) = prior {
        if prior
            != (
                value.order_id.to_string(),
                value.received_at,
                value.receiver_id.to_string(),
                value.over_receipt_reason,
                value.created_by.to_string(),
                value.created_at,
            )
        {
            return Err(AuthError::InvalidInput);
        }
        let stored_items = transaction.prepare(
            "SELECT id, order_item_id, quantity_decimal, unit FROM local_receipt_items WHERE receipt_id = ?1 ORDER BY id",
        ).map_err(|_| AuthError::Database)?
            .query_map([value.id.to_string()], |row| Ok((
                row.get::<_, String>(0)?, row.get::<_, String>(1)?,
                row.get::<_, String>(2)?, row.get::<_, String>(3)?,
            )))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        if stored_items.len() != value.items.len()
            || value.items.iter().any(|item| {
                !stored_items.iter().any(|stored| {
                    stored
                        == &(
                            item.id.to_string(),
                            item.order_item_id.to_string(),
                            item.quantity.clone(),
                            item.unit.clone(),
                        )
                })
            })
        {
            return Err(AuthError::InvalidInput);
        }
        let stored_attachments = transaction
            .prepare("SELECT attachment_id FROM local_receipt_attachment_links WHERE receipt_id = ?1 ORDER BY attachment_id")
            .map_err(|_| AuthError::Database)?
            .query_map([value.id.to_string()], |row| row.get::<_, String>(0))
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)?;
        let mut expected_attachments = value
            .attachment_ids
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        expected_attachments.sort();
        if stored_attachments != expected_attachments {
            return Err(AuthError::InvalidInput);
        }
        return Ok(true);
    }
    transaction.execute(
        "INSERT INTO local_receipts (id, order_id, received_at, receiver_id, over_receipt_reason, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![value.id.to_string(), value.order_id.to_string(), value.received_at, value.receiver_id.to_string(), value.over_receipt_reason, value.created_by.to_string(), value.created_at],
    ).map_err(|_| AuthError::Database)?;
    for item in value.items {
        transaction.execute(
            "INSERT INTO local_receipt_items (id, receipt_id, order_item_id, quantity_decimal, unit) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![item.id.to_string(), value.id.to_string(), item.order_item_id.to_string(), item.quantity, item.unit],
        ).map_err(|_| AuthError::Database)?;
    }
    for attachment_id in value.attachment_ids {
        transaction
            .execute(
                "INSERT INTO local_receipt_attachment_links (receipt_id, attachment_id) VALUES (?1, ?2)",
                params![change.entity_id.to_string(), attachment_id.to_string()],
            )
            .map_err(|_| AuthError::Database)?;
    }
    Ok(true)
}

fn project_staged_procurement_expenditures(transaction: &Transaction<'_>) -> Result<(), AuthError> {
    let mut changes = transaction
        .prepare("SELECT entity_id, operation, server_version, payload_json, changed_at FROM local_sync_remote_entities WHERE entity_type = 'procurement_expenditure' ORDER BY json_extract(payload_json, '$.createdAt'), entity_id")
        .map_err(|_| AuthError::Database)?
        .query_map([], |row| {
            Ok(SyncPullChangeInput {
                cursor: "0".into(),
                entity_type: "procurement_expenditure".into(),
                entity_id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                operation: row.get(1)?,
                version: row.get(2)?,
                payload: serde_json::from_str(&row.get::<_, String>(3)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                changed_at: row.get(4)?,
            })
        })
        .map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| AuthError::Database)?;
    while !changes.is_empty() {
        let mut projected_any = false;
        let mut deferred = Vec::new();
        for change in changes {
            if project_remote_procurement_expenditure(transaction, &change)? {
                projected_any = true;
            } else {
                deferred.push(change);
            }
        }
        if !projected_any {
            return Ok(());
        }
        changes = deferred;
    }
    Ok(())
}

fn project_remote_procurement_expenditure(
    transaction: &Transaction<'_>,
    change: &SyncPullChangeInput,
) -> Result<bool, AuthError> {
    if change.operation != "upsert" {
        return Err(AuthError::InvalidInput);
    }
    let value: RemoteProcurementExpenditurePayload =
        serde_json::from_value(change.payload.clone()).map_err(|_| AuthError::InvalidInput)?;
    let amount_minor = value
        .amount_minor
        .parse::<i64>()
        .map_err(|_| AuthError::InvalidInput)?;
    if value.id != change.entity_id
        || amount_minor <= 0
        || value.created_at < 0
        || !valid_currency(&value.currency)
        || !valid_iso_date(&value.payment_date)
        || !valid_required_text(&value.payee_name, 255)
        || !valid_optional_text(&value.notes, 2000)
        || !matches!(
            value.payment_method.as_str(),
            "cash" | "bank_transfer" | "mobile_payment" | "other"
        )
        || !matches!(value.status.as_str(), "recorded" | "reversed")
        || !matches!(
            value.counterparty_type.as_str(),
            "registered_supplier" | "market_casual"
        )
        || (value.counterparty_type == "registered_supplier") != value.supplier_id.is_some()
        || (value.corrects_expenditure_id.is_some() != value.correction_reason.is_some())
        || (value.status == "reversed" && value.corrects_expenditure_id.is_none())
        || value
            .correction_reason
            .as_ref()
            .is_some_and(|reason| !valid_required_text(reason, 1000))
        || value
            .counterparty_snapshot
            .as_ref()
            .is_some_and(|snapshot| !snapshot.is_object())
    {
        return Err(AuthError::InvalidInput);
    }
    let normalized = serde_json::to_value(&value).map_err(|_| AuthError::InvalidInput)?;
    if normalized != change.payload {
        return Err(AuthError::InvalidInput);
    }
    let existing_json: Option<String> = transaction.query_row(
        "SELECT json_object('id', id, 'orderId', order_id, 'projectId', project_id, 'receiptId', receipt_id, 'counterpartyType', counterparty_type, 'supplierId', supplier_id, 'payeeName', payee_name, 'counterpartySnapshot', json(counterparty_snapshot_json), 'currency', currency, 'amountMinor', CAST(amount_minor AS TEXT), 'paymentDate', payment_date, 'paymentMethod', payment_method, 'paymentHandlerId', payment_handler_id, 'notes', notes, 'status', status, 'correctsExpenditureId', corrects_expenditure_id, 'correctionReason', correction_reason, 'createdBy', created_by, 'createdAt', created_at) FROM local_procurement_expenditures WHERE id = ?1",
        [value.id.to_string()], |row| row.get(0),
    ).optional().map_err(|_| AuthError::Database)?;
    if let Some(existing_json) = existing_json {
        let existing: serde_json::Value =
            serde_json::from_str(&existing_json).map_err(|_| AuthError::Database)?;
        if existing != normalized {
            return Err(AuthError::InvalidInput);
        }
        return Ok(true);
    }
    let order: Option<(String, Option<String>, Option<String>)> = transaction
        .query_row(
            "SELECT o.project_id, o.procurement_mode, parent.procurement_mode FROM local_purchase_orders o LEFT JOIN local_purchase_orders parent ON parent.id = o.parent_order_id WHERE o.id = ?1 AND o.deleted_at IS NULL",
            [value.order_id.to_string()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|_| AuthError::Database)?;
    let Some((project_id, mode, parent_mode)) = order else {
        return Ok(false);
    };
    if project_id != value.project_id.to_string()
        || mode.or(parent_mode).as_deref() != Some("honsen_self_purchase")
    {
        return Err(AuthError::InvalidInput);
    }
    if let Some(receipt_id) = value.receipt_id {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_receipts WHERE id = ?1 AND order_id = ?2)",
                params![receipt_id.to_string(), value.order_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if !exists {
            return Ok(false);
        }
    }
    if let Some(supplier_id) = value.supplier_id {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_suppliers WHERE id = ?1)",
                [supplier_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if !exists {
            return Ok(false);
        }
    }
    if let Some(prior_id) = value.corrects_expenditure_id {
        let prior: Option<(String, String)> = transaction
            .query_row(
                "SELECT order_id, status FROM local_procurement_expenditures WHERE id = ?1",
                [prior_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| AuthError::Database)?;
        let Some((prior_order, prior_status)) = prior else {
            return Ok(false);
        };
        if prior_order != value.order_id.to_string() || prior_status == value.status {
            return Err(AuthError::InvalidInput);
        }
    }
    let snapshot_json = value
        .counterparty_snapshot
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|_| AuthError::InvalidInput)?;
    transaction.execute(
        "INSERT INTO local_procurement_expenditures (id, order_id, project_id, receipt_id, counterparty_type, supplier_id, payee_name, counterparty_snapshot_json, currency, amount_minor, payment_date, payment_method, payment_handler_id, notes, status, corrects_expenditure_id, correction_reason, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        params![value.id.to_string(), value.order_id.to_string(), value.project_id.to_string(), value.receipt_id.map(|id| id.to_string()), value.counterparty_type, value.supplier_id.map(|id| id.to_string()), value.payee_name, snapshot_json, value.currency, amount_minor, value.payment_date, value.payment_method, value.payment_handler_id.to_string(), value.notes, value.status, value.corrects_expenditure_id.map(|id| id.to_string()), value.correction_reason, value.created_by.to_string(), value.created_at],
    ).map_err(|_| AuthError::InvalidInput)?;
    Ok(true)
}

fn project_staged_attachments(transaction: &Transaction<'_>) -> Result<(), AuthError> {
    let changes = transaction.prepare(
        "SELECT entity_id, operation, server_version, payload_json, changed_at FROM local_sync_remote_entities WHERE entity_type = 'attachment' ORDER BY entity_id",
    ).map_err(|_| AuthError::Database)?
        .query_map([], |row| Ok(SyncPullChangeInput {
            cursor: "0".into(), entity_type: "attachment".into(),
            entity_id: Uuid::parse_str(&row.get::<_, String>(0)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
            operation: row.get(1)?, version: row.get(2)?,
            payload: serde_json::from_str(&row.get::<_, String>(3)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
            changed_at: row.get(4)?,
        })).map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)?;
    for change in changes {
        if change.operation != "upsert" {
            return Err(AuthError::InvalidInput);
        }
        let value: RemoteAttachmentPayload =
            serde_json::from_value(change.payload).map_err(|_| AuthError::InvalidInput)?;
        if value.id != change.entity_id
            || !matches!(
                value.owner_type.as_str(),
                "procurement_expenditure" | "receipt"
            )
            || value.byte_length < 1
            || value.byte_length > MAX_ATTACHMENT_BYTES as i64
            || value.created_at < 0
            || !valid_required_text(&value.original_name, 255)
            || attachment_content_type(&value.original_name) != Some(value.content_type.as_str())
            || value.checksum.len() != 64
            || !value
                .checksum
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(AuthError::InvalidInput);
        }
        let owner: Option<(String, String)> = if value.owner_type == "receipt" {
            transaction.query_row(
                "SELECT r.order_id, o.project_id FROM local_receipts r JOIN local_purchase_orders o ON o.id = r.order_id WHERE r.id = ?1",
                [value.owner_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?)),
            ).optional().map_err(|_| AuthError::Database)?
        } else {
            transaction
                .query_row(
                    "SELECT order_id, project_id FROM local_procurement_expenditures WHERE id = ?1",
                    [value.owner_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|_| AuthError::Database)?
        };
        let Some((order_id, project_id)) = owner else {
            continue;
        };
        if order_id != value.order_id.to_string() || project_id != value.project_id.to_string() {
            return Err(AuthError::InvalidInput);
        }
        let prior: Option<(String, String, String, String, String, String, i64, String, String, i64)> = transaction.query_row(
            "SELECT owner_type, owner_id, order_id, project_id, original_name, content_type, byte_length, checksum, uploader_id, created_at FROM local_attachments WHERE id = ?1",
            [value.id.to_string()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?)),
        ).optional().map_err(|_| AuthError::Database)?;
        let expected = (
            value.owner_type,
            value.owner_id.to_string(),
            value.order_id.to_string(),
            value.project_id.to_string(),
            value.original_name,
            value.content_type,
            value.byte_length,
            value.checksum,
            value.uploader_id.to_string(),
            value.created_at,
        );
        if let Some(prior) = prior {
            if prior != expected {
                return Err(AuthError::InvalidInput);
            }
            transaction.execute("UPDATE local_attachments SET upload_state = CASE WHEN local_path = '' THEN 'pending_download' ELSE 'uploaded' END WHERE id = ?1", [value.id.to_string()])
                .map_err(|_| AuthError::Database)?;
        } else {
            transaction.execute("INSERT INTO local_attachments (id, owner_type, owner_id, order_id, project_id, original_name, content_type, byte_length, local_path, upload_state, checksum, uploader_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', 'pending_download', ?9, ?10, ?11)",
                params![value.id.to_string(), expected.0, expected.1, expected.2, expected.3, expected.4, expected.5, expected.6, expected.7, expected.8, expected.9])
                .map_err(|_| AuthError::Database)?;
        }
    }
    Ok(())
}

fn remote_order_references_exist(
    transaction: &Transaction<'_>,
    order: &RemotePurchaseOrderPayload,
) -> Result<bool, AuthError> {
    for (table, id) in [
        ("local_countries", order.country_id),
        ("local_projects", order.project_id),
        ("local_departments", order.department_id),
        ("local_teams", order.team_id),
    ] {
        let query =
            format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id = ?1 AND deleted_at IS NULL)");
        let exists: bool = transaction
            .query_row(&query, [id.to_string()], |row| row.get(0))
            .map_err(|_| AuthError::Database)?;
        if !exists {
            return Ok(false);
        }
    }
    if let Some(supplier_id) = order.supplier_id {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_suppliers WHERE id = ?1 AND deleted_at IS NULL)",
                [supplier_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if !exists {
            return Ok(false);
        }
    }
    for material_id in order.lines.iter().filter_map(|line| line.material_id) {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM local_materials WHERE id = ?1 AND deleted_at IS NULL)",
                [material_id.to_string()],
                |row| row.get(0),
            )
            .map_err(|_| AuthError::Database)?;
        if !exists {
            return Ok(false);
        }
    }
    Ok(true)
}

fn validate_remote_purchase_order(order: &RemotePurchaseOrderPayload) -> Result<(), AuthError> {
    if order.lines.is_empty()
        || order.lines.len() > 500
        || !valid_required_text(&order.display_no, 128)
        || !valid_required_text(&order.site, 256)
        || !valid_required_text(&order.delivery_address, 512)
        || !valid_currency(&order.currency)
        || !valid_currency(&order.primary_currency)
        || !matches!(order.language_pair.as_str(), "zh_fr" | "zh_en")
        || order
            .procurement_mode
            .as_deref()
            .is_some_and(|mode| !matches!(mode, "owner_self_purchase" | "honsen_self_purchase"))
        || !matches!(order.status.as_str(), "draft" | "pending_confirmation")
        || !matches!(
            order.workflow_status.as_str(),
            "draft"
                | "pending_confirmation"
                | "rejected"
                | "confirmed"
                | "approved"
                | "formally_issued"
                | "executing"
                | "receiving"
                | "sent"
                | "completed"
                | "completed_with_conditions"
                | "cancelled"
        )
        || !matches!(order.urgency.as_str(), "low" | "normal" | "high")
        || !valid_iso_date(&order.order_date)
        || order
            .expected_delivery_date
            .as_ref()
            .is_some_and(|value| !valid_iso_date(value))
        || !valid_optional_text(&order.urgency_reason, 1000)
        || !valid_optional_text(&order.notes, 4000)
        || !valid_optional_text(&order.rejection_reason, 1000)
        || order.confirmed_at.is_some_and(|value| value < 0)
        || order
            .supplier_terms_completed_at
            .is_some_and(|value| value < 0)
        || !(0..=100_000).contains(&order.tax_rate_basis_points)
    {
        return Err(AuthError::InvalidInput);
    }
    if order
        .locked_exchange_rate_decimal
        .as_ref()
        .is_some_and(|value| !valid_decimal_rate(value))
        || order
            .supplier_snapshot_json
            .as_ref()
            .is_some_and(|value| !valid_json_object(value))
    {
        return Err(AuthError::InvalidInput);
    }
    for value in [
        &order.subtotal_minor,
        &order.line_discount_minor,
        &order.order_discount_minor,
        &order.freight_minor,
        &order.tax_minor,
        &order.total_minor,
    ] {
        remote_minor(value)?;
    }
    let mut line_ids = HashSet::new();
    let mut sort_orders = HashSet::new();
    for line in &order.lines {
        if !line_ids.insert(line.id)
            || !sort_orders.insert(line.sort_order)
            || line.sort_order < 0
            || line.created_at < 0
            || line.updated_at < line.created_at
            || !valid_currency(&line.currency)
            || !valid_required_text(&line.unit, 64)
            || parse_quantity_hundredths(&line.quantity).is_err()
            || !valid_json_object(&line.material_snapshot_json)
            || line
                .supplier_snapshot_json
                .as_ref()
                .is_some_and(|value| !valid_json_object(value))
        {
            return Err(AuthError::InvalidInput);
        }
        remote_minor(&line.unit_price_minor)?;
        remote_minor(&line.line_total_minor)?;
        let line_discount: AdjustmentInput =
            serde_json::from_str(&line.line_discount_json).map_err(|_| AuthError::InvalidInput)?;
        let line_freight: AdjustmentInput =
            serde_json::from_str(&line.line_freight_json).map_err(|_| AuthError::InvalidInput)?;
        validate_adjustment(&line_discount)?;
        validate_adjustment(&line_freight)?;
    }
    Ok(())
}

fn remote_minor(value: &str) -> Result<i64, AuthError> {
    as_i64(parse_non_negative_minor(value)?)
}

fn valid_json_object(value: &str) -> bool {
    value.len() <= 100_000
        && serde_json::from_str::<serde_json::Value>(value)
            .map(|parsed| parsed.is_object())
            .unwrap_or(false)
}

fn project_remote_order_comment(
    transaction: &Transaction<'_>,
    change: &SyncPullChangeInput,
) -> Result<(), AuthError> {
    if change.entity_type != "order_comment" {
        return Ok(());
    }
    if change.operation != "upsert" {
        return Err(AuthError::InvalidInput);
    }
    let payload = change.payload.as_object().ok_or(AuthError::InvalidInput)?;
    let order_id = payload
        .get("orderId")
        .and_then(serde_json::Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(AuthError::InvalidInput)?;
    let author_id = payload
        .get("authorId")
        .and_then(serde_json::Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(AuthError::InvalidInput)?;
    let body = payload
        .get("body")
        .and_then(serde_json::Value::as_str)
        .filter(|value| valid_required_text(value, 4000))
        .ok_or(AuthError::InvalidInput)?;
    let created_at = payload
        .get("createdAt")
        .and_then(serde_json::Value::as_i64)
        .filter(|value| *value >= 0)
        .ok_or(AuthError::InvalidInput)?;
    transaction
        .execute(
            "INSERT OR IGNORE INTO local_order_comments (id, order_id, author_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![change.entity_id.to_string(), order_id.to_string(), author_id.to_string(), body, created_at],
        )
        .map_err(|_| AuthError::Database)?;
    Ok(())
}

fn project_remote_reference_master_data(
    transaction: &Transaction<'_>,
    record: &ReferenceMasterDataInput,
    change: &SyncPullChangeInput,
) -> Result<(), AuthError> {
    match record {
        ReferenceMasterDataInput::Country {
            id,
            business_code,
            name,
            time_zone,
            is_active,
            version,
        } => {
            if *id != change.entity_id || change.entity_type != "country" {
                return Err(AuthError::InvalidInput);
            }
            validate_reference(business_code, name, *version)?;
            assert_immutable_local_business_code(
                transaction,
                "local_countries",
                *id,
                business_code,
            )?;
            transaction.execute("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET name = excluded.name, time_zone = excluded.time_zone, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), business_code, name, time_zone, *is_active as i64, change.version]).map_err(|_| AuthError::Database)?;
        }
        ReferenceMasterDataInput::Project {
            id,
            country_id,
            business_code,
            name,
            site,
            department_name,
            default_currency,
            default_language_pair,
            is_active,
            version,
        } => {
            if *id != change.entity_id
                || change.entity_type != "project"
                || site.trim().is_empty()
                || department_name.trim().is_empty()
                || !valid_currency(default_currency)
                || !matches!(default_language_pair.as_str(), "zh_fr" | "zh_en")
            {
                return Err(AuthError::InvalidInput);
            }
            validate_reference(business_code, name, *version)?;
            assert_immutable_local_business_code(
                transaction,
                "local_projects",
                *id,
                business_code,
            )?;
            transaction.execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT(id) DO UPDATE SET country_id = excluded.country_id, name = excluded.name, site = excluded.site, department_name = excluded.department_name, default_currency = excluded.default_currency, default_language_pair = excluded.default_language_pair, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), country_id.to_string(), business_code, name, site, department_name, default_currency, default_language_pair, *is_active as i64, change.version]).map_err(|_| AuthError::Database)?;
        }
        ReferenceMasterDataInput::Site {
            id,
            project_id,
            business_code,
            name,
            is_active,
            version,
        } => {
            if *id != change.entity_id || change.entity_type != "site" {
                return Err(AuthError::InvalidInput);
            }
            validate_reference(business_code, name, *version)?;
            assert_immutable_local_business_code(transaction, "local_sites", *id, business_code)?;
            transaction.execute("INSERT INTO local_sites (id, project_id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), project_id.to_string(), business_code, name, *is_active as i64, change.version]).map_err(|_| AuthError::Database)?;
        }
        ReferenceMasterDataInput::Department {
            id,
            business_code,
            name,
            is_active,
            version,
        } => {
            if *id != change.entity_id || change.entity_type != "department" {
                return Err(AuthError::InvalidInput);
            }
            validate_reference(business_code, name, *version)?;
            assert_immutable_local_business_code(
                transaction,
                "local_departments",
                *id,
                business_code,
            )?;
            transaction.execute("INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), business_code, name, *is_active as i64, change.version]).map_err(|_| AuthError::Database)?;
        }
        ReferenceMasterDataInput::Team {
            id,
            department_id,
            business_code,
            name,
            is_active,
            version,
        } => {
            if *id != change.entity_id || change.entity_type != "team" {
                return Err(AuthError::InvalidInput);
            }
            validate_reference(business_code, name, *version)?;
            assert_immutable_local_business_code(transaction, "local_teams", *id, business_code)?;
            transaction.execute("INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO UPDATE SET department_id = excluded.department_id, name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), department_id.to_string(), business_code, name, *is_active as i64, change.version]).map_err(|_| AuthError::Database)?;
        }
        ReferenceMasterDataInput::Unit {
            id,
            business_code,
            name,
            is_active,
            version,
        } => {
            if *id != change.entity_id || change.entity_type != "unit" {
                return Err(AuthError::InvalidInput);
            }
            validate_reference(business_code, name, *version)?;
            assert_immutable_local_business_code(transaction, "local_units", *id, business_code)?;
            transaction.execute("INSERT INTO local_units (id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_active = excluded.is_active, version = excluded.version, deleted_at = NULL", params![id.to_string(), business_code, name, *is_active as i64, change.version]).map_err(|_| AuthError::Database)?;
        }
    }
    Ok(())
}

struct CalculatedRequisition {
    subtotal: i64,
    line_discount: i64,
    order_discount: i64,
    freight: i64,
    tax: i64,
    total: i64,
    lines: Vec<CalculatedRequisitionLine>,
}

struct CalculatedRequisitionLine {
    input: RequisitionLineInput,
    unit_price_minor: i64,
    total: i64,
}

impl CalculatedRequisition {
    fn view(&self) -> RequisitionTotalsView {
        RequisitionTotalsView {
            subtotal_minor: self.subtotal.to_string(),
            line_discount_minor: self.line_discount.to_string(),
            order_discount_minor: self.order_discount.to_string(),
            freight_minor: self.freight.to_string(),
            tax_minor: self.tax.to_string(),
            total_minor: self.total.to_string(),
        }
    }
}

fn validate_requisition_draft(draft: &RequisitionDraftInput) -> Result<(), AuthError> {
    if !valid_required_text(&draft.display_no, 128)
        || !valid_required_text(&draft.site, 255)
        || !valid_required_text(&draft.delivery_address, 1000)
        || !valid_iso_date(&draft.order_date)
        || draft
            .expected_delivery_date
            .as_ref()
            .is_some_and(|value| !valid_iso_date(value))
        || draft.notes.as_ref().is_some_and(|value| value.len() > 4000)
        || !valid_currency(&draft.currency)
        || !valid_currency(&draft.primary_currency)
        || !matches!(draft.language_pair.as_str(), "zh_fr" | "zh_en")
        || !matches!(draft.urgency.as_str(), "low" | "normal" | "high")
        || draft.tax_rate_basis_points < 0
        || draft.tax_rate_basis_points > 100_000
        || draft.lines.is_empty()
        || draft.lines.len() > 500
        || (draft.urgency == "high"
            && draft
                .urgency_reason
                .as_ref()
                .is_none_or(|value| !valid_required_text(value, 1000)))
    {
        return Err(AuthError::InvalidInput);
    }
    let mut sort_orders = HashSet::new();
    for line in &draft.lines {
        if line.sort_order < 0
            || !sort_orders.insert(line.sort_order)
            || !valid_required_text(&line.unit, 64)
            || !valid_currency(&line.currency)
            || !valid_required_text(&line.material_snapshot.name_zh, 255)
            || !valid_required_text(&line.material_snapshot.model, 255)
            || !valid_required_text(&line.material_snapshot.specification, 2000)
            || line
                .material_snapshot
                .name_fr
                .as_ref()
                .is_some_and(|value| !valid_required_text(value, 255))
        {
            return Err(AuthError::InvalidInput);
        }
        parse_quantity_hundredths(&line.quantity)?;
        parse_non_negative_minor(&line.unit_price_minor)?;
        validate_adjustment(&line.line_discount)?;
        validate_adjustment(&line.line_freight)?;
    }
    validate_adjustment(&draft.order_discount)?;
    validate_adjustment(&draft.order_freight)
}

fn calculate_requisition(
    draft: &RequisitionDraftInput,
) -> Result<CalculatedRequisition, AuthError> {
    let mixed_currencies = draft
        .lines
        .iter()
        .map(|line| &line.currency)
        .collect::<HashSet<_>>()
        .len()
        > 1;
    if mixed_currencies
        && (draft.tax_rate_basis_points != 0
            || !is_zero_adjustment(&draft.order_discount)
            || !is_zero_adjustment(&draft.order_freight))
    {
        return Err(AuthError::InvalidInput);
    }
    let mut subtotal = 0i128;
    let mut line_discount = 0i128;
    let mut line_freight = 0i128;
    let mut lines = Vec::with_capacity(draft.lines.len());
    for input in &draft.lines {
        let price = parse_non_negative_minor(&input.unit_price_minor)?;
        let quantity = parse_quantity_hundredths(&input.quantity)?;
        let line_subtotal = divide_half_up(price * quantity, 100)?;
        let discount = adjustment_amount(line_subtotal, &input.line_discount, true)?;
        let freight = if input.freight_included {
            0
        } else {
            adjustment_amount(line_subtotal - discount, &input.line_freight, false)?
        };
        subtotal += line_subtotal;
        line_discount += discount;
        line_freight += freight;
        lines.push(CalculatedRequisitionLine {
            input: input.clone(),
            unit_price_minor: as_i64(price)?,
            total: as_i64(line_subtotal - discount + freight)?,
        });
    }
    if mixed_currencies {
        return Ok(CalculatedRequisition {
            subtotal: 0,
            line_discount: 0,
            order_discount: 0,
            freight: 0,
            tax: 0,
            total: 0,
            lines,
        });
    }
    let after_line_discount = subtotal - line_discount;
    let order_discount = adjustment_amount(after_line_discount, &draft.order_discount, true)?;
    let order_freight = adjustment_amount(
        after_line_discount - order_discount,
        &draft.order_freight,
        false,
    )?;
    let freight = line_freight + order_freight;
    let taxable = after_line_discount - order_discount + freight;
    let tax = divide_half_up(taxable * i128::from(draft.tax_rate_basis_points), 10_000)?;
    Ok(CalculatedRequisition {
        subtotal: as_i64(subtotal)?,
        line_discount: as_i64(line_discount)?,
        order_discount: as_i64(order_discount)?,
        freight: as_i64(freight)?,
        tax: as_i64(tax)?,
        total: as_i64(taxable + tax)?,
        lines,
    })
}

fn valid_sync_cursor(value: &str) -> bool {
    !value.is_empty() && value.len() <= 20 && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn parse_sync_cursor(value: &str) -> Result<i64, AuthError> {
    if !valid_sync_cursor(value) {
        return Err(AuthError::InvalidInput);
    }
    value.parse().map_err(|_| AuthError::InvalidInput)
}

fn pull_page_has_more(cursor: &str, page: &SyncPullPageInput) -> Result<bool, AuthError> {
    let current = parse_sync_cursor(cursor).map_err(|_| AuthError::SyncTransport)?;
    let next = parse_sync_cursor(&page.next_cursor).map_err(|_| AuthError::SyncTransport)?;
    if page.changes.is_empty() {
        return (next == current)
            .then_some(false)
            .ok_or(AuthError::SyncTransport);
    }
    if next <= current {
        return Err(AuthError::SyncTransport);
    }
    Ok(page.changes.len() == SYNC_PULL_PAGE_LIMIT)
}

fn sync_push_endpoint() -> Result<reqwest::Url, AuthError> {
    let value = std::env::var("HONSEN_SYNC_API_BASE_URL").map_err(|_| AuthError::SyncTransport)?;
    sync_endpoint_from(&value, "push")
}

fn sync_pull_endpoint() -> Result<reqwest::Url, AuthError> {
    let value = std::env::var("HONSEN_SYNC_API_BASE_URL").map_err(|_| AuthError::SyncTransport)?;
    sync_endpoint_from(&value, "pull")
}

fn authorization_context_endpoint() -> Result<reqwest::Url, AuthError> {
    let value = std::env::var("HONSEN_SYNC_API_BASE_URL").map_err(|_| AuthError::SyncTransport)?;
    api_endpoint_from(&value, "authorization/context")
}

fn authorization_binding_endpoint(account_id: Uuid) -> Result<reqwest::Url, AuthError> {
    let value = std::env::var("HONSEN_SYNC_API_BASE_URL").map_err(|_| AuthError::SyncTransport)?;
    api_endpoint_from(&value, &format!("authorization/bindings/{account_id}"))
}

fn cloud_auth_endpoint(operation: &str) -> Result<reqwest::Url, AuthError> {
    let value = std::env::var("HONSEN_SYNC_API_BASE_URL").map_err(|_| AuthError::SyncTransport)?;
    api_endpoint_from(&value, &format!("auth/{operation}"))
}

fn attachment_endpoint(operation: &str) -> Result<reqwest::Url, AuthError> {
    let value = std::env::var("HONSEN_SYNC_API_BASE_URL").map_err(|_| AuthError::SyncTransport)?;
    api_endpoint_from(&value, &format!("attachments/{operation}"))
}

fn signed_attachment_url(value: &str) -> Result<reqwest::Url, AuthError> {
    let url = reqwest::Url::parse(value).map_err(|_| AuthError::SyncTransport)?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AuthError::SyncTransport);
    }
    Ok(url)
}

fn sync_endpoint_from(value: &str, operation: &str) -> Result<reqwest::Url, AuthError> {
    api_endpoint_from(value, &format!("sync/{operation}"))
}

fn api_endpoint_from(value: &str, path: &str) -> Result<reqwest::Url, AuthError> {
    let mut endpoint = reqwest::Url::parse(&value).map_err(|_| AuthError::SyncTransport)?;
    if endpoint.scheme() != "https"
        || endpoint.host_str().is_none()
        || endpoint.username() != ""
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
    {
        return Err(AuthError::SyncTransport);
    }
    endpoint.set_path(&format!(
        "{}/api/{path}",
        endpoint.path().trim_end_matches('/')
    ));
    Ok(endpoint)
}

fn insert_local_sync_outbox(
    transaction: &Transaction<'_>,
    entity_type: &str,
    entity_id: Uuid,
    payload: &str,
    now: SystemTime,
) -> Result<(), AuthError> {
    let server_version: i64 = transaction
        .query_row(
            "SELECT server_version FROM local_sync_entity_versions WHERE entity_type = ?1 AND entity_id = ?2",
            params![entity_type, entity_id.to_string()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| AuthError::Database)?
        .unwrap_or(0);
    let pending_count: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM local_sync_outbox WHERE entity_type = ?1 AND entity_id = ?2 AND acknowledged_at IS NULL AND superseded_at IS NULL",
            params![entity_type, entity_id.to_string()],
            |row| row.get(0),
        )
        .map_err(|_| AuthError::Database)?;
    transaction
        .execute(
            "INSERT INTO local_sync_outbox (event_id, entity_type, entity_id, operation, base_version, payload_json, created_at) VALUES (?1, ?2, ?3, 'upsert', ?4, ?5, ?6)",
            params![Uuid::new_v4().to_string(), entity_type, entity_id.to_string(), server_version + pending_count, payload, unix_seconds(now)],
        )
        .map_err(|_| AuthError::Database)?;
    Ok(())
}

fn order_sync_payload(transaction: &Transaction<'_>, order_id: Uuid) -> Result<String, AuthError> {
    let header = transaction
        .query_row(
            "SELECT parent_order_id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, supplier_id, supplier_snapshot_json, currency, primary_currency, locked_exchange_rate_decimal, language_pair, status, workflow_status, urgency, urgency_reason, order_date, delivery_address, expected_delivery_date, notes, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, confirmed_by, confirmed_at, rejection_reason, self_approved, supplier_terms_completed_at, procurement_mode FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
            [order_id.to_string()],
            |row| Ok(serde_json::json!({
                "parentOrderId": row.get::<_, Option<String>>(0)?,
                "displayNo": row.get::<_, String>(1)?,
                "countryId": row.get::<_, String>(2)?,
                "projectId": row.get::<_, String>(3)?,
                "site": row.get::<_, String>(4)?,
                "departmentId": row.get::<_, String>(5)?,
                "teamId": row.get::<_, String>(6)?,
                "applicantId": row.get::<_, String>(7)?,
                "supplierId": row.get::<_, Option<String>>(8)?,
                "supplierSnapshotJson": row.get::<_, Option<String>>(9)?,
                "currency": row.get::<_, String>(10)?,
                "primaryCurrency": row.get::<_, String>(11)?,
                "lockedExchangeRateDecimal": row.get::<_, Option<String>>(12)?,
                "languagePair": row.get::<_, String>(13)?,
                "status": row.get::<_, String>(14)?,
                "workflowStatus": row.get::<_, String>(15)?,
                "urgency": row.get::<_, String>(16)?,
                "urgencyReason": row.get::<_, Option<String>>(17)?,
                "orderDate": row.get::<_, String>(18)?,
                "deliveryAddress": row.get::<_, String>(19)?,
                "expectedDeliveryDate": row.get::<_, Option<String>>(20)?,
                "notes": row.get::<_, Option<String>>(21)?,
                "subtotalMinor": row.get::<_, i64>(22)?.to_string(),
                "lineDiscountMinor": row.get::<_, i64>(23)?.to_string(),
                "orderDiscountMinor": row.get::<_, i64>(24)?.to_string(),
                "freightMinor": row.get::<_, i64>(25)?.to_string(),
                "taxRateBasisPoints": row.get::<_, i32>(26)?,
                "taxMinor": row.get::<_, i64>(27)?.to_string(),
                "totalMinor": row.get::<_, i64>(28)?.to_string(),
                "confirmedBy": row.get::<_, Option<String>>(29)?,
                "confirmedAt": row.get::<_, Option<i64>>(30)?,
                "rejectionReason": row.get::<_, Option<String>>(31)?,
                "selfApproved": row.get::<_, i64>(32)? != 0,
                "supplierTermsCompletedAt": row.get::<_, Option<i64>>(33)?,
                "procurementMode": row.get::<_, Option<String>>(34)?,
            })),
        )
        .map_err(|_| AuthError::Database)?;
    let lines = transaction
        .prepare("SELECT id, material_id, material_snapshot_json, supplier_snapshot_json, currency, quantity_decimal, unit, unit_price_minor, line_discount_json, line_freight_json, freight_included, line_total_minor, sort_order, created_at, updated_at, owner_quote_source, owner_catalog_price_id, owner_manual_reference_reason, owner_manual_reference_actor_id, owner_manual_reference_at, owner_source_unit_price_minor, owner_locked_exchange_rate_decimal, owner_converted_reference_unit_minor, owner_markup_json, owner_final_unit_price_minor FROM local_purchase_order_items WHERE order_id = ?1 ORDER BY sort_order, id")
        .map_err(|_| AuthError::Database)?
        .query_map([order_id.to_string()], |row| Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "materialId": row.get::<_, Option<String>>(1)?,
            "materialSnapshotJson": row.get::<_, String>(2)?,
            "supplierSnapshotJson": row.get::<_, Option<String>>(3)?,
            "currency": row.get::<_, String>(4)?,
            "quantity": row.get::<_, String>(5)?,
            "unit": row.get::<_, String>(6)?,
            "unitPriceMinor": row.get::<_, i64>(7)?.to_string(),
            "lineDiscountJson": row.get::<_, String>(8)?,
            "lineFreightJson": row.get::<_, String>(9)?,
            "freightIncluded": row.get::<_, i64>(10)? != 0,
            "lineTotalMinor": row.get::<_, i64>(11)?.to_string(),
            "sortOrder": row.get::<_, i64>(12)?,
            "createdAt": row.get::<_, i64>(13)?,
            "updatedAt": row.get::<_, i64>(14)?,
            "ownerQuoteSource": row.get::<_, Option<String>>(15)?,
            "ownerCatalogPriceId": row.get::<_, Option<String>>(16)?,
            "ownerManualReferenceReason": row.get::<_, Option<String>>(17)?,
            "ownerManualReferenceActorId": row.get::<_, Option<String>>(18)?,
            "ownerManualReferenceAt": row.get::<_, Option<i64>>(19)?,
            "ownerSourceUnitPriceMinor": row.get::<_, Option<i64>>(20)?.map(|value| value.to_string()),
            "ownerLockedExchangeRateDecimal": row.get::<_, Option<String>>(21)?,
            "ownerConvertedReferenceUnitMinor": row.get::<_, Option<i64>>(22)?.map(|value| value.to_string()),
            "ownerMarkupJson": row.get::<_, Option<String>>(23)?,
            "ownerFinalUnitPriceMinor": row.get::<_, Option<i64>>(24)?.map(|value| value.to_string()),
        })))
        .map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| AuthError::Database)?;
    let mut payload = header.as_object().cloned().ok_or(AuthError::Database)?;
    payload.insert("lines".into(), serde_json::Value::Array(lines));
    serde_json::to_string(&serde_json::Value::Object(payload)).map_err(|_| AuthError::Database)
}

fn receipt_sync_payload(
    transaction: &Connection,
    receipt_id: Uuid,
    completed: bool,
) -> Result<String, AuthError> {
    let mut payload = transaction.query_row(
        "SELECT r.order_id, o.project_id, r.received_at, r.receiver_id, r.over_receipt_reason, r.created_by, r.created_at FROM local_receipts r JOIN local_purchase_orders o ON o.id = r.order_id WHERE r.id = ?1",
        [receipt_id.to_string()],
        |row| Ok(serde_json::json!({
            "id": receipt_id, "orderId": row.get::<_, String>(0)?, "projectId": row.get::<_, String>(1)?,
            "receivedAt": row.get::<_, String>(2)?, "receiverId": row.get::<_, String>(3)?,
            "overReceiptReason": row.get::<_, Option<String>>(4)?, "createdBy": row.get::<_, String>(5)?,
            "createdAt": row.get::<_, i64>(6)?, "completed": completed,
        })),
    ).map_err(|_| AuthError::Database)?;
    let items = transaction.prepare(
        "SELECT id, order_item_id, quantity_decimal, unit FROM local_receipt_items WHERE receipt_id = ?1 ORDER BY id",
    ).map_err(|_| AuthError::Database)?
        .query_map([receipt_id.to_string()], |row| Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?, "orderItemId": row.get::<_, String>(1)?,
            "quantity": row.get::<_, String>(2)?, "unit": row.get::<_, String>(3)?,
        }))).map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)?;
    let attachment_ids = transaction.prepare(
        "SELECT attachment_id FROM local_receipt_attachment_links WHERE receipt_id = ?1 ORDER BY attachment_id",
    ).map_err(|_| AuthError::Database)?
        .query_map([receipt_id.to_string()], |row| row.get::<_, String>(0))
        .map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>().map_err(|_| AuthError::Database)?;
    payload["items"] = serde_json::Value::Array(items);
    payload["attachmentIds"] = serde_json::json!(attachment_ids);
    serde_json::to_string(&payload).map_err(|_| AuthError::Database)
}

fn append_order_audit(
    transaction: &Transaction<'_>,
    order_id: Uuid,
    actor_id: Uuid,
    action: &str,
    reason: Option<&str>,
    previous: Option<&str>,
    next: Option<&str>,
    now: SystemTime,
) -> Result<(), AuthError> {
    transaction
        .execute(
            "INSERT INTO local_order_audit_entries (id, order_id, actor_id, action, reason, previous_json, next_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![Uuid::new_v4().to_string(), order_id.to_string(), actor_id.to_string(), action, reason, previous, next, unix_seconds(now)],
        )
        .map_err(|_| AuthError::Database)?;
    Ok(())
}

fn order_audit_snapshot(
    transaction: &Transaction<'_>,
    order_id: Uuid,
) -> Result<String, AuthError> {
    let header: (String, String, String, Option<String>, Option<String>, i32, i64) = transaction
        .query_row(
            "SELECT display_no, currency, delivery_address, expected_delivery_date, notes, tax_rate_basis_points, total_minor FROM local_purchase_orders WHERE id = ?1 AND deleted_at IS NULL",
            [order_id.to_string()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
        )
        .map_err(|_| AuthError::Database)?;
    let mut statement = transaction
        .prepare(
            "SELECT id, material_snapshot_json, supplier_snapshot_json, currency, quantity_decimal, unit, unit_price_minor, line_total_minor, owner_quote_source, owner_catalog_price_id, owner_manual_reference_reason, owner_manual_reference_actor_id, owner_manual_reference_at, owner_source_unit_price_minor, owner_locked_exchange_rate_decimal, owner_converted_reference_unit_minor, owner_markup_json, owner_final_unit_price_minor FROM local_purchase_order_items WHERE order_id = ?1 ORDER BY sort_order, id",
        )
        .map_err(|_| AuthError::Database)?;
    let lines = statement
        .query_map([order_id.to_string()], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "material": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(1)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
                "supplier": row.get::<_, Option<String>>(2)?.map(|value| serde_json::from_str::<serde_json::Value>(&value)).transpose().map_err(|_| rusqlite::Error::InvalidQuery)?,
                "currency": row.get::<_, String>(3)?,
                "quantity": row.get::<_, String>(4)?,
                "unit": row.get::<_, String>(5)?,
                "unitPriceMinor": row.get::<_, i64>(6)?.to_string(),
                "lineTotalMinor": row.get::<_, i64>(7)?.to_string(),
                "ownerQuoteSource": row.get::<_, Option<String>>(8)?,
                "ownerCatalogPriceId": row.get::<_, Option<String>>(9)?,
                "ownerManualReferenceReason": row.get::<_, Option<String>>(10)?,
                "ownerManualReferenceActorId": row.get::<_, Option<String>>(11)?,
                "ownerManualReferenceAt": row.get::<_, Option<i64>>(12)?,
                "ownerSourceUnitPriceMinor": row.get::<_, Option<i64>>(13)?.map(|value| value.to_string()),
                "ownerLockedExchangeRateDecimal": row.get::<_, Option<String>>(14)?,
                "ownerConvertedReferenceUnitMinor": row.get::<_, Option<i64>>(15)?.map(|value| value.to_string()),
                "ownerMarkupJson": row.get::<_, Option<String>>(16)?,
                "ownerFinalUnitPriceMinor": row.get::<_, Option<i64>>(17)?.map(|value| value.to_string()),
            }))
        })
        .map_err(|_| AuthError::Database)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| AuthError::Database)?;
    serde_json::to_string(&serde_json::json!({
        "displayNo": header.0,
        "currency": header.1,
        "deliveryAddress": header.2,
        "expectedDeliveryDate": header.3,
        "notes": header.4,
        "taxRateBasisPoints": header.5,
        "totalMinor": header.6.to_string(),
        "lines": lines,
    }))
    .map_err(|_| AuthError::Database)
}

fn mentioned_usernames(body: &str) -> HashSet<String> {
    body.match_indices('@')
        .filter_map(|(index, _)| {
            let previous = body[..index].chars().next_back();
            if previous.is_some_and(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
            }) {
                return None;
            }
            let username: String = body[index + 1..]
                .chars()
                .take_while(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
                })
                .collect();
            (!username.is_empty()).then_some(username)
        })
        .collect()
}

fn parse_non_negative_minor(value: &str) -> Result<i128, AuthError> {
    if value.is_empty() || !value.bytes().all(|character| character.is_ascii_digit()) {
        return Err(AuthError::InvalidInput);
    }
    value
        .parse::<i128>()
        .ok()
        .filter(|value| *value >= 0)
        .ok_or(AuthError::InvalidInput)
}

fn parse_quantity_hundredths(value: &str) -> Result<i128, AuthError> {
    let mut parts = value.split('.');
    let whole = parts.next().ok_or(AuthError::InvalidInput)?;
    let fraction = parts.next().unwrap_or("");
    if parts.next().is_some()
        || whole.is_empty()
        || !whole.bytes().all(|character| character.is_ascii_digit())
        || fraction.len() > 2
        || !fraction.bytes().all(|character| character.is_ascii_digit())
    {
        return Err(AuthError::InvalidInput);
    }
    let hundredths = whole
        .parse::<i128>()
        .ok()
        .and_then(|whole| whole.checked_mul(100))
        .and_then(|whole| {
            whole.checked_add(
                fraction.parse::<i128>().unwrap_or(0) * 10_i128.pow((2 - fraction.len()) as u32),
            )
        })
        .ok_or(AuthError::InvalidInput)?;
    if hundredths == 0 {
        return Err(AuthError::InvalidInput);
    }
    Ok(hundredths)
}

fn validate_adjustment(adjustment: &AdjustmentInput) -> Result<(), AuthError> {
    match adjustment {
        AdjustmentInput::FixedMinor { minor } => {
            parse_non_negative_minor(minor)?;
        }
        AdjustmentInput::PercentBasisPoints { basis_points }
            if (0..=10_000).contains(basis_points) => {}
        AdjustmentInput::PercentBasisPoints { .. } => return Err(AuthError::InvalidInput),
    }
    Ok(())
}

fn is_zero_adjustment(adjustment: &AdjustmentInput) -> bool {
    match adjustment {
        AdjustmentInput::FixedMinor { minor } => minor == "0",
        AdjustmentInput::PercentBasisPoints { basis_points } => *basis_points == 0,
    }
}

fn adjustment_amount(
    base: i128,
    adjustment: &AdjustmentInput,
    cap_to_base: bool,
) -> Result<i128, AuthError> {
    let amount = match adjustment {
        AdjustmentInput::FixedMinor { minor } => parse_non_negative_minor(minor)?,
        AdjustmentInput::PercentBasisPoints { basis_points } => {
            divide_half_up(base * i128::from(*basis_points), 10_000)?
        }
    };
    if cap_to_base && amount > base {
        return Err(AuthError::InvalidInput);
    }
    Ok(amount)
}

fn divide_half_up(numerator: i128, denominator: i128) -> Result<i128, AuthError> {
    if numerator < 0 || denominator <= 0 {
        return Err(AuthError::InvalidInput);
    }
    numerator
        .checked_add(denominator / 2)
        .and_then(|value| value.checked_div(denominator))
        .ok_or(AuthError::InvalidInput)
}

fn as_i64(value: i128) -> Result<i64, AuthError> {
    i64::try_from(value).map_err(|_| AuthError::InvalidInput)
}

fn material_snapshot(
    transaction: &rusqlite::Transaction<'_>,
    line: &RequisitionLineInput,
) -> Result<String, AuthError> {
    if let Some(material_id) = line.material_id {
        let row = transaction
            .query_row(
                "SELECT name_zh, name_fr, model, specification FROM local_materials WHERE id = ?1 AND is_active = 1 AND deleted_at IS NULL",
                [material_id.to_string()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
            )
            .optional()
            .map_err(|_| AuthError::Database)?
            .ok_or(AuthError::InvalidInput)?;
        serde_json::to_string(&serde_json::json!({ "nameZh": row.0, "nameFr": row.1, "model": row.2, "specification": row.3 }))
            .map_err(|_| AuthError::Database)
    } else {
        serde_json::to_string(&line.material_snapshot).map_err(|_| AuthError::Database)
    }
}

fn supplier_snapshot(
    transaction: &rusqlite::Transaction<'_>,
    country_id: Uuid,
    line: &RequisitionLineInput,
) -> Result<Option<String>, AuthError> {
    let Some(supplier_id) = line.supplier_id else {
        return Ok(None);
    };
    let name = transaction
        .query_row(
            "SELECT name FROM local_suppliers WHERE id = ?1 AND country_id = ?2 AND is_active = 1 AND is_blacklisted = 0 AND deleted_at IS NULL",
            params![supplier_id.to_string(), country_id.to_string()],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| AuthError::Database)?
        .ok_or(AuthError::InvalidInput)?;
    serde_json::to_string(&serde_json::json!({ "id": supplier_id, "name": name }))
        .map(Some)
        .map_err(|_| AuthError::Database)
}

fn decode_material_image(value: &str) -> Result<Vec<u8>, AuthError> {
    if value.is_empty() || value.len() > MAX_MATERIAL_IMAGE_BYTES * 2 {
        return Err(AuthError::InvalidInput);
    }
    let decoded = BASE64.decode(value).map_err(|_| AuthError::InvalidInput)?;
    if decoded.is_empty() || decoded.len() > MAX_MATERIAL_IMAGE_BYTES {
        return Err(AuthError::InvalidInput);
    }
    Ok(decoded)
}

fn valid_required_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max
}

fn valid_optional_text(value: &Option<String>, max: usize) -> bool {
    value
        .as_ref()
        .is_none_or(|value| value.len() <= max && !value.trim().is_empty())
}

fn validate_reference(business_code: &str, name: &str, version: i64) -> Result<(), AuthError> {
    if business_code.is_empty()
        || business_code.len() > 64
        || !business_code
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '_' || value == '-')
        || name.trim().is_empty()
        || name.len() > 255
        || version < 1
    {
        return Err(AuthError::InvalidInput);
    }
    Ok(())
}

fn valid_business_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().all(|character| {
            character.is_ascii_alphanumeric() || character == b'_' || character == b'-'
        })
        && value
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
}

fn valid_currency(currency: &str) -> bool {
    matches!(currency, "XOF" | "XAF" | "CNY" | "USD" | "EUR" | "ETB")
}

fn valid_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if value.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let parts = value.split('-').collect::<Vec<_>>();
    let [year, month, day] = parts.as_slice() else {
        return false;
    };
    let Ok(year) = year.parse::<u16>() else {
        return false;
    };
    let Ok(month) = month.parse::<u8>() else {
        return false;
    };
    let Ok(day) = day.parse::<u8>() else {
        return false;
    };
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        _ => 0,
    };
    year >= 2000 && day >= 1 && day <= max_day
}

fn valid_decimal_rate(value: &str) -> bool {
    let mut parts = value.split('.');
    let Some(integer) = parts.next() else {
        return false;
    };
    let fraction = parts.next();
    parts.next().is_none()
        && !integer.is_empty()
        && integer.bytes().all(|value| value.is_ascii_digit())
        && fraction.is_none_or(|value| {
            !value.is_empty()
                && value.len() <= 8
                && value.bytes().all(|value| value.is_ascii_digit())
        })
}

fn valid_non_zero_decimal_rate(value: &str) -> bool {
    valid_decimal_rate(value)
        && value
            .bytes()
            .any(|value| value.is_ascii_digit() && value != b'0')
}

fn convert_minor_by_rate(
    source_minor: i64,
    source_currency: &str,
    primary_currency: &str,
    rate_decimal: &str,
) -> Result<i64, AuthError> {
    if source_minor < 0
        || !valid_currency(source_currency)
        || !valid_currency(primary_currency)
        || !valid_non_zero_decimal_rate(rate_decimal)
    {
        return Err(AuthError::InvalidInput);
    }
    let (rate_numerator, rate_denominator) = parse_decimal_ratio(rate_decimal)?;
    if source_currency == primary_currency && rate_numerator != rate_denominator {
        return Err(AuthError::InvalidInput);
    }
    let source_scale = 10_i128.pow(currency_minor_digits(source_currency)?);
    let primary_scale = 10_i128.pow(currency_minor_digits(primary_currency)?);
    let numerator = i128::from(source_minor)
        .checked_mul(rate_numerator)
        .and_then(|value| value.checked_mul(primary_scale))
        .ok_or(AuthError::InvalidInput)?;
    let denominator = source_scale
        .checked_mul(rate_denominator)
        .ok_or(AuthError::InvalidInput)?;
    as_i64(divide_half_up(numerator, denominator)?)
}

fn parse_decimal_ratio(value: &str) -> Result<(i128, i128), AuthError> {
    if !valid_non_zero_decimal_rate(value) {
        return Err(AuthError::InvalidInput);
    }
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    let scale = 10_i128.pow(fraction.len() as u32);
    let numerator = whole
        .parse::<i128>()
        .ok()
        .and_then(|whole| whole.checked_mul(scale))
        .and_then(|whole| whole.checked_add(fraction.parse::<i128>().unwrap_or(0)))
        .ok_or(AuthError::InvalidInput)?;
    Ok((numerator, scale))
}

fn currency_minor_digits(currency: &str) -> Result<u32, AuthError> {
    match currency {
        "XOF" | "XAF" => Ok(0),
        "CNY" | "USD" | "EUR" | "ETB" => Ok(2),
        _ => Err(AuthError::InvalidInput),
    }
}

fn assert_immutable_local_business_code(
    connection: &Connection,
    table: &str,
    id: Uuid,
    business_code: &str,
) -> Result<(), AuthError> {
    // `table` comes only from the closed match above; record values remain bound parameters.
    let query = format!("SELECT business_code FROM {table} WHERE id = ?1");
    let existing = connection
        .query_row(&query, [id.to_string()], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|_| AuthError::Database)?;
    if existing.is_some_and(|value| value != business_code) {
        return Err(AuthError::ImmutableBusinessCode);
    }
    Ok(())
}

fn hash_password(password: &str) -> Result<String, AuthError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| AuthError::PasswordHashing)
}

fn verify_password(hash: &str, password: &str) -> bool {
    PasswordHash::new(hash).ok().is_some_and(|parsed| {
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
}

fn register_failure(
    connection: &Connection,
    id: &str,
    failed_attempts: i64,
    now: SystemTime,
) -> Result<(), AuthError> {
    let next_attempts = failed_attempts + 1;
    let locked_until = (next_attempts >= MAX_FAILURES).then_some(unix_seconds(now + LOCK_WINDOW));
    connection
        .execute(
            "UPDATE local_accounts SET failed_attempts = ?1, locked_until = ?2 WHERE id = ?3",
            params![next_attempts, locked_until, id],
        )
        .map_err(|_| AuthError::Database)?;
    Ok(())
}

fn unix_seconds(value: SystemTime) -> i64 {
    value
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_test_profile_accounts_keep_distinct_roles_and_scope() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        assert_eq!(
            service.cache_named_test_profile_accounts("short", now),
            Err(AuthError::InvalidInput)
        );
        service
            .cache_named_test_profile_accounts("test-only-password", now)
            .unwrap();
        service
            .bootstrap_test_profile(
                "engineer-a-password",
                "engineer-b-password",
                "purchaser-password",
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        for (id, username, role) in named_test_profile_accounts() {
            let (saved_username, roles_json, scope_count): (String, String, i64) = connection.query_row(
                "SELECT username, roles_json, (SELECT COUNT(*) FROM local_authorization_snapshots WHERE account_id = ?1) FROM local_accounts WHERE id = ?1",
                [id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            ).unwrap();
            assert_eq!(saved_username, username);
            assert_eq!(
                serde_json::from_str::<Vec<Role>>(&roles_json).unwrap(),
                vec![role]
            );
            assert_eq!(scope_count, 1);
            let verifier = service.credential_vault.load_verifier(id).unwrap().unwrap();
            assert!(verify_password(&verifier, "test-only-password"));
            assert!(!verify_password(&verifier, "wrong-password"));
        }
    }

    fn account() -> CachedAccount {
        CachedAccount {
            id: Uuid::new_v4(),
            username: "engineer".into(),
            roles: vec![Role::Engineer],
            enabled: true,
            requires_password_change: false,
        }
    }
    fn answer(question: &str) -> u8 {
        question
            .split_whitespace()
            .filter_map(|value| value.parse::<u8>().ok())
            .sum()
    }

    fn grant_test_scope(
        service: &LocalAuthService,
        account_id: Uuid,
        project_id: Uuid,
        department_id: Uuid,
        team_id: Uuid,
        now: SystemTime,
    ) {
        service.connection.lock().unwrap().execute(
            "INSERT INTO local_authorization_snapshots (account_id, project_id, department_id, team_id, verified_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![account_id.to_string(), project_id.to_string(), department_id.to_string(), team_id.to_string(), unix_seconds(now), unix_seconds(now + AUTHORIZATION_CACHE_WINDOW)],
        ).unwrap();
    }

    fn grant_new_test_scope(
        service: &LocalAuthService,
        account_id: Uuid,
        country_id: Uuid,
        now: SystemTime,
    ) {
        let project_id = Uuid::new_v4();
        let department_id = Uuid::new_v4();
        let team_id = Uuid::new_v4();
        let connection = service.connection.lock().unwrap();
        connection.execute("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES (?1, ?2, 'fixture country', 'UTC', 1, 1)", params![country_id.to_string(), format!("C-{}", country_id.simple())]).unwrap();
        connection.execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, ?3, 'fixture project', 'fixture site', 'fixture department', 'XOF', 'zh_fr', 1, 1)", params![project_id.to_string(), country_id.to_string(), format!("P-{}", project_id.simple())]).unwrap();
        connection.execute("INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES (?1, ?2, 'fixture department', 1, 1)", params![department_id.to_string(), format!("D-{}", department_id.simple())]).unwrap();
        connection.execute("INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES (?1, ?2, ?3, 'fixture team', 1, 1)", params![team_id.to_string(), department_id.to_string(), format!("T-{}", team_id.simple())]).unwrap();
        drop(connection);
        grant_test_scope(service, account_id, project_id, department_id, team_id, now);
    }

    #[test]
    fn sync_endpoint_requires_clean_https_base_url() {
        assert_eq!(
            sync_endpoint_from("https://sync.example.test/root", "push")
                .unwrap()
                .as_str(),
            "https://sync.example.test/root/api/sync/push",
        );
        assert_eq!(
            sync_endpoint_from("http://sync.example.test", "push").unwrap_err(),
            AuthError::SyncTransport,
        );
        assert_eq!(
            sync_endpoint_from("https://user:secret@sync.example.test", "push").unwrap_err(),
            AuthError::SyncTransport,
        );
    }

    #[test]
    fn sync_views_serialize_completed_attachment_byte_totals() {
        let push = SyncPushView {
            accepted_count: 0,
            pending_count: 0,
            pending_attachment_count: 0,
            attachment_sync_failed: false,
            attachment_transfer_count: 1,
            attachment_transfer_bytes: 1_536,
        };
        let pull = SyncPullView {
            applied_count: 0,
            next_cursor: "1".into(),
            pending_attachment_count: 0,
            attachment_sync_failed: false,
            attachment_transfer_count: 1,
            attachment_transfer_bytes: 1_536,
        };
        for value in [
            serde_json::to_value(push).unwrap(),
            serde_json::to_value(pull).unwrap(),
        ] {
            assert_eq!(value["attachmentTransferCount"], 1);
            assert_eq!(value["attachmentTransferBytes"], 1_536);
        }
        let progress = serde_json::to_value(AttachmentTransferProgress {
            attachment_id: "attachment-1".into(),
            direction: "upload".into(),
            transferred_bytes: 1_024,
            total_bytes: 1_536,
            state: "transferring".into(),
        })
        .unwrap();
        assert_eq!(progress["attachmentId"], "attachment-1");
        assert_eq!(progress["transferredBytes"], 1_024);
        assert_eq!(progress["totalBytes"], 1_536);
    }

    #[test]
    fn authorization_context_requires_a_current_scoped_snapshot() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let account = account();
        service
            .cache_verified_account(account.clone(), "correct-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                &account.username,
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        assert_eq!(
            service.authorization_context(now),
            Err(AuthError::Forbidden)
        );

        let country_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let department_id = Uuid::new_v4();
        let team_id = Uuid::new_v4();
        let connection = service.connection.lock().unwrap();
        connection.execute("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES (?1, 'AUTH-CI', 'authorization country', 'Africa/Abidjan', 1, 1)", [country_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, 'AUTH-PROJECT', 'authorization project', 'authorized site', 'authorization department', 'XOF', 'zh_fr', 1, 1)", params![project_id.to_string(), country_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES (?1, 'AUTH-DEPT', 'authorization department', 1, 1)", [department_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES (?1, ?2, 'AUTH-TEAM', 'authorization team', 1, 1)", params![team_id.to_string(), department_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_authorization_snapshots (account_id, project_id, department_id, team_id, verified_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![account.id.to_string(), project_id.to_string(), department_id.to_string(), team_id.to_string(), unix_seconds(now), unix_seconds(now + Duration::from_secs(30 * 24 * 60 * 60))]).unwrap();
        drop(connection);

        let context = service.authorization_context(now).unwrap();
        assert_eq!(context.project_id, project_id);
        assert_eq!(context.country_id, country_id);
        assert_eq!(context.site, "authorized site");
        assert_eq!(context.department_id, department_id);
        assert_eq!(context.team_id, team_id);
        let second_project_id = Uuid::new_v4();
        service.connection.lock().unwrap().execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, 'AUTH-SECOND', 'second project', 'second site', 'authorization department', 'XOF', 'zh_fr', 1, 1)", params![second_project_id.to_string(), country_id.to_string()]).unwrap();
        grant_test_scope(
            &service,
            account.id,
            second_project_id,
            department_id,
            team_id,
            now,
        );
        assert_eq!(service.list_authorization_contexts(now).unwrap().len(), 2);
        service
            .select_authorization_context(
                AuthorizationContextSelectionInput {
                    project_id: second_project_id,
                    department_id,
                    team_id,
                },
                now,
            )
            .unwrap();
        assert_eq!(
            service.authorization_context(now).unwrap().project_id,
            second_project_id
        );
        assert_eq!(
            service.select_authorization_context(
                AuthorizationContextSelectionInput {
                    project_id: Uuid::new_v4(),
                    department_id,
                    team_id
                },
                now
            ),
            Err(AuthError::Forbidden)
        );
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE local_authorization_snapshots SET verified_at = ?1 - 1, expires_at = ?1 WHERE account_id = ?2",
                params![unix_seconds(now) - 1, account.id.to_string()],
            )
            .unwrap();
        assert!(service.list_authorization_contexts(now).unwrap().is_empty());
        assert_eq!(
            service.authorization_context(now),
            Err(AuthError::Forbidden)
        );
    }

    #[test]
    fn cloud_authorization_refresh_replaces_only_validated_account_scopes() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let account = account();
        service
            .cache_verified_account(account.clone(), "correct-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                &account.username,
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let scope = CloudAuthorizationScope {
            project_id: Uuid::new_v4(),
            department_id: Uuid::new_v4(),
            team_id: Uuid::new_v4(),
            country_id: Uuid::new_v4(),
            site: "remote site".into(),
            currency: "XOF".into(),
            language_pair: "zh_fr".into(),
        };
        service
            .replace_authorization_snapshots(std::slice::from_ref(&scope), now)
            .unwrap();
        let count = |service: &LocalAuthService| -> i64 {
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT COUNT(*) FROM local_authorization_snapshots WHERE account_id = ?1",
                    [account.id.to_string()],
                    |row| row.get(0),
                )
                .unwrap()
        };
        assert_eq!(count(&service), 1);
        assert_eq!(
            service.replace_authorization_snapshots(&[scope.clone(), scope.clone()], now),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(count(&service), 1);
        service.replace_authorization_snapshots(&[], now).unwrap();
        assert_eq!(count(&service), 0);
    }

    #[test]
    fn authorization_cache_migration_preserves_previous_snapshots() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .unwrap();
        for sql in [
            include_str!("../migrations/0001_local_auth.sql"),
            include_str!("../migrations/0002_master_data.sql"),
            include_str!("../migrations/0003_reference_master_data.sql"),
            include_str!("../migrations/0028_authorization_snapshots.sql"),
        ] {
            connection.execute_batch(sql).unwrap();
        }
        connection.execute_batch("INSERT INTO local_accounts (id, username, roles_json, enabled, requires_password_change, cached_verified_at) VALUES ('a', 'fixture', '[]', 1, 0, 0); INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES ('c', 'C', 'country', 'UTC', 1, 1); INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES ('p', 'c', 'P', 'project', 'site', 'department', 'XOF', 'zh_fr', 1, 1); INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES ('d', 'D', 'department', 1, 1); INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES ('t', 'd', 'T', 'team', 1, 1); INSERT INTO local_authorization_snapshots VALUES ('a', 'p', 'd', 't', 10, 20);").unwrap();
        connection
            .execute_batch(include_str!(
                "../migrations/0029_authorization_selection.sql"
            ))
            .unwrap();
        connection
            .execute_batch(include_str!(
                "../migrations/0030_authorization_remote_cache.sql"
            ))
            .unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT expires_at FROM local_authorization_snapshots WHERE account_id = 'a'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            20
        );
        connection.execute("INSERT INTO local_authorization_snapshots VALUES ('a', 'unprojected-cloud-project', 'unprojected-department', 'unprojected-team', 20, 30)", []).unwrap();
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
    }

    #[test]
    fn pull_continues_only_after_a_full_advancing_page() {
        let change = SyncPullChangeInput {
            cursor: "501".into(),
            entity_type: "material".into(),
            entity_id: Uuid::new_v4(),
            operation: "upsert".into(),
            version: 1,
            payload: serde_json::json!({}),
            changed_at: "2026-10-11T00:00:00Z".into(),
        };
        assert!(
            pull_page_has_more(
                "1",
                &SyncPullPageInput {
                    changes: vec![change.clone(); SYNC_PULL_PAGE_LIMIT],
                    next_cursor: "501".into(),
                },
            )
            .unwrap()
        );
        assert!(
            !pull_page_has_more(
                "501",
                &SyncPullPageInput {
                    changes: vec![change],
                    next_cursor: "502".into(),
                },
            )
            .unwrap()
        );
        assert_eq!(
            pull_page_has_more(
                "502",
                &SyncPullPageInput {
                    changes: vec![],
                    next_cursor: "503".into(),
                },
            )
            .unwrap_err(),
            AuthError::SyncTransport,
        );
    }

    #[test]
    fn pull_page_advances_cursor_atomically_and_preserves_local_conflicts() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let purchaser_id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id: purchaser_id,
                    username: "sync-purchaser".into(),
                    roles: vec![Role::Purchaser],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "sync-purchaser",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        grant_new_test_scope(&service, purchaser_id, Uuid::new_v4(), now);
        let entity_id = Uuid::new_v4();
        let supplier_id = Uuid::new_v4();
        let price_id = Uuid::new_v4();
        let remote_material = MaterialInput {
            id: entity_id,
            sku: Some("REMOTE-001".into()),
            category_id: None,
            name_zh: "remote fixture".into(),
            name_fr: None,
            aliases: vec![],
            brand: None,
            model: "fixture".into(),
            specification: "fixture".into(),
            unit: "pcs".into(),
            notes: None,
            is_active: true,
            version: 1,
        };
        let remote_supplier = SupplierInput {
            id: supplier_id,
            business_code: "REMOTE-SUP-001".into(),
            name: "remote supplier".into(),
            country_id: None,
            contact_name: None,
            address: None,
            city: None,
            country: None,
            phone: None,
            whatsapp: None,
            email: None,
            payment_terms: None,
            delivery_lead_time: None,
            is_preferred: false,
            is_blacklisted: false,
            is_active: true,
            version: 1,
        };
        let remote_price = MaterialPriceInput {
            id: price_id,
            material_id: entity_id,
            supplier_id,
            currency: "XOF".into(),
            unit_price_minor: "100".into(),
            unit: "pcs".into(),
            effective_at: "2026-10-11".into(),
            source_note: None,
            version: 1,
        };
        service
            .apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![
                        SyncPullChangeInput {
                            cursor: "1".into(),
                            entity_type: "material".into(),
                            entity_id,
                            operation: "upsert".into(),
                            version: 1,
                            payload: serde_json::to_value(&remote_material).unwrap(),
                            changed_at: "2026-10-11T00:00:00Z".into(),
                        },
                        SyncPullChangeInput {
                            cursor: "2".into(),
                            entity_type: "supplier".into(),
                            entity_id: supplier_id,
                            operation: "upsert".into(),
                            version: 1,
                            payload: serde_json::to_value(&remote_supplier).unwrap(),
                            changed_at: "2026-10-11T00:00:01Z".into(),
                        },
                        SyncPullChangeInput {
                            cursor: "3".into(),
                            entity_type: "material_price".into(),
                            entity_id: price_id,
                            operation: "upsert".into(),
                            version: 1,
                            payload: serde_json::to_value(&remote_price).unwrap(),
                            changed_at: "2026-10-11T00:00:02Z".into(),
                        },
                    ],
                    next_cursor: "3".into(),
                },
                now,
            )
            .unwrap();
        {
            let connection = service.connection.lock().unwrap();
            let cursor: String = connection
                .query_row("SELECT last_pull_cursor FROM local_sync_state", [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(cursor, "3");
            let remote_count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM local_sync_remote_entities",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(remote_count, 3);
            let local_name: String = connection
                .query_row(
                    "SELECT name_zh FROM local_materials WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(local_name, "remote fixture");
        }
        let catalog = service.search_catalog("remote fixture", None, now).unwrap();
        assert!(catalog[0].prices.is_empty());
        service
            .save_material(
                MaterialInput {
                    id: entity_id,
                    sku: None,
                    category_id: None,
                    name_zh: "local fixture".into(),
                    name_fr: None,
                    aliases: vec![],
                    brand: None,
                    model: "fixture".into(),
                    specification: "fixture".into(),
                    unit: "pcs".into(),
                    notes: None,
                    is_active: true,
                    version: 1,
                },
                now,
            )
            .unwrap();
        service
            .apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![SyncPullChangeInput {
                        cursor: "4".into(),
                        entity_type: "material".into(),
                        entity_id,
                        operation: "upsert".into(),
                        version: 2,
                        payload: serde_json::to_value(MaterialInput {
                            name_zh: "remote newer".into(),
                            version: 2,
                            ..remote_material
                        })
                        .unwrap(),
                        changed_at: "2026-10-11T00:01:00Z".into(),
                    }],
                    next_cursor: "4".into(),
                },
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let conflicts: i64 = connection
            .query_row("SELECT COUNT(*) FROM local_sync_conflicts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(conflicts, 1);
        let cursor: String = connection
            .query_row("SELECT last_pull_cursor FROM local_sync_state", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(cursor, "4");
        let local_name: String = connection
            .query_row(
                "SELECT name_zh FROM local_materials WHERE id = ?1",
                [entity_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(local_name, "local fixture");
        drop(connection);
        let administrator_id = Uuid::new_v4();
        service.lock().unwrap();
        service
            .cache_verified_account(
                CachedAccount {
                    id: administrator_id,
                    username: "sync-administrator".into(),
                    roles: vec![Role::Administrator],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "sync-administrator",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let conflict = service
            .list_sync_conflicts(now)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        service
            .resolve_sync_conflict(
                ResolveSyncConflictInput {
                    conflict_id: conflict.id,
                    resolution: "use_server".into(),
                    reason: "fixture choose server".into(),
                },
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let resolved_name: String = connection
            .query_row(
                "SELECT name_zh FROM local_materials WHERE id = ?1",
                [entity_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        let pending_material_events: i64 = connection.query_row("SELECT COUNT(*) FROM local_sync_outbox WHERE entity_type = 'material' AND acknowledged_at IS NULL AND superseded_at IS NULL", [], |row| row.get(0)).unwrap();
        assert_eq!(resolved_name, "remote newer");
        assert_eq!(pending_material_events, 0);
    }

    #[test]
    fn pulled_master_data_projects_to_local_reference_tables() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let purchaser_id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id: purchaser_id,
                    username: "master-sync".into(),
                    roles: vec![Role::Purchaser],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "master-sync",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let country_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let department_id = Uuid::new_v4();
        let team_id = Uuid::new_v4();
        let unit_id = Uuid::new_v4();
        let tax_id = Uuid::new_v4();
        let rate_id = Uuid::new_v4();
        let records = vec![
            (
                "country",
                country_id,
                serde_json::to_value(ReferenceMasterDataInput::Country {
                    id: country_id,
                    business_code: "SYNC-CI".into(),
                    name: "sync country".into(),
                    time_zone: "Africa/Abidjan".into(),
                    is_active: true,
                    version: 1,
                })
                .unwrap(),
            ),
            (
                "project",
                project_id,
                serde_json::to_value(ReferenceMasterDataInput::Project {
                    id: project_id,
                    country_id,
                    business_code: "SYNC-P".into(),
                    name: "sync project".into(),
                    site: "sync site".into(),
                    department_name: "sync department".into(),
                    default_currency: "XOF".into(),
                    default_language_pair: "zh_fr".into(),
                    is_active: true,
                    version: 1,
                })
                .unwrap(),
            ),
            (
                "department",
                department_id,
                serde_json::to_value(ReferenceMasterDataInput::Department {
                    id: department_id,
                    business_code: "SYNC-D".into(),
                    name: "sync department".into(),
                    is_active: true,
                    version: 1,
                })
                .unwrap(),
            ),
            (
                "team",
                team_id,
                serde_json::to_value(ReferenceMasterDataInput::Team {
                    id: team_id,
                    department_id,
                    business_code: "SYNC-T".into(),
                    name: "sync team".into(),
                    is_active: true,
                    version: 1,
                })
                .unwrap(),
            ),
            (
                "unit",
                unit_id,
                serde_json::to_value(ReferenceMasterDataInput::Unit {
                    id: unit_id,
                    business_code: "SYNC-U".into(),
                    name: "sync unit".into(),
                    is_active: true,
                    version: 1,
                })
                .unwrap(),
            ),
            (
                "tax_template",
                tax_id,
                serde_json::to_value(TaxTemplateInput {
                    id: tax_id,
                    business_code: "SYNC-TAX".into(),
                    name: "sync tax".into(),
                    country_id: Some(country_id),
                    rate_basis_points: 1800,
                    effective_at: "2026-10-11".into(),
                    is_active: true,
                    version: 1,
                })
                .unwrap(),
            ),
            (
                "exchange_rate",
                rate_id,
                serde_json::to_value(ExchangeRateInput {
                    id: rate_id,
                    from_currency: "EUR".into(),
                    to_currency: "XOF".into(),
                    rate_decimal: "655.957".into(),
                    effective_at: "2026-10-11".into(),
                    source: "public_daily".into(),
                    reason: None,
                    version: 1,
                })
                .unwrap(),
            ),
            (
                "project_defaults",
                project_id,
                serde_json::to_value(ProjectDefaultsInput {
                    project_id,
                    department_title: "sync department".into(),
                    company_address: "sync address".into(),
                    company_contact: Some("sync contact".into()),
                    default_currency: "XOF".into(),
                    default_language_pair: "zh_fr".into(),
                    default_tax_template_id: Some(tax_id),
                })
                .unwrap(),
            ),
        ];
        let changes = records
            .into_iter()
            .enumerate()
            .map(
                |(index, (entity_type, entity_id, payload))| SyncPullChangeInput {
                    cursor: (index + 1).to_string(),
                    entity_type: entity_type.into(),
                    entity_id,
                    operation: "upsert".into(),
                    version: 1,
                    payload,
                    changed_at: "2026-10-11T00:00:00Z".into(),
                },
            )
            .collect();
        service
            .apply_sync_pull_page(
                SyncPullPageInput {
                    changes,
                    next_cursor: "8".into(),
                },
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let (country_count, project_count, team_count, defaults_count, rate_count): (i64, i64, i64, i64, i64) = connection.query_row("SELECT (SELECT COUNT(*) FROM local_countries), (SELECT COUNT(*) FROM local_projects), (SELECT COUNT(*) FROM local_teams), (SELECT COUNT(*) FROM local_project_print_defaults), (SELECT COUNT(*) FROM local_exchange_rates)", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))).unwrap();
        assert_eq!(
            (
                country_count,
                project_count,
                team_count,
                defaults_count,
                rate_count
            ),
            (1, 1, 1, 1, 1)
        );
        drop(connection);
        service
            .apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![SyncPullChangeInput {
                        cursor: "9".into(),
                        entity_type: "exchange_rate".into(),
                        entity_id: rate_id,
                        operation: "soft_delete".into(),
                        version: 2,
                        payload: serde_json::json!({}),
                        changed_at: "2026-10-11T00:01:00Z".into(),
                    }],
                    next_cursor: "9".into(),
                },
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let deleted: Option<i64> = connection
            .query_row(
                "SELECT deleted_at FROM local_exchange_rates WHERE id = ?1",
                [rate_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert!(deleted.is_some());
        let order_id = Uuid::new_v4();
        connection.execute("INSERT INTO local_purchase_orders (id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, currency, primary_currency, language_pair, status, workflow_status, urgency, order_date, delivery_address, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, version, created_at, updated_at) VALUES (?1, 'SYNC-ORDER', ?2, ?3, 'sync site', ?4, ?5, ?6, 'XOF', 'XOF', 'zh_fr', 'pending_confirmation', 'pending_confirmation', 'normal', '2026-10-11', 'sync address', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0)", params![order_id.to_string(), country_id.to_string(), project_id.to_string(), department_id.to_string(), team_id.to_string(), purchaser_id.to_string()]).unwrap();
        drop(connection);
        grant_test_scope(
            &service,
            purchaser_id,
            project_id,
            department_id,
            team_id,
            now,
        );
        let comment_id = Uuid::new_v4();
        service.apply_sync_pull_page(SyncPullPageInput { changes: vec![SyncPullChangeInput { cursor: "10".into(), entity_type: "order_comment".into(), entity_id: comment_id, operation: "upsert".into(), version: 1, payload: serde_json::json!({ "orderId": order_id, "authorId": purchaser_id, "projectId": project_id, "body": "remote immutable comment", "createdAt": 10 }), changed_at: "2026-10-11T00:02:00Z".into() }], next_cursor: "10".into() }, now).unwrap();
        assert_eq!(
            service.list_order_comments(order_id, now).unwrap()[0].body,
            "remote immutable comment"
        );
    }

    #[test]
    fn pulled_purchase_order_waits_for_references_and_preserves_confirmed_snapshot() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let purchaser_id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id: purchaser_id,
                    username: "order-sync".into(),
                    roles: vec![Role::Purchaser],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "order-sync",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let country_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let department_id = Uuid::new_v4();
        let team_id = Uuid::new_v4();
        let order_id = Uuid::new_v4();
        let line_id = Uuid::new_v4();
        let mut order_payload: serde_json::Value = serde_json::from_str(&format!(
            r#"{{"parentOrderId":null,"displayNo":"REMOTE-ORDER-1","countryId":"{country_id}","projectId":"{project_id}","site":"remote site","departmentId":"{department_id}","teamId":"{team_id}","applicantId":"{purchaser_id}","supplierId":null,"supplierSnapshotJson":null,"currency":"XOF","primaryCurrency":"XOF","lockedExchangeRateDecimal":null,"languagePair":"zh_fr","status":"pending_confirmation","workflowStatus":"confirmed","urgency":"normal","urgencyReason":null,"orderDate":"2026-10-11","deliveryAddress":"remote address","expectedDeliveryDate":null,"notes":null,"subtotalMinor":"100","lineDiscountMinor":"0","orderDiscountMinor":"0","freightMinor":"0","taxRateBasisPoints":0,"taxMinor":"0","totalMinor":"100","confirmedBy":"{purchaser_id}","confirmedAt":1,"rejectionReason":null,"selfApproved":false,"supplierTermsCompletedAt":null,"lines":[{{"id":"{line_id}","materialId":null,"materialSnapshotJson":"{{\"nameZh\":\"remote item\"}}","supplierSnapshotJson":null,"currency":"XOF","quantity":"1","unit":"pcs","unitPriceMinor":"100","lineDiscountJson":"{{\"kind\":\"fixed_minor\",\"minor\":\"0\"}}","lineFreightJson":"{{\"kind\":\"fixed_minor\",\"minor\":\"0\"}}","freightIncluded":false,"lineTotalMinor":"100","sortOrder":0,"createdAt":1,"updatedAt":1}}]}}"#
        ))
        .unwrap();
        order_payload["procurementMode"] = serde_json::json!("honsen_self_purchase");
        service
            .apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![
                        SyncPullChangeInput {
                            cursor: "1".into(),
                            entity_type: "purchase_order".into(),
                            entity_id: order_id,
                            operation: "upsert".into(),
                            version: 1,
                            payload: order_payload.clone(),
                            changed_at: "2026-10-11T00:00:00Z".into(),
                        },
                        SyncPullChangeInput {
                            cursor: "2".into(),
                            entity_type: "country".into(),
                            entity_id: country_id,
                            operation: "upsert".into(),
                            version: 1,
                            payload: serde_json::to_value(ReferenceMasterDataInput::Country {
                                id: country_id,
                                business_code: "ORDER-C".into(),
                                name: "order country".into(),
                                time_zone: "UTC".into(),
                                is_active: true,
                                version: 1,
                            })
                            .unwrap(),
                            changed_at: "2026-10-11T00:00:01Z".into(),
                        },
                        SyncPullChangeInput {
                            cursor: "3".into(),
                            entity_type: "project".into(),
                            entity_id: project_id,
                            operation: "upsert".into(),
                            version: 1,
                            payload: serde_json::to_value(ReferenceMasterDataInput::Project {
                                id: project_id,
                                country_id,
                                business_code: "ORDER-P".into(),
                                name: "order project".into(),
                                site: "remote site".into(),
                                department_name: "order department".into(),
                                default_currency: "XOF".into(),
                                default_language_pair: "zh_fr".into(),
                                is_active: true,
                                version: 1,
                            })
                            .unwrap(),
                            changed_at: "2026-10-11T00:00:02Z".into(),
                        },
                        SyncPullChangeInput {
                            cursor: "4".into(),
                            entity_type: "department".into(),
                            entity_id: department_id,
                            operation: "upsert".into(),
                            version: 1,
                            payload: serde_json::to_value(ReferenceMasterDataInput::Department {
                                id: department_id,
                                business_code: "ORDER-D".into(),
                                name: "order department".into(),
                                is_active: true,
                                version: 1,
                            })
                            .unwrap(),
                            changed_at: "2026-10-11T00:00:03Z".into(),
                        },
                        SyncPullChangeInput {
                            cursor: "5".into(),
                            entity_type: "team".into(),
                            entity_id: team_id,
                            operation: "upsert".into(),
                            version: 1,
                            payload: serde_json::to_value(ReferenceMasterDataInput::Team {
                                id: team_id,
                                department_id,
                                business_code: "ORDER-T".into(),
                                name: "order team".into(),
                                is_active: true,
                                version: 1,
                            })
                            .unwrap(),
                            changed_at: "2026-10-11T00:00:04Z".into(),
                        },
                    ],
                    next_cursor: "5".into(),
                },
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let stored: (String, String, i64) = connection
            .query_row(
                "SELECT display_no, workflow_status, total_minor FROM local_purchase_orders WHERE id = ?1",
                [order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(stored, ("REMOTE-ORDER-1".into(), "confirmed".into(), 100));
        drop(connection);
        let mut changed_payload = order_payload;
        changed_payload["displayNo"] = serde_json::json!("REMOTE-ORDER-2");
        changed_payload["totalMinor"] = serde_json::json!("999");
        assert_eq!(
            service.apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![SyncPullChangeInput {
                        cursor: "6".into(),
                        entity_type: "purchase_order".into(),
                        entity_id: order_id,
                        operation: "upsert".into(),
                        version: 2,
                        payload: changed_payload,
                        changed_at: "2026-10-11T00:01:00Z".into(),
                    }],
                    next_cursor: "6".into(),
                },
                now,
            ),
            Err(AuthError::InvalidInput)
        );
        let connection = service.connection.lock().unwrap();
        let unchanged: (String, i64) = connection
            .query_row(
                "SELECT display_no, total_minor FROM local_purchase_orders WHERE id = ?1",
                [order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(unchanged, ("REMOTE-ORDER-1".into(), 100));
        let cursor: String = connection
            .query_row(
                "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cursor, "5");
        drop(connection);
        grant_test_scope(
            &service,
            purchaser_id,
            project_id,
            department_id,
            team_id,
            now,
        );
        let receipt_id = Uuid::new_v4();
        let receipt_item_id = Uuid::new_v4();
        service.apply_sync_pull_page(SyncPullPageInput {
            changes: vec![SyncPullChangeInput {
                cursor: "7".into(), entity_type: "receipt".into(), entity_id: receipt_id,
                operation: "upsert".into(), version: 1,
                payload: serde_json::json!({
                    "id": receipt_id, "orderId": order_id, "projectId": project_id,
                    "receivedAt": "2026-10-11", "receiverId": purchaser_id,
                    "overReceiptReason": null, "createdBy": purchaser_id, "createdAt": 10,
                    "completed": true, "items": [{"id": receipt_item_id, "orderItemId": line_id, "quantity": "1", "unit": "pcs"}],
                    "attachmentIds": [],
                }), changed_at: "2026-10-11T00:02:00Z".into(),
            }], next_cursor: "7".into(),
        }, now).unwrap();
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT quantity_decimal FROM local_receipt_items WHERE id = ?1",
                    [receipt_item_id.to_string()],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "1"
        );
        let changed_receipt = serde_json::json!({
            "id": receipt_id, "orderId": order_id, "projectId": project_id,
            "receivedAt": "2026-10-11", "receiverId": purchaser_id,
            "overReceiptReason": null, "createdBy": purchaser_id, "createdAt": 10,
            "completed": true, "items": [{
                "id": receipt_item_id, "orderItemId": line_id, "quantity": "2", "unit": "pcs"
            }], "attachmentIds": [],
        });
        assert_eq!(
            service.apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![SyncPullChangeInput {
                        cursor: "8".into(),
                        entity_type: "receipt".into(),
                        entity_id: receipt_id,
                        operation: "upsert".into(),
                        version: 2,
                        payload: changed_receipt,
                        changed_at: "2026-10-11T00:03:00Z".into(),
                    }],
                    next_cursor: "8".into(),
                },
                now
            ),
            Err(AuthError::InvalidInput)
        );
        let receipt_cursor: String = service
            .connection
            .lock()
            .unwrap()
            .query_row(
                "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(receipt_cursor, "7");
        let original_id = Uuid::new_v4();
        let reversal_id = Uuid::new_v4();
        let replacement_id = Uuid::new_v4();
        let expense = |id: Uuid,
                       status: &str,
                       corrects: Option<Uuid>,
                       reason: Option<&str>,
                       amount: &str| {
            serde_json::json!({
                "id": id, "orderId": order_id, "projectId": project_id, "receiptId": receipt_id,
                "counterpartyType": "market_casual", "supplierId": null, "payeeName": "remote market",
                "counterpartySnapshot": null, "currency": "XOF", "amountMinor": amount,
                "paymentDate": "2026-10-11", "paymentMethod": "cash", "paymentHandlerId": purchaser_id,
                "notes": null, "status": status, "correctsExpenditureId": corrects,
                "correctionReason": reason, "createdBy": purchaser_id, "createdAt": 10,
            })
        };
        let pulled = vec![
            (
                "8",
                original_id,
                expense(original_id, "recorded", None, None, "100"),
            ),
            (
                "9",
                reversal_id,
                expense(
                    reversal_id,
                    "reversed",
                    Some(original_id),
                    Some("wrong payee"),
                    "100",
                ),
            ),
            (
                "10",
                replacement_id,
                expense(
                    replacement_id,
                    "recorded",
                    Some(reversal_id),
                    Some("corrected"),
                    "120",
                ),
            ),
        ]
        .into_iter()
        .map(|(cursor, entity_id, payload)| SyncPullChangeInput {
            cursor: cursor.into(),
            entity_type: "procurement_expenditure".into(),
            entity_id,
            operation: "upsert".into(),
            version: 1,
            payload,
            changed_at: "2026-10-11T00:02:00Z".into(),
        })
        .collect::<Vec<_>>();
        let page = SyncPullPageInput {
            changes: pulled,
            next_cursor: "10".into(),
        };
        service.apply_sync_pull_page(page.clone(), now).unwrap();
        service.apply_sync_pull_page(page, now).unwrap();
        let expenses = service
            .list_procurement_expenditures(order_id, now)
            .unwrap();
        assert_eq!(expenses.len(), 3);
        assert!(
            expenses
                .iter()
                .any(|row| row.id == original_id && row.status == "recorded")
        );
        assert!(
            expenses.iter().any(
                |row| row.id == reversal_id && row.corrects_expenditure_id == Some(original_id)
            )
        );
        assert!(expenses.iter().any(
            |row| row.id == replacement_id && row.corrects_expenditure_id == Some(reversal_id)
        ));
        let mut divergent = expense(original_id, "recorded", None, None, "999");
        divergent["amountMinor"] = serde_json::json!("999");
        assert_eq!(
            service.apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![SyncPullChangeInput {
                        cursor: "11".into(),
                        entity_type: "procurement_expenditure".into(),
                        entity_id: original_id,
                        operation: "upsert".into(),
                        version: 2,
                        payload: divergent,
                        changed_at: "2026-10-11T00:03:00Z".into()
                    }],
                    next_cursor: "11".into(),
                },
                now
            ),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "10"
        );
        fs::create_dir_all(&service.media_directory).unwrap();
        let source_path = service.media_directory.join("selected-voucher.pdf");
        fs::write(&source_path, b"%PDF-1.4 test-only voucher").unwrap();
        let voucher = service
            .archive_expenditure_voucher(original_id, &source_path, now)
            .unwrap();
        assert_eq!(voucher.upload_state, "pending_upload");
        assert_eq!(voucher.byte_length, 26);
        fs::remove_file(&source_path).unwrap();
        let archived_path = service
            .media_directory
            .join("attachments")
            .join(voucher.id.to_string());
        assert_eq!(
            fs::read(&archived_path).unwrap(),
            b"%PDF-1.4 test-only voucher"
        );
        assert_eq!(
            service.list_expenditure_vouchers(original_id, now).unwrap(),
            vec![voucher]
        );
        let remote_voucher_id = Uuid::new_v4();
        let remote_voucher = serde_json::json!({
            "id": remote_voucher_id, "ownerType": "procurement_expenditure",
            "ownerId": original_id, "orderId": order_id, "projectId": project_id,
            "originalName": "other-device.pdf", "contentType": "application/pdf",
            "byteLength": 4, "checksum": "a".repeat(64),
            "uploaderId": purchaser_id, "createdAt": 123,
        });
        let attachment_page = SyncPullPageInput {
            changes: vec![SyncPullChangeInput {
                cursor: "11".into(),
                entity_type: "attachment".into(),
                entity_id: remote_voucher_id,
                operation: "upsert".into(),
                version: 1,
                payload: remote_voucher.clone(),
                changed_at: "2026-10-11T00:03:00Z".into(),
            }],
            next_cursor: "11".into(),
        };
        service
            .apply_sync_pull_page(attachment_page.clone(), now)
            .unwrap();
        service.apply_sync_pull_page(attachment_page, now).unwrap();
        assert_eq!(
            service
                .list_expenditure_vouchers(original_id, now)
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT upload_state FROM local_attachments WHERE id = ?1",
                    [remote_voucher_id.to_string()],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "pending_download"
        );
        let mut divergent_voucher = remote_voucher;
        divergent_voucher["checksum"] = serde_json::json!("b".repeat(64));
        let divergent_voucher_page = SyncPullPageInput {
            changes: vec![SyncPullChangeInput {
                cursor: "12".into(),
                entity_type: "attachment".into(),
                entity_id: remote_voucher_id,
                operation: "upsert".into(),
                version: 2,
                payload: divergent_voucher,
                changed_at: "2026-10-11T00:04:00Z".into(),
            }],
            next_cursor: "12".into(),
        };
        assert_eq!(
            service.apply_sync_pull_page(divergent_voucher_page.clone(), now),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "11"
        );
        let administrator_id = Uuid::new_v4();
        service.lock().unwrap();
        service
            .cache_verified_account(
                CachedAccount {
                    id: administrator_id,
                    username: "attachment-conflict-administrator".into(),
                    roles: vec![Role::Administrator],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "attachment-conflict-administrator",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let conflict = service
            .list_sync_conflicts(now)
            .unwrap()
            .into_iter()
            .find(|conflict| conflict.entity_type == "attachment")
            .unwrap();
        assert_eq!(conflict.entity_id, remote_voucher_id);
        assert_eq!(conflict.server_version, 2);
        assert_eq!(
            service.resolve_sync_conflict(
                ResolveSyncConflictInput {
                    conflict_id: conflict.id,
                    resolution: "keep_local".into(),
                    reason: "the archived checksum is the retained audit record".into(),
                },
                now,
            ),
            Ok(())
        );
        assert!(service.list_sync_conflicts(now).unwrap().is_empty());
        service
            .apply_sync_pull_page(divergent_voucher_page, now)
            .unwrap();
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "12"
        );
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT checksum FROM local_attachments WHERE id = ?1",
                    [remote_voucher_id.to_string()],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "a".repeat(64)
        );
        let newer_remote_voucher = serde_json::json!({
            "id": remote_voucher_id, "ownerType": "procurement_expenditure",
            "ownerId": original_id, "orderId": order_id, "projectId": project_id,
            "originalName": "other-device.pdf", "contentType": "application/pdf",
            "byteLength": 4, "checksum": "c".repeat(64),
            "uploaderId": purchaser_id, "createdAt": 123,
        });
        let newer_remote_voucher_page = SyncPullPageInput {
            changes: vec![SyncPullChangeInput {
                cursor: "13".into(),
                entity_type: "attachment".into(),
                entity_id: remote_voucher_id,
                operation: "upsert".into(),
                version: 3,
                payload: newer_remote_voucher.clone(),
                changed_at: "2026-10-11T00:05:00Z".into(),
            }],
            next_cursor: "13".into(),
        };
        assert_eq!(
            service.apply_sync_pull_page(newer_remote_voucher_page.clone(), now),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "12"
        );
        let newer_conflict = service
            .list_sync_conflicts(now)
            .unwrap()
            .into_iter()
            .find(|conflict| conflict.entity_type == "attachment" && conflict.server_version == 3)
            .unwrap();
        assert_eq!(newer_conflict.entity_id, remote_voucher_id);
        assert_eq!(
            service.resolve_sync_conflict(
                ResolveSyncConflictInput {
                    conflict_id: newer_conflict.id,
                    resolution: "keep_local".into(),
                    reason: "each newer remote checksum must retain an independent audit decision"
                        .into(),
                },
                now,
            ),
            Ok(())
        );
        service
            .apply_sync_pull_page(newer_remote_voucher_page, now)
            .unwrap();
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "13"
        );
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT checksum FROM local_attachments WHERE id = ?1",
                    [remote_voucher_id.to_string()],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "a".repeat(64)
        );
        service.lock().unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "order-sync",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let receipt_source = service.media_directory.join("receipt-photo.jpg");
        image::RgbImage::from_pixel(3_000, 2_400, image::Rgb([32, 64, 128]))
            .save_with_format(&receipt_source, ImageFormat::Jpeg)
            .unwrap();
        let local_photo = service
            .archive_receipt_attachment(receipt_id, &receipt_source, now)
            .unwrap();
        fs::remove_file(&receipt_source).unwrap();
        assert_eq!(local_photo.upload_state, "pending_upload");
        let archived_photo_path = service
            .media_directory
            .join("attachments")
            .join(local_photo.id.to_string());
        let archived_photo_bytes = fs::read(&archived_photo_path).unwrap();
        assert_eq!(local_photo.byte_length, archived_photo_bytes.len() as i64);
        assert_eq!(
            local_photo.checksum,
            format!("{:x}", Sha256::digest(&archived_photo_bytes))
        );
        let decoded_archived_photo = ImageReader::new(Cursor::new(&archived_photo_bytes))
            .with_guessed_format()
            .unwrap()
            .decode()
            .unwrap();
        assert!(decoded_archived_photo.width() <= RECEIPT_PHOTO_MAX_DIMENSION);
        assert!(decoded_archived_photo.height() <= RECEIPT_PHOTO_MAX_DIMENSION);
        assert_eq!(
            service.list_receipt_attachments(receipt_id, now).unwrap(),
            vec![local_photo.clone()]
        );
        let remote_photo_id = Uuid::new_v4();
        let remote_photo_bytes = archived_photo_bytes.clone();
        let remote_photo_checksum = format!("{:x}", Sha256::digest(&remote_photo_bytes));
        let remote_photo = serde_json::json!({
            "id": remote_photo_id, "ownerType": "receipt", "ownerId": receipt_id,
            "orderId": order_id, "projectId": project_id, "originalName": "remote-photo.jpg",
            "contentType": "image/jpeg", "byteLength": remote_photo_bytes.len(), "checksum": remote_photo_checksum.clone(),
            "uploaderId": purchaser_id, "createdAt": 124,
        });
        let remote_photo_page = SyncPullPageInput {
            changes: vec![SyncPullChangeInput {
                cursor: "12".into(),
                entity_type: "attachment".into(),
                entity_id: remote_photo_id,
                operation: "upsert".into(),
                version: 1,
                payload: remote_photo.clone(),
                changed_at: "2026-10-11T00:04:00Z".into(),
            }],
            next_cursor: "12".into(),
        };
        service
            .apply_sync_pull_page(remote_photo_page.clone(), now)
            .unwrap();
        service
            .apply_sync_pull_page(remote_photo_page, now)
            .unwrap();
        service
            .persist_downloaded_attachment_bytes(
                &remote_photo_id.to_string(),
                remote_photo_bytes.len() as i64,
                &remote_photo_checksum,
                &remote_photo_bytes,
            )
            .unwrap();
        service
            .persist_downloaded_attachment_bytes(
                &remote_photo_id.to_string(),
                remote_photo_bytes.len() as i64,
                &remote_photo_checksum,
                &remote_photo_bytes,
            )
            .unwrap();
        assert_eq!(
            fs::read(
                service
                    .media_directory
                    .join("attachments")
                    .join(remote_photo_id.to_string()),
            )
            .unwrap(),
            remote_photo_bytes
        );
        assert_eq!(
            service
                .list_receipt_attachments(receipt_id, now)
                .unwrap()
                .into_iter()
                .find(|attachment| attachment.id == remote_photo_id)
                .unwrap()
                .upload_state,
            "uploaded"
        );
        assert_eq!(
            service
                .list_receipt_attachments(receipt_id, now)
                .unwrap()
                .len(),
            2
        );
        let mut divergent_photo = remote_photo;
        divergent_photo["checksum"] = serde_json::json!("b".repeat(64));
        assert_eq!(
            service.apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![SyncPullChangeInput {
                        cursor: "13".into(),
                        entity_type: "attachment".into(),
                        entity_id: remote_photo_id,
                        operation: "upsert".into(),
                        version: 2,
                        payload: divergent_photo,
                        changed_at: "2026-10-11T00:05:00Z".into(),
                    }],
                    next_cursor: "13".into(),
                },
                now
            ),
            Err(AuthError::InvalidInput)
        );
        let connection = service.connection.lock().unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT last_pull_cursor FROM local_sync_state WHERE singleton = 1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "12"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT checksum FROM local_attachments WHERE id = ?1",
                    [remote_photo_id.to_string()],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            remote_photo_checksum
        );
        drop(connection);
        let invalid_path = service.media_directory.join("not-a-voucher.txt");
        fs::write(&invalid_path, b"invalid").unwrap();
        assert_eq!(
            service.archive_expenditure_voucher(original_id, &invalid_path, now),
            Err(AuthError::InvalidInput)
        );
        fs::remove_file(&invalid_path).unwrap();
        let invalid_receipt_photo = service.media_directory.join("corrupt-photo.jpg");
        fs::write(&invalid_receipt_photo, b"not a jpeg").unwrap();
        let attachment_count: i64 = service.connection.lock().unwrap().query_row(
            "SELECT COUNT(*) FROM local_attachments WHERE owner_type = 'receipt' AND owner_id = ?1",
            [receipt_id.to_string()], |row| row.get(0),
        ).unwrap();
        assert_eq!(
            service.archive_receipt_attachment(receipt_id, &invalid_receipt_photo, now),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(service.connection.lock().unwrap().query_row(
            "SELECT COUNT(*) FROM local_attachments WHERE owner_type = 'receipt' AND owner_id = ?1",
            [receipt_id.to_string()], |row| row.get::<_, i64>(0),
        ).unwrap(), attachment_count);
        fs::remove_file(&invalid_receipt_photo).unwrap();
        service.connection.lock().unwrap().execute(
            "DELETE FROM local_authorization_snapshots WHERE account_id = ?1 AND project_id = ?2",
            params![purchaser_id.to_string(), project_id.to_string()],
        ).unwrap();
        assert!(matches!(
            service.list_procurement_expenditures(order_id, now),
            Err(AuthError::Forbidden)
        ));
        assert!(matches!(
            service.list_expenditure_vouchers(original_id, now),
            Err(AuthError::Forbidden)
        ));
        assert!(matches!(
            service.archive_expenditure_voucher(original_id, &source_path, now),
            Err(AuthError::Forbidden)
        ));
        assert!(matches!(
            service.list_receipt_attachments(receipt_id, now),
            Err(AuthError::Forbidden)
        ));
        assert!(matches!(
            service.archive_receipt_attachment(receipt_id, &source_path, now),
            Err(AuthError::Forbidden)
        ));
        fs::remove_file(&archived_path).unwrap();
        fs::remove_file(
            service
                .media_directory
                .join("attachments")
                .join(local_photo.id.to_string()),
        )
        .unwrap();
        fs::remove_file(
            service
                .media_directory
                .join("attachments")
                .join(remote_photo_id.to_string()),
        )
        .unwrap();
        fs::remove_dir(service.media_directory.join("attachments")).unwrap();
        fs::remove_dir(&service.media_directory).unwrap();
    }

    #[test]
    fn locked_exchange_rate_converts_minor_units_without_floating_point() {
        assert_eq!(
            convert_minor_by_rate(1_234, "CNY", "XOF", "76.5").unwrap(),
            944
        );
        assert_eq!(
            convert_minor_by_rate(1_000, "XOF", "CNY", "0.015").unwrap(),
            1_500
        );
        assert_eq!(convert_minor_by_rate(1, "USD", "XOF", "2.5").unwrap(), 0);
        assert_eq!(
            convert_minor_by_rate(100, "XOF", "XOF", "1.01"),
            Err(AuthError::InvalidInput)
        );
    }

    #[test]
    fn owner_pricing_requires_a_catalog_or_audited_manual_quote_and_freezes_the_result() {
        let database_path =
            std::env::temp_dir().join(format!("honsen-opa2-{}.sqlite", Uuid::new_v4()));
        let service =
            LocalAuthService::open_file_for_test(database_path.to_str().unwrap()).unwrap();
        let now = SystemTime::now();
        let purchaser_id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id: purchaser_id,
                    username: "owner-pricing".into(),
                    roles: vec![Role::Purchaser],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "owner-pricing",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let (
            country_id,
            project_id,
            department_id,
            team_id,
            material_id,
            supplier_id,
            price_id,
            order_id,
            catalog_item_id,
            manual_item_id,
        ) = (
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
        );
        let connection = service.connection.lock().unwrap();
        connection.execute("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES (?1, 'OP-C', 'owner pricing', 'UTC', 1, 1)", [country_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, 'OP-P', 'owner pricing', 'site', 'department', 'XOF', 'zh_fr', 1, 1)", params![project_id.to_string(), country_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES (?1, 'OP-D', 'department', 1, 1)", [department_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES (?1, ?2, 'OP-T', 'team', 1, 1)", params![team_id.to_string(), department_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_authorization_snapshots (account_id, project_id, department_id, team_id, verified_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)", params![purchaser_id.to_string(), project_id.to_string(), department_id.to_string(), team_id.to_string(), unix_seconds(now), unix_seconds(now + AUTHORIZATION_CACHE_WINDOW)]).unwrap();
        connection.execute("INSERT INTO local_materials (id, name_zh, model, specification, unit, is_active, version) VALUES (?1, 'owner material', 'OP', 'fixture', 'pcs', 1, 1)", [material_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_suppliers (id, business_code, name, country_id, is_active, is_blacklisted, is_preferred, version) VALUES (?1, 'OP-S', 'fixture', ?2, 1, 0, 0, 1)", params![supplier_id.to_string(), country_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_material_prices (id, material_id, supplier_id, currency, unit_price_minor, unit, effective_at, is_active, version) VALUES (?1, ?2, ?3, 'CNY', 1234, 'pcs', '2026-10-12', 1, 1)", params![price_id.to_string(), material_id.to_string(), supplier_id.to_string()]).unwrap();
        connection.execute("INSERT INTO local_exchange_rates (id, from_currency, to_currency, rate_decimal, effective_at, source, version) VALUES (?1, 'CNY', 'XOF', '76.5', '2026-10-12', 'public_daily', 1)", [Uuid::new_v4().to_string()]).unwrap();
        connection.execute("INSERT INTO local_purchase_orders (id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, currency, primary_currency, language_pair, status, workflow_status, urgency, order_date, delivery_address, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, version, created_at, updated_at) VALUES (?1, 'OP-1', ?2, ?3, 'site', ?4, ?5, ?6, 'XOF', 'XOF', 'zh_fr', 'pending_confirmation', 'confirmed', 'normal', '2026-10-12', 'address', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0)", params![order_id.to_string(), country_id.to_string(), project_id.to_string(), department_id.to_string(), team_id.to_string(), purchaser_id.to_string()]).unwrap();
        for (item_id, currency) in [(catalog_item_id, "CNY"), (manual_item_id, "XOF")] {
            connection.execute("INSERT INTO local_purchase_order_items (id, order_id, material_id, material_snapshot_json, currency, quantity_decimal, unit, unit_price_minor, line_total_minor, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, '{\"nameZh\":\"owner material\"}', ?4, '1', 'pcs', 0, 0, ?5, 0, 0)", params![item_id.to_string(), order_id.to_string(), material_id.to_string(), currency, if item_id == catalog_item_id { 0 } else { 1 }]).unwrap();
        }
        let legacy_mode: Option<String> = connection
            .query_row(
                "SELECT procurement_mode FROM local_purchase_orders WHERE id = ?1",
                [order_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(legacy_mode, None);
        drop(connection);
        let result = service
            .save_owner_purchase_pricing(
                OwnerPurchasePricingInput {
                    order_id,
                    lines: vec![
                        OwnerLinePricingInput {
                            order_item_id: catalog_item_id,
                            quote_source: OwnerQuoteSourceInput::CatalogPrice {
                                material_price_id: price_id,
                            },
                            locked_exchange_rate_decimal: "76.5".into(),
                            markup: AdjustmentInput::PercentBasisPoints { basis_points: 1000 },
                        },
                        OwnerLinePricingInput {
                            order_item_id: manual_item_id,
                            quote_source: OwnerQuoteSourceInput::ManualReference {
                                unit_price_minor: "100".into(),
                                reason: "catalogue unavailable".into(),
                            },
                            locked_exchange_rate_decimal: "1".into(),
                            markup: AdjustmentInput::FixedMinor { minor: "5".into() },
                        },
                    ],
                    revision_reason: None,
                },
                now,
            )
            .unwrap();
        assert_eq!(result[0].final_unit_price_minor, "1038");
        assert_eq!(result[1].final_unit_price_minor, "105");
        let connection = service.connection.lock().unwrap();
        let stored: (String, Option<String>, Option<String>, Option<String>, i64) = connection.query_row("SELECT o.procurement_mode, i.owner_quote_source, i.owner_manual_reference_reason, i.owner_manual_reference_actor_id, i.owner_final_unit_price_minor FROM local_purchase_orders o JOIN local_purchase_order_items i ON i.order_id = o.id WHERE i.id = ?1", [manual_item_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))).unwrap();
        assert_eq!(stored.0, "owner_self_purchase");
        assert_eq!(stored.1.as_deref(), Some("manual_reference"));
        assert_eq!(stored.2.as_deref(), Some("catalogue unavailable"));
        assert_eq!(stored.3.as_deref(), Some(purchaser_id.to_string().as_str()));
        assert_eq!(stored.4, 105);
        drop(connection);
        let outbox_before_revocation: i64 = service
            .connection
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM local_sync_outbox WHERE entity_id = ?1",
                [order_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        service.connection.lock().unwrap().execute(
            "DELETE FROM local_authorization_snapshots WHERE account_id = ?1 AND project_id = ?2",
            params![purchaser_id.to_string(), project_id.to_string()],
        ).unwrap();
        assert_eq!(
            service.add_order_comment(order_id, "unauthorized".into(), now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service
                .connection
                .lock()
                .unwrap()
                .query_row(
                    "SELECT COUNT(*) FROM local_sync_outbox WHERE entity_id = ?1",
                    [order_id.to_string()],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            outbox_before_revocation
        );
        grant_test_scope(
            &service,
            purchaser_id,
            project_id,
            department_id,
            team_id,
            now,
        );
        assert_eq!(
            service.set_procurement_mode(order_id, "honsen_self_purchase".into(), now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.save_owner_purchase_pricing(
                OwnerPurchasePricingInput {
                    order_id,
                    lines: vec![
                        OwnerLinePricingInput {
                            order_item_id: catalog_item_id,
                            quote_source: OwnerQuoteSourceInput::CatalogPrice {
                                material_price_id: price_id
                            },
                            locked_exchange_rate_decimal: "99".into(),
                            markup: AdjustmentInput::FixedMinor { minor: "0".into() }
                        },
                        OwnerLinePricingInput {
                            order_item_id: manual_item_id,
                            quote_source: OwnerQuoteSourceInput::ManualReference {
                                unit_price_minor: "1".into(),
                                reason: "again".into()
                            },
                            locked_exchange_rate_decimal: "1".into(),
                            markup: AdjustmentInput::FixedMinor { minor: "0".into() }
                        }
                    ],
                    revision_reason: Some("correct rate".into()),
                },
                now
            ),
            Err(AuthError::InvalidInput)
        );
        let engineer_id = Uuid::new_v4();
        let draft_order_id = Uuid::new_v4();
        let draft_item_id = Uuid::new_v4();
        service.lock().unwrap();
        service
            .cache_verified_account(
                CachedAccount {
                    id: engineer_id,
                    username: "owner-engineer".into(),
                    roles: vec![Role::Engineer],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "owner-engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        grant_test_scope(
            &service,
            engineer_id,
            project_id,
            department_id,
            team_id,
            now,
        );
        service
            .save_requisition_draft(
                RequisitionDraftInput {
                    id: draft_order_id,
                    display_no: "OPA-DRAFT".into(),
                    country_id,
                    project_id,
                    site: "site".into(),
                    department_id,
                    team_id,
                    applicant_id: engineer_id,
                    currency: "XOF".into(),
                    primary_currency: "XOF".into(),
                    language_pair: "zh_fr".into(),
                    urgency: "normal".into(),
                    urgency_reason: None,
                    order_date: "2026-10-12".into(),
                    delivery_address: "address".into(),
                    expected_delivery_date: None,
                    notes: None,
                    order_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
                    order_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
                    tax_rate_basis_points: 0,
                    lines: vec![RequisitionLineInput {
                        id: draft_item_id,
                        material_id: Some(material_id),
                        material_snapshot: MaterialSnapshotInput {
                            name_zh: "owner material".into(),
                            name_fr: None,
                            model: "OP".into(),
                            specification: "fixture".into(),
                        },
                        supplier_id: None,
                        currency: "CNY".into(),
                        quantity: "1".into(),
                        unit: "pcs".into(),
                        unit_price_minor: "0".into(),
                        line_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
                        line_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
                        freight_included: false,
                        sort_order: 0,
                    }],
                },
                now,
            )
            .unwrap();
        service
            .set_procurement_mode(draft_order_id, "owner_self_purchase".into(), now)
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let before_failed_pricing: (i64, i64) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM local_order_audit_entries WHERE order_id = ?1), (SELECT COUNT(*) FROM local_sync_outbox WHERE entity_id = ?1)",
                [draft_order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        drop(connection);
        assert_eq!(
            service.submit_requisition_draft(draft_order_id, now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.save_owner_purchase_pricing(
                OwnerPurchasePricingInput {
                    order_id: draft_order_id,
                    lines: vec![OwnerLinePricingInput {
                        order_item_id: draft_item_id,
                        quote_source: OwnerQuoteSourceInput::CatalogPrice {
                            material_price_id: price_id,
                        },
                        locked_exchange_rate_decimal: "99".into(),
                        markup: AdjustmentInput::FixedMinor { minor: "5".into() },
                    }],
                    revision_reason: None,
                },
                now,
            ),
            Err(AuthError::InvalidInput)
        );
        let connection = service.connection.lock().unwrap();
        let after_failed_pricing: (i64, i64, Option<String>) = connection
            .query_row(
                "SELECT (SELECT COUNT(*) FROM local_order_audit_entries WHERE order_id = ?1), (SELECT COUNT(*) FROM local_sync_outbox WHERE entity_id = ?1), (SELECT owner_quote_source FROM local_purchase_order_items WHERE id = ?2)",
                params![draft_order_id.to_string(), draft_item_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(after_failed_pricing.0, before_failed_pricing.0);
        assert_eq!(after_failed_pricing.1, before_failed_pricing.1);
        assert_eq!(after_failed_pricing.2, None);
        drop(connection);
        let preview = service
            .save_owner_purchase_pricing(
                OwnerPurchasePricingInput {
                    order_id: draft_order_id,
                    lines: vec![OwnerLinePricingInput {
                        order_item_id: draft_item_id,
                        quote_source: OwnerQuoteSourceInput::CatalogPrice {
                            material_price_id: price_id,
                        },
                        locked_exchange_rate_decimal: "76.5".into(),
                        markup: AdjustmentInput::FixedMinor { minor: "5".into() },
                    }],
                    revision_reason: None,
                },
                now,
            )
            .unwrap();
        assert_eq!(preview[0].final_unit_price_minor, "949");
        service
            .submit_requisition_draft(draft_order_id, now)
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let draft_status: String = connection
            .query_row(
                "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1",
                [draft_order_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(draft_status, "pending_confirmation");
        drop(connection);
        assert!(
            service
                .list_order_audits(draft_order_id, now)
                .unwrap()
                .iter()
                .any(|audit| audit.action == "submitted")
        );
        service.withdraw_requisition(draft_order_id, now).unwrap();
        assert!(
            service
                .list_order_audits(draft_order_id, now)
                .unwrap()
                .iter()
                .any(|audit| audit.action == "withdrawn")
        );
        assert_eq!(
            service.withdraw_requisition(draft_order_id, now),
            Err(AuthError::Forbidden)
        );
        service
            .submit_requisition_draft(draft_order_id, now)
            .unwrap();
        service.lock().unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "owner-pricing",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let purchaser_audits = service.list_order_audits(draft_order_id, now).unwrap();
        let initial_pricing_audit = purchaser_audits
            .iter()
            .find(|audit| audit.action == "owner_pricing_saved")
            .unwrap();
        assert_eq!(initial_pricing_audit.actor_id, engineer_id);
        assert!(
            initial_pricing_audit
                .next_json
                .as_deref()
                .unwrap()
                .contains("ownerConvertedReferenceUnitMinor")
        );
        assert!(
            initial_pricing_audit
                .next_json
                .as_deref()
                .unwrap()
                .contains("\"name\":\"fixture\"")
        );
        service
            .reject_requisition(draft_order_id, "rate needs revision".into(), now)
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let rejected: (String, String) = connection
            .query_row(
                "SELECT workflow_status, rejection_reason FROM local_purchase_orders WHERE id = ?1",
                [draft_order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(rejected, ("rejected".into(), "rate needs revision".into()));
        drop(connection);
        service.lock().unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "owner-engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        service
            .save_requisition_draft(
                RequisitionDraftInput {
                    id: draft_order_id,
                    display_no: "OPA-DRAFT".into(),
                    country_id,
                    project_id,
                    site: "site".into(),
                    department_id,
                    team_id,
                    applicant_id: engineer_id,
                    currency: "XOF".into(),
                    primary_currency: "XOF".into(),
                    language_pair: "zh_fr".into(),
                    urgency: "normal".into(),
                    urgency_reason: None,
                    order_date: "2026-10-12".into(),
                    delivery_address: "address".into(),
                    expected_delivery_date: None,
                    notes: None,
                    order_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
                    order_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
                    tax_rate_basis_points: 0,
                    lines: vec![RequisitionLineInput {
                        id: draft_item_id,
                        material_id: Some(material_id),
                        material_snapshot: MaterialSnapshotInput {
                            name_zh: "owner material".into(),
                            name_fr: None,
                            model: "OP".into(),
                            specification: "fixture".into(),
                        },
                        supplier_id: None,
                        currency: "CNY".into(),
                        quantity: "1".into(),
                        unit: "pcs".into(),
                        unit_price_minor: "0".into(),
                        line_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
                        line_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
                        freight_included: false,
                        sort_order: 0,
                    }],
                },
                now,
            )
            .unwrap();
        assert_eq!(
            service.save_owner_purchase_pricing(
                OwnerPurchasePricingInput {
                    order_id: draft_order_id,
                    lines: vec![OwnerLinePricingInput {
                        order_item_id: draft_item_id,
                        quote_source: OwnerQuoteSourceInput::CatalogPrice {
                            material_price_id: price_id,
                        },
                        locked_exchange_rate_decimal: "76.5".into(),
                        markup: AdjustmentInput::FixedMinor { minor: "10".into() },
                    }],
                    revision_reason: None,
                },
                now,
            ),
            Err(AuthError::InvalidInput)
        );
        let revised = service
            .save_owner_purchase_pricing(
                OwnerPurchasePricingInput {
                    order_id: draft_order_id,
                    lines: vec![OwnerLinePricingInput {
                        order_item_id: draft_item_id,
                        quote_source: OwnerQuoteSourceInput::CatalogPrice {
                            material_price_id: price_id,
                        },
                        locked_exchange_rate_decimal: "76.5".into(),
                        markup: AdjustmentInput::FixedMinor { minor: "10".into() },
                    }],
                    revision_reason: Some("updated markup after rejection".into()),
                },
                now,
            )
            .unwrap();
        assert_eq!(revised[0].final_unit_price_minor, "954");
        service
            .submit_requisition_draft(draft_order_id, now)
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let resubmitted: (String, i64, i64, i64) = connection
            .query_row(
                "SELECT workflow_status, (SELECT COUNT(*) FROM local_purchase_orders WHERE id = ?1), (SELECT COUNT(*) FROM local_purchase_order_items WHERE order_id = ?1 AND owner_final_unit_price_minor = 954), (SELECT COUNT(*) FROM local_sync_outbox WHERE entity_id = ?1) FROM local_purchase_orders WHERE id = ?1",
                [draft_order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(resubmitted.0, "pending_confirmation");
        assert_eq!(resubmitted.1, 1);
        assert_eq!(resubmitted.2, 1);
        assert_eq!(resubmitted.3, 10);
        drop(connection);
        let applicant_audits = service.list_order_audits(draft_order_id, now).unwrap();
        assert!(applicant_audits.iter().any(|audit| {
            audit.action == "rejected"
                && audit.actor_id == purchaser_id
                && audit.reason.as_deref() == Some("rate needs revision")
                && audit.created_at > 0
        }));
        assert!(applicant_audits.iter().any(|audit| {
            audit.action == "owner_pricing_saved"
                && audit.actor_id == engineer_id
                && audit.reason.as_deref() == Some("updated markup after rejection")
                && audit.previous_json.is_some()
                && audit.next_json.is_some()
        }));
        let other_engineer_id = Uuid::new_v4();
        service.lock().unwrap();
        service
            .cache_verified_account(
                CachedAccount {
                    id: other_engineer_id,
                    username: "other-engineer".into(),
                    roles: vec![Role::Engineer],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "other-engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let before_unauthorized: (String, i64, i64) = connection
            .query_row(
                "SELECT workflow_status, (SELECT COUNT(*) FROM local_order_audit_entries WHERE order_id = ?1), (SELECT COUNT(*) FROM local_sync_outbox WHERE entity_id = ?1) FROM local_purchase_orders WHERE id = ?1",
                [draft_order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        drop(connection);
        assert_eq!(
            service.list_order_audits(draft_order_id, now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.submit_requisition_draft(draft_order_id, now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.withdraw_requisition(draft_order_id, now),
            Err(AuthError::Forbidden)
        );
        let connection = service.connection.lock().unwrap();
        let after_unauthorized: (String, i64, i64) = connection
            .query_row(
                "SELECT workflow_status, (SELECT COUNT(*) FROM local_order_audit_entries WHERE order_id = ?1), (SELECT COUNT(*) FROM local_sync_outbox WHERE entity_id = ?1) FROM local_purchase_orders WHERE id = ?1",
                [draft_order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(after_unauthorized, before_unauthorized);
        drop(connection);
        drop(service);
        let _ = std::fs::remove_file(database_path);
    }

    #[test]
    fn cached_account_can_login_offline_and_is_role_checked() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        service
            .cache_verified_account(account(), "correct-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        let session = service
            .offline_login(
                "engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        assert_eq!(session.roles, vec![Role::Engineer]);
        assert!(service.require_role(Role::Engineer, now).is_ok());
        assert_eq!(
            service.require_role(Role::Administrator, now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.authorization_management_token(now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.require_material_mutation(now),
            Err(AuthError::Forbidden)
        );

        let connection = service.connection.lock().unwrap();
        let password_hash_column_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_accounts') WHERE name = 'password_hash'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(password_hash_column_count, 0);
        let migration_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_schema_migrations WHERE version = '0001_local_auth'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(migration_count, 1);
        let master_data_migration_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_schema_migrations WHERE version = '0002_master_data'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(master_data_migration_count, 1);
        let reference_master_data_migration_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_schema_migrations WHERE version = '0003_reference_master_data'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(reference_master_data_migration_count, 1);
        let catalog_migration_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_schema_migrations WHERE version = '0004_local_catalog'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(catalog_migration_count, 1);
        let material_image_migration_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_schema_migrations WHERE version = '0005_local_material_images'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(material_image_migration_count, 1);
        let requisition_migration_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_schema_migrations WHERE version = '0006_local_requisitions'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(requisition_migration_count, 1);
        let supplier_table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_suppliers') WHERE name = 'business_code'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(supplier_table_count, 1);
    }

    #[test]
    fn five_failed_passwords_lock_the_cached_account() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        service
            .cache_verified_account(account(), "correct-password", now)
            .unwrap();
        for _ in 0..5 {
            let captcha = service.issue_captcha(now).unwrap();
            assert_eq!(
                service.offline_login(
                    "engineer",
                    "wrong-password",
                    captcha.id,
                    answer(&captcha.question),
                    now
                ),
                Err(AuthError::InvalidCredentials)
            );
        }
        let captcha = service.issue_captcha(now).unwrap();
        assert_eq!(
            service.offline_login(
                "engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now
            ),
            Err(AuthError::AccountLocked)
        );
    }

    #[test]
    fn offline_window_and_idle_sessions_expire() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        service
            .cache_verified_account(account(), "correct-password", now)
            .unwrap();
        let late = now + OFFLINE_LOGIN_WINDOW + Duration::from_secs(1);
        let captcha = service.issue_captcha(late).unwrap();
        assert_eq!(
            service.offline_login(
                "engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                late
            ),
            Err(AuthError::OfflineWindowExpired)
        );
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        assert_eq!(
            service.require_role(
                Role::Engineer,
                now + IDLE_LOCK_WINDOW + Duration::from_secs(1)
            ),
            Err(AuthError::NoActiveSession)
        );
    }

    #[test]
    fn only_master_data_roles_can_save_project_defaults() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let project_id = Uuid::new_v4();
        let defaults = ProjectDefaultsInput {
            project_id,
            department_title: "fixture department".into(),
            company_address: "fixture address".into(),
            company_contact: Some("fixture contact".into()),
            default_currency: "XOF".into(),
            default_language_pair: "zh_fr".into(),
            default_tax_template_id: None,
        };
        service
            .cache_verified_account(account(), "correct-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        assert_eq!(
            service.save_project_defaults(defaults.clone(), now),
            Err(AuthError::Forbidden)
        );
        service.lock().unwrap();
        let administrator_id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id: administrator_id,
                    username: "administrator".into(),
                    roles: vec![Role::Administrator],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "administrator",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        service.save_project_defaults(defaults, now).unwrap();
        let country_id = Uuid::new_v4();
        service
            .save_reference_master_data(
                ReferenceMasterDataInput::Country {
                    id: country_id,
                    business_code: "CI".into(),
                    name: "fixture country".into(),
                    time_zone: "Africa/Abidjan".into(),
                    is_active: true,
                    version: 1,
                },
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let saved_currency: String = connection
            .query_row(
                "SELECT default_currency FROM local_project_print_defaults WHERE project_id = ?1",
                [project_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(saved_currency, "XOF");
        let country_code: String = connection
            .query_row(
                "SELECT business_code FROM local_countries WHERE id = ?1",
                [country_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(country_code, "CI");
        let country_audit_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_master_data_audit_entries WHERE entity_type = 'country'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(country_audit_count, 1);
        let country_audit_action: String = connection
            .query_row(
                "SELECT action FROM local_master_data_audit_entries WHERE entity_type = 'country'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(country_audit_action, "create");
        drop(connection);
        service
            .save_reference_master_data(
                ReferenceMasterDataInput::Project {
                    id: project_id,
                    country_id,
                    business_code: "FIXTURE-PROJECT".into(),
                    name: "fixture project".into(),
                    site: "fixture site".into(),
                    department_name: "fixture department".into(),
                    default_currency: "XOF".into(),
                    default_language_pair: "zh_fr".into(),
                    is_active: true,
                    version: 1,
                },
                now,
            )
            .unwrap();
        let project_defaults = service.list_project_defaults(now).unwrap();
        assert_eq!(project_defaults.len(), 1);
        assert_eq!(project_defaults[0].project_name, "fixture project");
        assert_eq!(
            project_defaults[0].company_contact.as_deref(),
            Some("fixture contact")
        );
        assert_eq!(
            service.save_reference_master_data(
                ReferenceMasterDataInput::Country {
                    id: country_id,
                    business_code: "CM".into(),
                    name: "fixture country".into(),
                    time_zone: "Africa/Douala".into(),
                    is_active: true,
                    version: 2,
                },
                now,
            ),
            Err(AuthError::ImmutableBusinessCode)
        );
        let tax_id = Uuid::new_v4();
        service
            .save_tax_template(
                TaxTemplateInput {
                    id: tax_id,
                    business_code: "FIXTURE-TAX".into(),
                    name: "fixture tax".into(),
                    country_id: None,
                    rate_basis_points: 1234,
                    effective_at: "2026-10-10".into(),
                    is_active: true,
                    version: 1,
                },
                now,
            )
            .unwrap();
        assert_eq!(
            service.save_tax_template(
                TaxTemplateInput {
                    id: Uuid::new_v4(),
                    business_code: "INVALID-DATE-TAX".into(),
                    name: "invalid date fixture".into(),
                    country_id: None,
                    rate_basis_points: 1234,
                    effective_at: "2026-02-30".into(),
                    is_active: true,
                    version: 1,
                },
                now,
            ),
            Err(AuthError::InvalidInput)
        );
        assert_eq!(
            service.save_exchange_rate(
                ExchangeRateInput {
                    id: Uuid::new_v4(),
                    from_currency: "EUR".into(),
                    to_currency: "XOF".into(),
                    rate_decimal: "1.25".into(),
                    effective_at: "2026-10-10".into(),
                    source: "manual".into(),
                    reason: None,
                    version: 1,
                },
                now,
            ),
            Err(AuthError::InvalidInput)
        );
        service
            .save_exchange_rate(
                ExchangeRateInput {
                    id: Uuid::new_v4(),
                    from_currency: "EUR".into(),
                    to_currency: "XOF".into(),
                    rate_decimal: "1.25".into(),
                    effective_at: "2026-10-10".into(),
                    source: "manual".into(),
                    reason: Some("fixture fallback".into()),
                    version: 1,
                },
                now,
            )
            .unwrap();
        let pending = service.pending_sync_events(100, now).unwrap();
        let entity_types = pending
            .iter()
            .map(|event| event.entity_type.as_str())
            .collect::<HashSet<_>>();
        assert!(entity_types.is_superset(&HashSet::from([
            "project_defaults",
            "country",
            "project",
            "tax_template",
            "exchange_rate",
        ])));
    }

    #[test]
    fn catalog_writes_are_role_protected_and_price_changes_keep_history() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let material = MaterialInput {
            id: Uuid::new_v4(),
            sku: Some("FIXTURE-M16".into()),
            category_id: None,
            name_zh: "测试材料".into(),
            name_fr: None,
            aliases: vec!["fixture alias".into()],
            brand: None,
            model: "M16".into(),
            specification: "fixture specification".into(),
            unit: "pcs".into(),
            notes: None,
            is_active: true,
            version: 1,
        };
        service
            .cache_verified_account(account(), "correct-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "engineer",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        assert_eq!(
            service.save_material(material.clone(), now),
            Err(AuthError::Forbidden)
        );

        service.lock().unwrap();
        let purchaser_id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id: purchaser_id,
                    username: "purchaser".into(),
                    roles: vec![Role::Purchaser],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "purchaser",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        let country_id = Uuid::new_v4();
        grant_new_test_scope(&service, purchaser_id, country_id, now);
        service.save_material(material.clone(), now).unwrap();
        service.connection.lock().unwrap().execute("UPDATE local_authorization_snapshots SET verified_at = ?1, expires_at = ?2 WHERE account_id = ?3", params![unix_seconds(now) - 2, unix_seconds(now) - 1, purchaser_id.to_string()]).unwrap();
        assert_eq!(
            service.save_material(material.clone(), now),
            Err(AuthError::Forbidden)
        );
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE local_authorization_snapshots SET expires_at = ?1 WHERE account_id = ?2",
                params![
                    unix_seconds(now + AUTHORIZATION_CACHE_WINDOW),
                    purchaser_id.to_string()
                ],
            )
            .unwrap();
        let image_id = Uuid::new_v4();
        service
            .save_material_image(
                MaterialImageInput {
                    id: image_id,
                    material_id: material.id,
                    source_file_name: "fixture.png".into(),
                    source_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+XQAAAABJRU5ErkJggg==".into(),
                    square_crop_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+XQAAAABJRU5ErkJggg==".into(),
                    crop_json: "{\"x\":0,\"y\":0,\"size\":1}".into(),
                },
                now,
            )
            .unwrap();
        let supplier = SupplierInput {
            id: Uuid::new_v4(),
            business_code: "SUP-001".into(),
            name: "fixture supplier".into(),
            country_id: Some(country_id),
            contact_name: None,
            address: None,
            city: None,
            country: None,
            phone: None,
            whatsapp: None,
            email: None,
            payment_terms: None,
            delivery_lead_time: None,
            is_preferred: true,
            is_blacklisted: false,
            is_active: true,
            version: 1,
        };
        service.save_supplier(supplier.clone(), now).unwrap();
        let suppliers = service.list_suppliers(now).unwrap();
        assert_eq!(suppliers.len(), 1);
        assert_eq!(suppliers[0].business_code, "SUP-001");
        for price_minor in ["500", "550"] {
            service
                .add_material_price(
                    MaterialPriceInput {
                        id: Uuid::new_v4(),
                        material_id: material.id,
                        supplier_id: supplier.id,
                        currency: "XOF".into(),
                        unit_price_minor: price_minor.into(),
                        unit: "pcs".into(),
                        effective_at: "2026-10-10".into(),
                        source_note: None,
                        version: 1,
                    },
                    now,
                )
                .unwrap();
        }
        {
            let connection = service.connection.lock().unwrap();
            let pending_outbox_count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM local_sync_outbox WHERE acknowledged_at IS NULL",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(pending_outbox_count, 4);
            let material_payload: String = connection
                .query_row(
                    "SELECT payload_json FROM local_sync_outbox WHERE entity_type = 'material'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(material_payload.contains("测试材料"));
        }
        let pending = service.pending_sync_events(100, now).unwrap();
        assert_eq!(pending.len(), 4);
        let first_event = pending[0].clone();
        service
            .apply_sync_acknowledgements(
                vec![
                    SyncAcknowledgementInput {
                        event_id: first_event.event_id,
                        status: "accepted".into(),
                        server_version: Some(3),
                    },
                    SyncAcknowledgementInput {
                        event_id: pending[1].event_id,
                        status: "conflict".into(),
                        server_version: Some(2),
                    },
                ],
                now,
            )
            .unwrap();
        assert_eq!(service.pending_sync_events(100, now).unwrap().len(), 3);
        service
            .apply_sync_acknowledgements(
                vec![SyncAcknowledgementInput {
                    event_id: first_event.event_id,
                    status: "accepted".into(),
                    server_version: Some(1),
                }],
                now,
            )
            .unwrap();
        let connection = service.connection.lock().unwrap();
        let version: i64 = connection
            .query_row(
                "SELECT server_version FROM local_sync_entity_versions WHERE entity_type = ?1 AND entity_id = ?2",
                params![first_event.entity_type, first_event.entity_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, 3);
        drop(connection);
        let country_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let department_id = Uuid::new_v4();
        let team_id = Uuid::new_v4();
        {
            let connection = service.connection.lock().unwrap();
            connection.execute("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES (?1, 'CI', 'fixture country', 'Africa/Abidjan', 1, 1)", [country_id.to_string()]).unwrap();
            connection
                .execute(
                    "UPDATE local_suppliers SET country_id = ?2 WHERE id = ?1",
                    params![supplier.id.to_string(), country_id.to_string()],
                )
                .unwrap();
            connection.execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, 'FIXTURE', 'fixture project', 'fixture site', 'fixture department', 'XOF', 'zh_fr', 1, 1)", params![project_id.to_string(), country_id.to_string()]).unwrap();
            connection.execute("INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES (?1, 'FIXTURE-DEPT', 'fixture department', 1, 1)", [department_id.to_string()]).unwrap();
            connection.execute("INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES (?1, ?2, 'FIXTURE-TEAM', 'fixture team', 1, 1)", params![team_id.to_string(), department_id.to_string()]).unwrap();
        }
        grant_test_scope(
            &service,
            purchaser_id,
            project_id,
            department_id,
            team_id,
            now,
        );
        let requisition_id = Uuid::new_v4();
        let draft = RequisitionDraftInput {
            id: requisition_id,
            display_no: "CI-FIXTURE-20261010-INT-0001".into(),
            country_id,
            project_id,
            site: "fixture site".into(),
            department_id,
            team_id,
            applicant_id: purchaser_id,
            currency: "XOF".into(),
            primary_currency: "XOF".into(),
            language_pair: "zh_fr".into(),
            urgency: "normal".into(),
            urgency_reason: None,
            order_date: "2026-10-10".into(),
            delivery_address: "fixture address".into(),
            expected_delivery_date: None,
            notes: None,
            order_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
            order_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
            tax_rate_basis_points: 1800,
            lines: vec![RequisitionLineInput {
                id: Uuid::new_v4(),
                material_id: Some(material.id),
                material_snapshot: MaterialSnapshotInput {
                    name_zh: "forged".into(),
                    name_fr: None,
                    model: "forged".into(),
                    specification: "forged".into(),
                },
                supplier_id: Some(supplier.id),
                currency: "XOF".into(),
                quantity: "2.5".into(),
                unit: "pcs".into(),
                unit_price_minor: "1250".into(),
                line_discount: AdjustmentInput::FixedMinor {
                    minor: "125".into(),
                },
                line_freight: AdjustmentInput::FixedMinor { minor: "20".into() },
                freight_included: false,
                sort_order: 0,
            }],
        };
        let totals = service.save_requisition_draft(draft.clone(), now).unwrap();
        assert_eq!(totals.total_minor, "3564");
        let outbox_before_identity_change: i64 = service.connection.lock().unwrap().query_row(
            "SELECT COUNT(*) FROM local_sync_outbox WHERE entity_type = 'purchase_order' AND entity_id = ?1",
            [requisition_id.to_string()],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(
            service.save_requisition_draft(
                RequisitionDraftInput {
                    applicant_id: Uuid::new_v4(),
                    ..draft.clone()
                },
                now
            ),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.save_requisition_draft(
                RequisitionDraftInput {
                    display_no: "moved-order-number".into(),
                    ..draft.clone()
                },
                now
            ),
            Err(AuthError::Forbidden)
        );
        assert_eq!(service.connection.lock().unwrap().query_row(
            "SELECT COUNT(*) FROM local_sync_outbox WHERE entity_type = 'purchase_order' AND entity_id = ?1",
            [requisition_id.to_string()],
            |row| row.get::<_, i64>(0),
        ).unwrap(), outbox_before_identity_change);
        let order_event = service
            .pending_sync_events(100, now)
            .unwrap()
            .into_iter()
            .find(|event| {
                event.entity_type == "purchase_order" && event.entity_id == requisition_id
            })
            .unwrap();
        let order_payload: serde_json::Value =
            serde_json::from_str(&order_event.payload_json).unwrap();
        assert_eq!(order_payload["countryId"], country_id.to_string());
        assert_eq!(order_payload["projectId"], project_id.to_string());
        assert_eq!(order_payload["workflowStatus"], "draft");
        let material_snapshot: serde_json::Value = serde_json::from_str(
            order_payload["lines"][0]["materialSnapshotJson"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        let line_freight: serde_json::Value = serde_json::from_str(
            order_payload["lines"][0]["lineFreightJson"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(material_snapshot["nameZh"], "测试材料");
        assert_eq!(line_freight["minor"], "20");
        service
            .submit_requisition_draft(requisition_id, now)
            .unwrap();
        assert_eq!(
            service.confirm_requisition(requisition_id, now),
            Err(AuthError::Forbidden)
        );
        let comment = service
            .add_order_comment(requisition_id, "fixture comment".into(), now)
            .unwrap();
        assert_eq!(comment.body, "fixture comment");
        assert_eq!(
            service
                .list_order_comments(requisition_id, now)
                .unwrap()
                .len(),
            1
        );
        let comment_event = service
            .pending_sync_events(100, now)
            .unwrap()
            .into_iter()
            .find(|event| event.entity_type == "order_comment" && event.entity_id == comment.id)
            .unwrap();
        assert!(comment_event.payload_json.contains("fixture comment"));
        assert_eq!(
            service.submit_requisition_draft(requisition_id, now),
            Err(AuthError::Forbidden)
        );
        service.lock().unwrap();
        let approver_id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id: approver_id,
                    username: "approver".into(),
                    roles: vec![Role::Purchaser],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "approver",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        grant_test_scope(
            &service,
            approver_id,
            project_id,
            department_id,
            team_id,
            now,
        );
        service.confirm_requisition(requisition_id, now).unwrap();
        let other_project_id = Uuid::new_v4();
        service.connection.lock().unwrap().execute(
            "INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, ?3, 'other project', 'other site', 'fixture department', 'XOF', 'zh_fr', 1, 1)",
            params![other_project_id.to_string(), country_id.to_string(), format!("OTHER-{}", other_project_id.simple())],
        ).unwrap();
        grant_test_scope(
            &service,
            approver_id,
            other_project_id,
            department_id,
            team_id,
            now,
        );
        assert_eq!(
            service.revise_confirmed_requisition(
                RequisitionDraftInput {
                    project_id: other_project_id,
                    ..draft.clone()
                },
                "move to another authorized project".into(),
                now,
            ),
            Err(AuthError::Forbidden)
        );
        let other_order_id = Uuid::new_v4();
        let mut other_draft = draft.clone();
        other_draft.id = other_order_id;
        other_draft.project_id = other_project_id;
        other_draft.site = "other site".into();
        other_draft.applicant_id = approver_id;
        other_draft.display_no = "OTHER-TEST-DRAFT".into();
        other_draft.lines[0].id = Uuid::new_v4();
        service.save_requisition_draft(other_draft, now).unwrap();
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'confirmed' WHERE id = ?1",
                [other_order_id.to_string()],
            )
            .unwrap();
        service.connection.lock().unwrap().execute(
            "DELETE FROM local_authorization_snapshots WHERE account_id = ?1 AND project_id = ?2",
            params![approver_id.to_string(), other_project_id.to_string()],
        ).unwrap();
        let execution_orders = service.list_confirmed_procurement_orders(now).unwrap();
        assert_eq!(execution_orders.len(), 1);
        assert_eq!(execution_orders[0].id, requisition_id);
        let history = service
            .list_requisition_history(None, RequisitionHistoryFilter::default(), now)
            .unwrap();
        assert_eq!(history.records.len(), 1);
        assert_eq!(history.records[0].id, requisition_id);
        assert!(history.next_cursor.is_none());
        assert_eq!(
            service
                .list_requisition_history(
                    None,
                    RequisitionHistoryFilter {
                        query: Some("OTHER".into()),
                        ..Default::default()
                    },
                    now
                )
                .unwrap()
                .records
                .len(),
            0
        );
        assert_eq!(
            service
                .list_requisition_history(
                    None,
                    RequisitionHistoryFilter {
                        workflow_status: Some("confirmed".into()),
                        ..Default::default()
                    },
                    now
                )
                .unwrap()
                .records
                .len(),
            1
        );
        assert_eq!(
            service
                .list_requisition_history(
                    None,
                    RequisitionHistoryFilter {
                        query: Some("%".into()),
                        ..Default::default()
                    },
                    now
                )
                .unwrap()
                .records
                .len(),
            0
        );
        assert_eq!(
            service.list_order_comments(other_order_id, now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.list_order_audits(other_order_id, now),
            Err(AuthError::Forbidden)
        );
        assert!(matches!(
            service.get_requisition_detail(other_order_id, now),
            Err(AuthError::Forbidden)
        ));
        let detail = service.get_requisition_detail(requisition_id, now).unwrap();
        assert_eq!(detail.id, requisition_id);
        assert_eq!(detail.applicant_id, purchaser_id);
        assert_eq!(detail.lines[0].material_name, "测试材料");
        service.connection.lock().unwrap().execute(
            "UPDATE local_authorization_snapshots SET verified_at = ?1, expires_at = ?2 WHERE account_id = ?3 AND project_id = ?4",
            params![unix_seconds(now) - 2, unix_seconds(now) - 1, approver_id.to_string(), project_id.to_string()],
        ).unwrap();
        assert_eq!(
            service
                .list_requisition_history(None, RequisitionHistoryFilter::default(), now)
                .unwrap()
                .records
                .len(),
            1
        );
        assert!(service.get_requisition_detail(requisition_id, now).is_ok());
        assert_eq!(
            service.require_active_scope_for_order(requisition_id, now),
            Err(AuthError::Forbidden)
        );
        service.connection.lock().unwrap().execute(
            "UPDATE local_authorization_snapshots SET expires_at = ?1 WHERE account_id = ?2 AND project_id = ?3",
            params![unix_seconds(now + AUTHORIZATION_CACHE_WINDOW), approver_id.to_string(), project_id.to_string()],
        ).unwrap();
        assert_eq!(execution_orders[0].lines.len(), 1);
        assert_eq!(execution_orders[0].lines[0].material_name, "测试材料");
        let mention = service
            .add_order_comment(
                requisition_id,
                "@purchaser 请核对。test@example.com".into(),
                now,
            )
            .unwrap();
        assert_eq!(mention.notification_count, 1);
        {
            let connection = service.connection.lock().unwrap();
            let notification_count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM local_order_notifications WHERE recipient_id = ?1 AND comment_id = ?2",
                    params![purchaser_id.to_string(), mention.id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(notification_count, 1);
        }
        let mut revised = draft.clone();
        revised.delivery_address = "revised fixture address".into();
        revised.notes = Some("purchaser correction".into());
        service
            .revise_confirmed_requisition(revised.clone(), "fixture revision reason".into(), now)
            .unwrap();
        let revision_audits = service.list_order_audits(requisition_id, now).unwrap();
        assert!(
            revision_audits
                .iter()
                .any(|audit| audit.action == "confirmed_revised"
                    && audit.reason.as_deref() == Some("fixture revision reason"))
        );
        let rfq = service
            .create_rfq(
                CreateRfqInput {
                    id: Uuid::new_v4(),
                    source_order_id: requisition_id,
                    supplier_id: supplier.id,
                    display_no: "CI-FIXTURE-20261010-RFQ-0001".into(),
                    currency: "XOF".into(),
                },
                now,
            )
            .unwrap();
        assert_eq!(rfq.item_count, 1);
        let connection = service.connection.lock().unwrap();
        let rfq_item_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_rfq_items WHERE rfq_id = ?1",
                [rfq.id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rfq_item_count, 1);
        drop(connection);
        {
            let connection = service.connection.lock().unwrap();
            let (status, delivery_address, snapshot, freight, item_currency): (String, String, String, String, String) = connection.query_row(
                "SELECT o.workflow_status, o.delivery_address, i.material_snapshot_json, i.line_freight_json, i.currency FROM local_purchase_orders o JOIN local_purchase_order_items i ON i.order_id = o.id WHERE o.id = ?1",
                [requisition_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            ).unwrap();
            assert_eq!(status, "confirmed");
            assert_eq!(delivery_address, "revised fixture address");
            assert!(snapshot.contains("测试材料"));
            assert!(freight.contains("20"));
            assert_eq!(item_currency, "XOF");
            let audit_count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM local_order_audit_entries WHERE order_id = ?1 AND action = 'confirmed'",
                    [requisition_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(audit_count, 1);
            let revision: (String, String, String) = connection
                .query_row(
                    "SELECT reason, previous_json, next_json FROM local_order_audit_entries WHERE order_id = ?1 AND action = 'confirmed_revised'",
                    [requisition_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();
            assert_eq!(revision.0, "fixture revision reason");
            assert!(revision.1.contains("fixture address"));
            assert!(revision.2.contains("revised fixture address"));
        }
        let parent_item_id = {
            let connection = service.connection.lock().unwrap();
            connection
                .query_row(
                    "SELECT id FROM local_purchase_order_items WHERE order_id = ?1",
                    [requisition_id.to_string()],
                    |row| row.get::<_, String>(0),
                )
                .unwrap()
        };
        let children = service
            .allocate_supplier_child_orders(
                requisition_id,
                vec![SupplierChildAllocationInput {
                    parent_item_id: Uuid::parse_str(&parent_item_id).unwrap(),
                    supplier_id: supplier.id,
                    currency: "XOF".into(),
                    child_display_no: "CI-FIXTURE-20261010-SUP-001-0001".into(),
                    locked_exchange_rate_decimal: "1".into(),
                }],
                now,
            )
            .unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].supplier_id, supplier.id);
        assert_eq!(children[0].currency, "XOF");
        assert_eq!(children[0].source_total_minor, "3125");
        assert_eq!(children[0].primary_total_minor, "3125");
        let connection = service.connection.lock().unwrap();
        let child: (String, String, String, String, i64) = connection
            .query_row(
                "SELECT parent_order_id, supplier_id, currency, locked_exchange_rate_decimal, total_minor FROM local_purchase_orders WHERE id = ?1",
                [children[0].child_order_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();
        assert_eq!(child.0, requisition_id.to_string());
        assert_eq!(child.1, supplier.id.to_string());
        assert_eq!(child.2, "XOF");
        assert_eq!(child.3, "1");
        assert_eq!(child.4, 3125);
        let parent_total: i64 = connection
            .query_row(
                "SELECT total_minor FROM local_purchase_orders WHERE id = ?1",
                [requisition_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(parent_total, 3125);
        drop(connection);
        let child_item_id = {
            let connection = service.connection.lock().unwrap();
            connection
                .query_row(
                    "SELECT id FROM local_purchase_order_items WHERE order_id = ?1",
                    [children[0].child_order_id.to_string()],
                    |row| row.get::<_, String>(0),
                )
                .unwrap()
        };
        let child_terms = service
            .save_supplier_child_terms(
                SupplierChildTermsInput {
                    order_id: children[0].child_order_id,
                    lines: vec![SupplierChildLineTermsInput {
                        order_item_id: Uuid::parse_str(&child_item_id).unwrap(),
                        line_discount: AdjustmentInput::FixedMinor {
                            minor: "125".into(),
                        },
                        line_freight: AdjustmentInput::FixedMinor { minor: "25".into() },
                        freight_included: false,
                    }],
                    order_discount: AdjustmentInput::FixedMinor {
                        minor: "100".into(),
                    },
                    order_freight: AdjustmentInput::FixedMinor { minor: "50".into() },
                    tax_rate_basis_points: 1800,
                },
                now,
            )
            .unwrap();
        assert_eq!(child_terms.total_minor, "3511");
        service
            .send_supplier_order(children[0].child_order_id, now)
            .unwrap();
        {
            let connection = service.connection.lock().unwrap();
            let child: (String, i64, i64) = connection
                .query_row(
                    "SELECT workflow_status, total_minor, supplier_terms_completed_at FROM local_purchase_orders WHERE id = ?1",
                    [children[0].child_order_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();
            assert_eq!(child.0, "sent");
            assert_eq!(child.1, 3511);
            assert!(child.2 > 0);
        }
        let receipt_attachment_id = Uuid::new_v4();
        {
            let connection = service.connection.lock().unwrap();
            connection
                .execute(
                    "INSERT INTO local_order_attachments (id, order_id, original_name, content_type, byte_length, local_path, created_at) VALUES (?1, ?2, 'fixture-receipt.jpg', 'image/jpeg', 1, 'fixture-receipt.jpg', ?3)",
                    params![receipt_attachment_id.to_string(), children[0].child_order_id.to_string(), unix_seconds(now)],
                )
                .unwrap();
        }
        {
            let connection = service.connection.lock().unwrap();
            let (quantity, unit): (String, String) = connection
                .query_row(
                    "SELECT quantity_decimal, unit FROM local_purchase_order_items WHERE id = ?1 AND order_id = ?2",
                    params![child_item_id, children[0].child_order_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(quantity, "2.5");
            assert_eq!(unit, "pcs");
        }
        assert_eq!(
            service.record_receipt(
                RecordReceiptInput {
                    id: Uuid::new_v4(),
                    order_id: children[0].child_order_id,
                    received_at: "2026-10-11".into(),
                    receiver_id: approver_id,
                    over_receipt_reason: None,
                    attachment_ids: vec![],
                    items: vec![ReceiptItemInput {
                        order_item_id: Uuid::parse_str(&child_item_id).unwrap(),
                        quantity: "3".into(),
                        unit: "pcs".into(),
                    }],
                },
                now,
            ),
            Err(AuthError::InvalidInput)
        );
        let first_receipt = service
            .record_receipt(
                RecordReceiptInput {
                    id: Uuid::new_v4(),
                    order_id: children[0].child_order_id,
                    received_at: "2026-10-11".into(),
                    receiver_id: approver_id,
                    over_receipt_reason: None,
                    attachment_ids: vec![receipt_attachment_id],
                    items: vec![ReceiptItemInput {
                        order_item_id: Uuid::parse_str(&child_item_id).unwrap(),
                        quantity: "1".into(),
                        unit: "pcs".into(),
                    }],
                },
                now,
            )
            .unwrap();
        assert_eq!(first_receipt.workflow_status, "sent");
        {
            let connection = service.connection.lock().unwrap();
            let receipt_payload: String = connection.query_row(
                "SELECT payload_json FROM local_sync_outbox WHERE entity_type = 'receipt' AND entity_id = ?1 ORDER BY rowid DESC LIMIT 1",
                [first_receipt.id.to_string()], |row| row.get(0),
            ).unwrap();
            let receipt_payload: serde_json::Value =
                serde_json::from_str(&receipt_payload).unwrap();
            assert_eq!(receipt_payload["items"][0]["quantity"], "1");
            assert_eq!(receipt_payload["items"][0]["orderItemId"], child_item_id);
            assert_eq!(
                receipt_payload["attachmentIds"][0],
                receipt_attachment_id.to_string()
            );
            let linked_count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM local_receipt_attachment_links WHERE receipt_id = ?1 AND attachment_id = ?2",
                    params![first_receipt.id.to_string(), receipt_attachment_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(linked_count, 1);
        }
        service.connection.lock().unwrap().execute(
            "UPDATE local_sync_outbox SET payload_json = ?2 WHERE entity_type = 'receipt' AND entity_id = ?1",
            params![first_receipt.id.to_string(), serde_json::json!({
                "id": first_receipt.id, "orderId": children[0].child_order_id,
                "receiverId": approver_id, "receivedAt": "2026-10-11", "completed": false,
            }).to_string()],
        ).unwrap();
        let upgraded = service
            .pending_sync_events(100, now)
            .unwrap()
            .into_iter()
            .find(|event| event.entity_type == "receipt" && event.entity_id == first_receipt.id)
            .unwrap();
        let upgraded: serde_json::Value = serde_json::from_str(&upgraded.payload_json).unwrap();
        assert_eq!(upgraded["items"][0]["quantity"], "1");
        assert_eq!(
            upgraded["attachmentIds"][0],
            receipt_attachment_id.to_string()
        );
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE local_sync_outbox SET acknowledged_at = ?2 WHERE entity_type = 'receipt' AND entity_id = ?1",
                params![first_receipt.id.to_string(), unix_seconds(now)],
            )
            .unwrap();
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "DELETE FROM local_order_attachments WHERE id = ?1",
                [receipt_attachment_id.to_string()],
            )
            .unwrap();
        let legacy_remote_page = SyncPullPageInput {
            changes: vec![SyncPullChangeInput {
                cursor: "1".into(),
                entity_type: "receipt".into(),
                entity_id: first_receipt.id,
                operation: "upsert".into(),
                version: 1,
                payload: upgraded.clone(),
                changed_at: "2026-10-11T00:00:00Z".into(),
            }],
            next_cursor: "1".into(),
        };
        service
            .apply_sync_pull_page(legacy_remote_page.clone(), now)
            .unwrap();
        service
            .apply_sync_pull_page(legacy_remote_page, now)
            .unwrap();
        let legacy_link_count: i64 = service
            .connection
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM local_receipt_attachment_links WHERE receipt_id = ?1 AND attachment_id = ?2",
                params![
                    first_receipt.id.to_string(),
                    receipt_attachment_id.to_string()
                ],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(legacy_link_count, 1);
        let mut divergent_legacy_receipt = upgraded;
        divergent_legacy_receipt["attachmentIds"] = serde_json::json!([]);
        assert_eq!(
            service.apply_sync_pull_page(
                SyncPullPageInput {
                    changes: vec![SyncPullChangeInput {
                        cursor: "2".into(),
                        entity_type: "receipt".into(),
                        entity_id: first_receipt.id,
                        operation: "upsert".into(),
                        version: 2,
                        payload: divergent_legacy_receipt,
                        changed_at: "2026-10-11T00:00:01Z".into(),
                    }],
                    next_cursor: "2".into(),
                },
                now,
            ),
            Err(AuthError::InvalidInput)
        );
        let second_receipt = service
            .record_receipt(
                RecordReceiptInput {
                    id: Uuid::new_v4(),
                    order_id: children[0].child_order_id,
                    received_at: "2026-10-11".into(),
                    receiver_id: approver_id,
                    over_receipt_reason: None,
                    attachment_ids: vec![],
                    items: vec![ReceiptItemInput {
                        order_item_id: Uuid::parse_str(&child_item_id).unwrap(),
                        quantity: "1.5".into(),
                        unit: "pcs".into(),
                    }],
                },
                now,
            )
            .unwrap();
        assert_eq!(second_receipt.workflow_status, "completed");
        assert_eq!(
            service.close_supplier_order_with_conditions(
                children[0].child_order_id,
                "".into(),
                now,
            ),
            Err(AuthError::InvalidInput)
        );
        {
            let connection = service.connection.lock().unwrap();
            connection
                .execute(
                    "UPDATE local_purchase_orders SET workflow_status = 'sent' WHERE id = ?1",
                    [children[0].child_order_id.to_string()],
                )
                .unwrap();
        }
        service
            .close_supplier_order_with_conditions(
                children[0].child_order_id,
                "fixture missing material".into(),
                now,
            )
            .unwrap();
        {
            let connection = service.connection.lock().unwrap();
            let status: String = connection
                .query_row(
                    "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1",
                    [children[0].child_order_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(status, "completed_with_conditions");
        }
        assert_eq!(
            service.revise_confirmed_requisition(revised, "after split".into(), now),
            Err(AuthError::InvalidInput)
        );
        service.lock().unwrap();
        let super_administrator_id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id: super_administrator_id,
                    username: "super-administrator".into(),
                    roles: vec![Role::SuperAdministrator],
                    enabled: true,
                    requires_password_change: false,
                },
                "correct-password",
                now,
            )
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "super-administrator",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        assert_eq!(
            service.approval_policy(now).unwrap().allow_self_approval,
            false
        );
        service
            .set_approval_policy(true, "fixture policy reason".into(), now)
            .unwrap();
        assert!(service.approval_policy(now).unwrap().allow_self_approval);
        service.lock().unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                "purchaser",
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        {
            let connection = service.connection.lock().unwrap();
            connection
                .execute(
                    "UPDATE local_purchase_orders SET workflow_status = 'pending_confirmation' WHERE id = ?1",
                    [requisition_id.to_string()],
                )
                .unwrap();
        }
        service.confirm_requisition(requisition_id, now).unwrap();
        {
            let connection = service.connection.lock().unwrap();
            let (self_approved, policy_audits): (i64, i64) = connection
                .query_row(
                    "SELECT self_approved, (SELECT COUNT(*) FROM local_approval_policy_audit_entries WHERE reason = 'fixture policy reason') FROM local_purchase_orders WHERE id = ?1",
                    [requisition_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(self_approved, 1);
            assert_eq!(policy_audits, 1);
        }
        {
            let connection = service.connection.lock().unwrap();
            connection
                .execute(
                    "UPDATE local_purchase_orders SET workflow_status = 'pending_confirmation' WHERE id = ?1",
                    [requisition_id.to_string()],
                )
                .unwrap();
        }
        assert_eq!(
            service.reject_requisition(requisition_id, "".into(), now),
            Err(AuthError::Forbidden)
        );
        service
            .reject_requisition(requisition_id, "fixture rejection reason".into(), now)
            .unwrap();
        {
            let connection = service.connection.lock().unwrap();
            let (status, reason, audit_count): (String, String, i64) = connection
                .query_row(
                    "SELECT o.workflow_status, o.rejection_reason, (SELECT COUNT(*) FROM local_order_audit_entries a WHERE a.order_id = o.id AND a.action = 'rejected') FROM local_purchase_orders o WHERE o.id = ?1",
                    [requisition_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();
            assert_eq!(status, "rejected");
            assert_eq!(reason, "fixture rejection reason");
            assert_eq!(audit_count, 1);
        }
        let catalog = service.search_catalog("测试", None, now).unwrap();
        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].prices.len(), 1);
        assert_eq!(catalog[0].prices[0].unit_price_minor, "550");
        assert_eq!(
            service.save_supplier(
                SupplierInput {
                    business_code: "SUP-002".into(),
                    ..supplier.clone()
                },
                now,
            ),
            Err(AuthError::ImmutableBusinessCode)
        );
        let connection = service.connection.lock().unwrap();
        let (history_count, active_count, active_price): (i64, i64, i64) = connection
            .query_row(
                "SELECT COUNT(*), SUM(is_active), MAX(CASE WHEN is_active = 1 THEN unit_price_minor END)
                 FROM local_material_prices WHERE material_id = ?1",
                [material.id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!((history_count, active_count, active_price), (2, 1, 550));
        let (source_path, square_path): (String, String) = connection
            .query_row(
                "SELECT source_path, square_crop_path FROM local_material_images WHERE id = ?1",
                [image_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(Path::new(&source_path).is_file());
        assert!(Path::new(&square_path).is_file());
        drop(connection);
        assert!(
            service
                .get_material_square_image(material.id, now)
                .unwrap()
                .is_some_and(|value| value.starts_with("data:image/png;base64,iVBOR"))
        );
        let market_id = Uuid::new_v4();
        let mut market_draft = draft.clone();
        market_draft.id = market_id;
        market_draft.display_no = "HONSEN-MARKET-FIXTURE".into();
        market_draft.lines[0].id = Uuid::new_v4();
        service
            .save_requisition_draft(market_draft.clone(), now)
            .unwrap();
        service
            .set_procurement_mode(market_id, "honsen_self_purchase".into(), now)
            .unwrap();
        service.submit_requisition_draft(market_id, now).unwrap();
        service.confirm_requisition(market_id, now).unwrap();
        assert_eq!(
            service.record_receipt(
                RecordReceiptInput {
                    id: Uuid::new_v4(),
                    order_id: market_id,
                    received_at: "2026-10-11".into(),
                    receiver_id: purchaser_id,
                    over_receipt_reason: None,
                    attachment_ids: vec![],
                    items: vec![ReceiptItemInput {
                        order_item_id: market_draft.lines[0].id,
                        quantity: "1".into(),
                        unit: "pcs".into(),
                    }],
                },
                now
            ),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.start_honsen_market_execution(requisition_id, now),
            Err(AuthError::Forbidden)
        );
        service
            .start_honsen_market_execution(market_id, now)
            .unwrap();
        assert!(
            service
                .list_order_audits(market_id, now)
                .unwrap()
                .iter()
                .any(|audit| audit.action == "market_execution_started"
                    && audit.previous_json.as_deref() == Some("confirmed")
                    && audit.next_json.as_deref() == Some("executing"))
        );
        assert_eq!(
            service.start_honsen_market_execution(market_id, now),
            Err(AuthError::Forbidden)
        );
        let expenditure = RecordProcurementExpenditureInput {
            id: Uuid::new_v4(),
            order_id: market_id,
            receipt_id: None,
            counterparty_type: "market_casual".into(),
            supplier_id: None,
            payee_name: "fixture market seller".into(),
            currency: "XOF".into(),
            amount_minor: "1200".into(),
            payment_date: "2026-10-11".into(),
            payment_method: "cash".into(),
            payment_handler_id: purchaser_id,
            notes: None,
            corrects_expenditure_id: None,
            correction_reason: None,
        };
        let pending_before = service.pending_sync_events(100, now).unwrap().len();
        assert_eq!(
            service
                .record_procurement_expenditure(
                    RecordProcurementExpenditureInput {
                        amount_minor: "0".into(),
                        ..expenditure.clone()
                    },
                    now
                )
                .err(),
            Some(AuthError::InvalidInput)
        );
        assert_eq!(
            service
                .record_procurement_expenditure(
                    RecordProcurementExpenditureInput {
                        receipt_id: Some(Uuid::new_v4()),
                        ..expenditure.clone()
                    },
                    now
                )
                .err(),
            Some(AuthError::InvalidInput)
        );
        assert_eq!(
            service.pending_sync_events(100, now).unwrap().len(),
            pending_before
        );
        service
            .record_procurement_expenditure(expenditure.clone(), now)
            .unwrap();
        let second = service
            .record_procurement_expenditure(
                RecordProcurementExpenditureInput {
                    id: Uuid::new_v4(),
                    amount_minor: "300".into(),
                    ..expenditure.clone()
                },
                now,
            )
            .unwrap();
        assert_eq!(
            service
                .list_procurement_expenditures(market_id, now)
                .unwrap()
                .len(),
            2
        );
        let reversal = service
            .reverse_procurement_expenditure(
                expenditure.id,
                Uuid::new_v4(),
                "fixture correction".into(),
                now,
            )
            .unwrap();
        assert_eq!(reversal.status, "reversed");
        assert_eq!(
            service
                .reverse_procurement_expenditure(
                    expenditure.id,
                    Uuid::new_v4(),
                    "duplicate".into(),
                    now
                )
                .err(),
            Some(AuthError::Database)
        );
        let replacement = service
            .record_procurement_expenditure(
                RecordProcurementExpenditureInput {
                    id: Uuid::new_v4(),
                    amount_minor: "1250".into(),
                    corrects_expenditure_id: Some(reversal.id),
                    correction_reason: Some("correct amount".into()),
                    ..expenditure.clone()
                },
                now,
            )
            .unwrap();
        assert_eq!(replacement.corrects_expenditure_id, Some(reversal.id));
        let all_expenditures = service
            .list_procurement_expenditures(market_id, now)
            .unwrap();
        assert_eq!(all_expenditures.len(), 4);
        assert_eq!(
            all_expenditures
                .iter()
                .filter(|row| row.status == "recorded")
                .map(|row| row.amount_minor.parse::<i64>().unwrap())
                .sum::<i64>()
                - all_expenditures
                    .iter()
                    .filter(|row| row.status == "reversed")
                    .map(|row| row.amount_minor.parse::<i64>().unwrap())
                    .sum::<i64>(),
            1550
        );
        assert_eq!(second.amount_minor, "300");
        let expenditure_outbox = service
            .pending_sync_events(100, now)
            .unwrap()
            .into_iter()
            .filter(|event| event.entity_type == "procurement_expenditure")
            .map(|event| event.entity_id)
            .collect::<Vec<_>>();
        assert_eq!(
            expenditure_outbox,
            vec![expenditure.id, second.id, reversal.id, replacement.id]
        );
        let registered = service
            .record_procurement_expenditure(
                RecordProcurementExpenditureInput {
                    id: Uuid::new_v4(),
                    counterparty_type: "registered_supplier".into(),
                    supplier_id: Some(supplier.id),
                    payee_name: supplier.name.clone(),
                    ..expenditure.clone()
                },
                now,
            )
            .unwrap();
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE local_suppliers SET is_active = 0 WHERE id = ?1",
                [supplier.id.to_string()],
            )
            .unwrap();
        let registered_reversal = service
            .reverse_procurement_expenditure(
                registered.id,
                Uuid::new_v4(),
                "supplier later deactivated".into(),
                now,
            )
            .unwrap();
        assert_eq!(registered_reversal.supplier_id, Some(supplier.id));
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE local_suppliers SET is_active = 1 WHERE id = ?1",
                [supplier.id.to_string()],
            )
            .unwrap();
        let market_line_id = market_draft.lines[0].id;
        let owner_id = Uuid::new_v4();
        market_draft.id = owner_id;
        market_draft.display_no = "OWNER-EXPENDITURE-DENIAL".into();
        market_draft.lines[0].id = Uuid::new_v4();
        service
            .save_requisition_draft(market_draft.clone(), now)
            .unwrap();
        service
            .set_procurement_mode(owner_id, "owner_self_purchase".into(), now)
            .unwrap();
        service
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'executing' WHERE id = ?1",
                [owner_id.to_string()],
            )
            .unwrap();
        assert_eq!(
            service
                .record_procurement_expenditure(
                    RecordProcurementExpenditureInput {
                        id: Uuid::new_v4(),
                        order_id: owner_id,
                        ..expenditure.clone()
                    },
                    now
                )
                .err(),
            Some(AuthError::Forbidden)
        );
        let partial = service
            .record_receipt(
                RecordReceiptInput {
                    id: Uuid::new_v4(),
                    order_id: market_id,
                    received_at: "2026-10-11".into(),
                    receiver_id: purchaser_id,
                    over_receipt_reason: None,
                    attachment_ids: vec![],
                    items: vec![ReceiptItemInput {
                        order_item_id: market_line_id,
                        quantity: "1".into(),
                        unit: "pcs".into(),
                    }],
                },
                now,
            )
            .unwrap();
        assert_eq!(partial.workflow_status, "receiving");
        let complete = service
            .record_receipt(
                RecordReceiptInput {
                    id: Uuid::new_v4(),
                    order_id: market_id,
                    received_at: "2026-10-11".into(),
                    receiver_id: purchaser_id,
                    over_receipt_reason: None,
                    attachment_ids: vec![],
                    items: vec![ReceiptItemInput {
                        order_item_id: market_line_id,
                        quantity: "1.5".into(),
                        unit: "pcs".into(),
                    }],
                },
                now,
            )
            .unwrap();
        assert_eq!(complete.workflow_status, "completed");
        let conditional_id = Uuid::new_v4();
        market_draft.id = conditional_id;
        market_draft.display_no = "HONSEN-MARKET-CONDITIONAL".into();
        market_draft.lines[0].id = Uuid::new_v4();
        service
            .save_requisition_draft(market_draft.clone(), now)
            .unwrap();
        service
            .set_procurement_mode(conditional_id, "honsen_self_purchase".into(), now)
            .unwrap();
        service
            .submit_requisition_draft(conditional_id, now)
            .unwrap();
        service.confirm_requisition(conditional_id, now).unwrap();
        service
            .start_honsen_market_execution(conditional_id, now)
            .unwrap();
        assert_eq!(
            service.close_supplier_order_with_conditions(
                conditional_id,
                "not yet received".into(),
                now
            ),
            Err(AuthError::Forbidden)
        );
        service
            .record_receipt(
                RecordReceiptInput {
                    id: Uuid::new_v4(),
                    order_id: conditional_id,
                    received_at: "2026-10-11".into(),
                    receiver_id: purchaser_id,
                    over_receipt_reason: None,
                    attachment_ids: vec![],
                    items: vec![ReceiptItemInput {
                        order_item_id: market_draft.lines[0].id,
                        quantity: "1".into(),
                        unit: "pcs".into(),
                    }],
                },
                now,
            )
            .unwrap();
        service
            .close_supplier_order_with_conditions(
                conditional_id,
                "market short delivery".into(),
                now,
            )
            .unwrap();
        let conditional_status: String = service
            .connection
            .lock()
            .unwrap()
            .query_row(
                "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1",
                [conditional_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(conditional_status, "completed_with_conditions");
        let market_summary: (i64, i64, i64) = service.connection.lock().unwrap().query_row(
            "SELECT (SELECT COUNT(*) FROM local_purchase_orders WHERE parent_order_id = ?1), (SELECT COUNT(*) FROM local_rfqs WHERE source_order_id = ?1), (SELECT COUNT(*) FROM local_order_audit_entries WHERE order_id = ?1 AND action = 'market_execution_started')",
            [market_id.to_string()], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();
        assert_eq!(market_summary, (0, 0, 1));
    }

    #[test]
    fn receipt_attachment_migration_preserves_vouchers_and_allows_receipts() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
            CREATE TABLE local_purchase_orders (id TEXT PRIMARY KEY);
            CREATE TABLE local_projects (id TEXT PRIMARY KEY);
            CREATE TABLE local_procurement_expenditures (id TEXT PRIMARY KEY);
            INSERT INTO local_purchase_orders VALUES ('order-1');
            INSERT INTO local_projects VALUES ('project-1');
            INSERT INTO local_procurement_expenditures VALUES ('expense-1');",
            )
            .unwrap();
        connection
            .execute_batch(include_str!("../migrations/0033_local_attachments.sql"))
            .unwrap();
        connection
            .execute(
                "INSERT INTO local_attachments
            (id, owner_type, owner_id, order_id, project_id, original_name, content_type,
             byte_length, local_path, checksum, uploader_id, created_at)
            VALUES ('voucher-1', 'procurement_expenditure', 'expense-1', 'order-1',
                    'project-1', 'voucher.pdf', 'application/pdf', 4, 'managed/path', 'abcd',
                    'actor-1', 1)",
                [],
            )
            .unwrap();
        connection
            .execute_batch(include_str!("../migrations/0034_receipt_attachments.sql"))
            .unwrap();
        let voucher: (String, String) = connection
            .query_row(
                "SELECT owner_id, local_path FROM local_attachments WHERE id = 'voucher-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(voucher, ("expense-1".into(), "managed/path".into()));
        connection
            .execute(
                "INSERT INTO local_attachments
            (id, owner_type, owner_id, order_id, project_id, original_name, content_type,
             byte_length, local_path, checksum, uploader_id, created_at)
            VALUES ('receipt-photo-1', 'receipt', 'receipt-1', 'order-1', 'project-1',
                    'delivery.jpg', 'image/jpeg', 4, 'managed/photo', 'abcd', 'actor-1', 2)",
                [],
            )
            .unwrap();
        let fk_errors: i64 = connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(fk_errors, 0);
    }

    #[test]
    fn legacy_receipt_link_migration_preserves_links_without_requiring_local_bytes() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE local_receipts (id TEXT PRIMARY KEY);
                 CREATE TABLE local_order_attachments (id TEXT PRIMARY KEY);
                 CREATE TABLE local_receipt_attachment_links (
                   receipt_id TEXT NOT NULL REFERENCES local_receipts(id),
                   attachment_id TEXT NOT NULL REFERENCES local_order_attachments(id),
                   PRIMARY KEY (receipt_id, attachment_id)
                 );
                 INSERT INTO local_receipts VALUES ('receipt-1');
                 INSERT INTO local_order_attachments VALUES ('attachment-1');
                 INSERT INTO local_receipt_attachment_links VALUES ('receipt-1', 'attachment-1');",
            )
            .unwrap();
        connection
            .execute_batch(include_str!(
                "../migrations/0035_legacy_receipt_attachment_links.sql"
            ))
            .unwrap();
        let preserved: String = connection
            .query_row(
                "SELECT attachment_id FROM local_receipt_attachment_links WHERE receipt_id = 'receipt-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(preserved, "attachment-1");
        connection
            .execute(
                "INSERT INTO local_receipt_attachment_links (receipt_id, attachment_id) VALUES ('receipt-1', 'remote-not-yet-downloaded')",
                [],
            )
            .unwrap();
        let link_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_receipt_attachment_links WHERE receipt_id = 'receipt-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(link_count, 2);
    }

    #[test]
    fn receipt_photo_compression_downsizes_jpeg_and_rejects_invalid_bytes() {
        let source =
            std::env::temp_dir().join(format!("honsen-receipt-photo-{}.jpg", Uuid::new_v4()));
        let target =
            std::env::temp_dir().join(format!("honsen-receipt-photo-{}.jpg", Uuid::new_v4()));
        image::RgbImage::from_pixel(3_000, 2_400, image::Rgb([32, 64, 128]))
            .save_with_format(&source, ImageFormat::Jpeg)
            .unwrap();
        let mut output = fs::File::create(&target).unwrap();
        let compressed = compress_receipt_photo(&source, "image/jpeg", &mut output).unwrap();
        drop(output);
        let decoded = ImageReader::open(&target).unwrap().decode().unwrap();
        assert!(decoded.width() <= RECEIPT_PHOTO_MAX_DIMENSION);
        assert!(decoded.height() <= RECEIPT_PHOTO_MAX_DIMENSION);
        assert_eq!(compressed, fs::metadata(&target).unwrap().len());
        fs::write(&source, b"not an image").unwrap();
        let mut invalid = fs::File::create(&target).unwrap();
        assert_eq!(
            compress_receipt_photo(&source, "image/jpeg", &mut invalid),
            Err(AuthError::InvalidInput)
        );
        drop(invalid);
        fs::remove_file(source).unwrap();
        fs::remove_file(target).unwrap();
    }

    #[test]
    fn receipt_photo_compression_preserves_png_alpha_and_bounds() {
        let source =
            std::env::temp_dir().join(format!("honsen-receipt-photo-{}.png", Uuid::new_v4()));
        let target =
            std::env::temp_dir().join(format!("honsen-receipt-photo-{}.png", Uuid::new_v4()));
        image::RgbaImage::from_pixel(2_500, 2_100, image::Rgba([1, 2, 3, 127]))
            .save(&source)
            .unwrap();
        let mut output = fs::File::create(&target).unwrap();
        compress_receipt_photo(&source, "image/png", &mut output).unwrap();
        drop(output);
        let decoded = ImageReader::open(&target)
            .unwrap()
            .decode()
            .unwrap()
            .to_rgba8();
        assert!(
            decoded.width() <= RECEIPT_PHOTO_MAX_DIMENSION
                && decoded.height() <= RECEIPT_PHOTO_MAX_DIMENSION
        );
        assert_eq!(decoded.get_pixel(0, 0)[3], 127);
        fs::remove_file(source).unwrap();
        fs::remove_file(target).unwrap();
    }

    #[test]
    fn attachment_download_write_is_atomic_and_leaves_no_partial_file() {
        let directory = std::env::temp_dir().join(format!("honsen-attachment-{}", Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let target = directory.join("attachment");
        write_attachment_bytes_atomically(&target, b"verified bytes").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"verified bytes");
        assert!(fs::read_dir(&directory).unwrap().all(|entry| {
            !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains("partial-")
        }));
        fs::remove_file(target).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn requisition_migration_upgrades_the_previous_image_schema() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE local_schema_migrations (
                    version TEXT PRIMARY KEY,
                    checksum TEXT NOT NULL,
                    applied_at INTEGER NOT NULL
                );",
            )
            .unwrap();
        for (version, sql) in [
            (
                "0001_local_auth",
                include_str!("../migrations/0001_local_auth.sql"),
            ),
            (
                "0002_master_data",
                include_str!("../migrations/0002_master_data.sql"),
            ),
            (
                "0003_reference_master_data",
                include_str!("../migrations/0003_reference_master_data.sql"),
            ),
            (
                "0004_local_catalog",
                include_str!("../migrations/0004_local_catalog.sql"),
            ),
            (
                "0005_local_material_images",
                include_str!("../migrations/0005_local_material_images.sql"),
            ),
        ] {
            connection.execute_batch(sql).unwrap();
            connection
                .execute(
                    "INSERT INTO local_schema_migrations (version, checksum, applied_at) VALUES (?1, ?2, 0)",
                    params![version, format!("{:x}", Sha256::digest(sql.as_bytes()))],
                )
                .unwrap();
        }
        for (version, sql) in [
            (
                "0006_local_requisitions",
                include_str!("../migrations/0006_local_requisitions.sql"),
            ),
            (
                "0007_order_workflow",
                include_str!("../migrations/0007_order_workflow.sql"),
            ),
            (
                "0008_approval_policy",
                include_str!("../migrations/0008_approval_policy.sql"),
            ),
            (
                "0009_order_notifications",
                include_str!("../migrations/0009_order_notifications.sql"),
            ),
            (
                "0010_supplier_child_orders",
                include_str!("../migrations/0010_supplier_child_orders.sql"),
            ),
        ] {
            connection.execute_batch(sql).unwrap();
            connection
                .execute(
                    "INSERT INTO local_schema_migrations (version, checksum, applied_at) VALUES (?1, ?2, 0)",
                    params![version, format!("{:x}", Sha256::digest(sql.as_bytes()))],
                )
                .unwrap();
        }
        let country_id = Uuid::new_v4().to_string();
        let project_id = Uuid::new_v4().to_string();
        let department_id = Uuid::new_v4().to_string();
        let team_id = Uuid::new_v4().to_string();
        let order_id = Uuid::new_v4().to_string();
        let item_id = Uuid::new_v4().to_string();
        connection.execute("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES (?1, 'MIG-C', 'migration country', 'UTC', 1, 1)", [&country_id]).unwrap();
        connection.execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, 'MIG-P', 'migration project', 'migration site', 'migration department', 'CNY', 'zh_en', 1, 1)", params![project_id, country_id]).unwrap();
        connection.execute("INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES (?1, 'MIG-D', 'migration department', 1, 1)", [&department_id]).unwrap();
        connection.execute("INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES (?1, ?2, 'MIG-T', 'migration team', 1, 1)", params![team_id, department_id]).unwrap();
        connection.execute("INSERT INTO local_purchase_orders (id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, currency, primary_currency, language_pair, status, workflow_status, urgency, order_date, delivery_address, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, version, created_at, updated_at) VALUES (?1, 'MIG-ORDER', ?2, ?3, 'migration site', ?4, ?5, 'migration-applicant', 'CNY', 'CNY', 'zh_en', 'draft', 'draft', 'normal', '2026-10-11', 'migration address', 0, 0, 0, 0, 0, 0, 0, 1, 0, 0)", params![order_id, country_id, project_id, department_id, team_id]).unwrap();
        connection.execute("INSERT INTO local_purchase_order_items (id, order_id, material_snapshot_json, quantity_decimal, unit, unit_price_minor, line_total_minor, sort_order, created_at, updated_at) VALUES (?1, ?2, '{\"nameZh\":\"migration material\"}', '1', 'pcs', 100, 100, 0, 0, 0)", params![item_id, order_id]).unwrap();

        let expenditure_before: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_procurement_expenditures'", [], |row| row.get(0)).unwrap();
        assert_eq!(expenditure_before, 0);
        migrate(&mut connection).unwrap();
        migrate(&mut connection).unwrap();

        let image_column_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_material_images') WHERE name = 'source_file_name'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(image_column_exists, 1);
        let freight_column_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_purchase_order_items') WHERE name = 'line_freight_json'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(freight_column_exists, 1);
        let item_currency_column_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_purchase_order_items') WHERE name = 'currency'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(item_currency_column_exists, 1);
        let migrated_item_currency: String = connection
            .query_row(
                "SELECT currency FROM local_purchase_order_items WHERE id = ?1",
                [item_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(migrated_item_currency, "CNY");
        let workflow_column_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_purchase_orders') WHERE name = 'workflow_status'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(workflow_column_exists, 1);
        let preserved_status: String = connection
            .query_row(
                "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1",
                [&order_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(preserved_status, "draft");
        assert!(
            connection
                .execute(
                    "UPDATE local_purchase_orders SET workflow_status = 'invalid' WHERE id = ?1",
                    [&order_id]
                )
                .is_err()
        );
        connection
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'executing' WHERE id = ?1",
                [&order_id],
            )
            .unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT workflow_status FROM local_purchase_orders WHERE id = ?1",
                    [&order_id],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "executing"
        );
        let broken_references: i64 = connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(broken_references, 0);
        connection
            .execute(
                "UPDATE local_purchase_orders SET workflow_status = 'draft' WHERE id = ?1",
                [&order_id],
            )
            .unwrap();
        let audit_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_order_audit_entries'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(audit_table_exists, 1);
        let self_approved_column_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_purchase_orders') WHERE name = 'self_approved'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(self_approved_column_exists, 1);
        let approval_policy_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_approval_policy'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(approval_policy_table_exists, 1);
        let notification_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_order_notifications'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(notification_table_exists, 1);
        let supplier_child_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_supplier_order_allocations'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(supplier_child_table_exists, 1);
        let rfq_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_rfqs'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(rfq_table_exists, 1);
        let receipt_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_receipts'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(receipt_table_exists, 1);
        let expenditure_table_exists: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_procurement_expenditures'", [], |row| row.get(0)).unwrap();
        assert_eq!(expenditure_table_exists, 1);
        let expenditure_id = Uuid::new_v4().to_string();
        connection.execute(
            "INSERT INTO local_procurement_expenditures (id, order_id, project_id, counterparty_type, payee_name, currency, amount_minor, payment_date, payment_method, payment_handler_id, status, created_by, created_at) VALUES (?1, ?2, ?3, 'market_casual', 'fixture payee', 'XOF', 1, '2026-10-13', 'cash', ?4, 'recorded', ?4, 1)",
            params![expenditure_id, &order_id, &project_id, Uuid::new_v4().to_string()],
        ).unwrap();
        assert!(connection.execute(
            "INSERT INTO local_procurement_expenditures (id, order_id, project_id, counterparty_type, payee_name, currency, amount_minor, payment_date, payment_method, payment_handler_id, status, corrects_expenditure_id, created_by, created_at) VALUES (?1, ?2, ?3, 'market_casual', 'fixture payee', 'XOF', 1, '2026-10-13', 'cash', ?4, 'reversed', ?5, ?4, 2)",
            params![Uuid::new_v4().to_string(), &order_id, &project_id, Uuid::new_v4().to_string(), expenditure_id],
        ).is_err());
        let supplier_terms_column_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_purchase_orders') WHERE name = 'supplier_terms_completed_at'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(supplier_terms_column_exists, 1);
        let receipt_attachment_link_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_receipt_attachment_links'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(receipt_attachment_link_table_exists, 1);
        let sync_state_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_sync_state'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(sync_state_table_exists, 1);
        let remote_entities_table_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'local_sync_remote_entities'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remote_entities_table_exists, 1);
        let exchange_rate_tombstone_column_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_exchange_rates') WHERE name = 'deleted_at'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exchange_rate_tombstone_column_exists, 1);
        let procurement_mode_column_exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('local_purchase_orders') WHERE name = 'procurement_mode'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(procurement_mode_column_exists, 1);
        let migrated_order: (Option<String>, String, String, i64, String) = connection
            .query_row(
                "SELECT procurement_mode, status, workflow_status, total_minor, display_no FROM local_purchase_orders WHERE id = ?1",
                [order_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();
        assert_eq!(
            migrated_order,
            (None, "draft".into(), "draft".into(), 0, "MIG-ORDER".into())
        );
    }

    #[test]
    fn currency_expansion_upgrades_a_file_database_without_rewriting_history() {
        let path = std::env::temp_dir().join(format!("currency-upgrade-{}.sqlite", Uuid::new_v4()));
        let mut connection = Connection::open(&path).unwrap();
        connection.execute_batch("PRAGMA foreign_keys = ON; CREATE TABLE local_schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);").unwrap();
        for (version, sql) in [
            (
                "0001_local_auth",
                include_str!("../migrations/0001_local_auth.sql"),
            ),
            (
                "0002_master_data",
                include_str!("../migrations/0002_master_data.sql"),
            ),
            (
                "0003_reference_master_data",
                include_str!("../migrations/0003_reference_master_data.sql"),
            ),
            (
                "0004_local_catalog",
                include_str!("../migrations/0004_local_catalog.sql"),
            ),
            (
                "0005_local_material_images",
                include_str!("../migrations/0005_local_material_images.sql"),
            ),
            (
                "0006_local_requisitions",
                include_str!("../migrations/0006_local_requisitions.sql"),
            ),
            (
                "0007_order_workflow",
                include_str!("../migrations/0007_order_workflow.sql"),
            ),
            (
                "0008_approval_policy",
                include_str!("../migrations/0008_approval_policy.sql"),
            ),
            (
                "0009_order_notifications",
                include_str!("../migrations/0009_order_notifications.sql"),
            ),
            (
                "0010_supplier_child_orders",
                include_str!("../migrations/0010_supplier_child_orders.sql"),
            ),
            (
                "0011_order_item_currency",
                include_str!("../migrations/0011_order_item_currency.sql"),
            ),
            ("0012_rfqs", include_str!("../migrations/0012_rfqs.sql")),
            (
                "0013_receipts",
                include_str!("../migrations/0013_receipts.sql"),
            ),
            (
                "0014_supplier_child_terms",
                include_str!("../migrations/0014_supplier_child_terms.sql"),
            ),
            (
                "0015_receipt_attachment_links",
                include_str!("../migrations/0015_receipt_attachment_links.sql"),
            ),
            (
                "0016_local_sync_outbox",
                include_str!("../migrations/0016_local_sync_outbox.sql"),
            ),
            (
                "0017_local_sync_state",
                include_str!("../migrations/0017_local_sync_state.sql"),
            ),
            (
                "0018_local_sync_remote_entities",
                include_str!("../migrations/0018_local_sync_remote_entities.sql"),
            ),
            (
                "0019_local_exchange_rate_tombstones",
                include_str!("../migrations/0019_local_exchange_rate_tombstones.sql"),
            ),
            (
                "0020_local_sync_outbox_superseded",
                include_str!("../migrations/0020_local_sync_outbox_superseded.sql"),
            ),
            (
                "0021_local_sync_conflict_server_operation",
                include_str!("../migrations/0021_local_sync_conflict_server_operation.sql"),
            ),
            (
                "0022_owner_purchase_pricing",
                include_str!("../migrations/0022_owner_purchase_pricing.sql"),
            ),
            (
                "0023_material_categories",
                include_str!("../migrations/0023_material_categories.sql"),
            ),
        ] {
            connection.execute_batch(sql).unwrap();
            connection
                .execute(
                    "INSERT INTO local_schema_migrations VALUES (?1, ?2, 0)",
                    params![version, format!("{:x}", Sha256::digest(sql.as_bytes()))],
                )
                .unwrap();
        }
        connection.execute_batch("INSERT INTO local_countries VALUES ('c', 'CI', 'country', 'UTC', 1, 1, NULL); INSERT INTO local_projects VALUES ('p', 'c', 'P', 'project', 'site', 'dept', 'XOF', 'zh_fr', 1, 1, NULL); INSERT INTO local_departments VALUES ('d', 'D', 'dept', 1, 1, NULL); INSERT INTO local_teams VALUES ('t', 'd', 'T', 'team', 1, 1, NULL); INSERT INTO local_materials (id, sku, name_zh, aliases_json, model, specification, unit, is_active, version) VALUES ('m', 'M', 'material', '[]', 'model', 'spec', 'pcs', 1, 1); INSERT INTO local_suppliers (id, business_code, name, is_active, version) VALUES ('s', 'S', 'supplier', 1, 1); INSERT INTO local_material_prices VALUES ('mp', 'm', 's', 'XOF', 1, 'pcs', '2026-01-01', NULL, 1, 1, NULL); INSERT INTO local_purchase_orders (id, display_no, country_id, project_id, site, department_id, team_id, applicant_id, currency, primary_currency, language_pair, status, workflow_status, urgency, order_date, delivery_address, subtotal_minor, line_discount_minor, order_discount_minor, freight_minor, tax_rate_basis_points, tax_minor, total_minor, version, created_at, updated_at) VALUES ('o', 'O', 'c', 'p', 'site', 'd', 't', 'a', 'XOF', 'XOF', 'zh_fr', 'draft', 'draft', 'normal', '2026-01-01', 'address', 1,0,0,0,0,0,1,1,0,0); INSERT INTO local_purchase_order_items (id, order_id, material_snapshot_json, quantity_decimal, unit, unit_price_minor, line_total_minor, sort_order, created_at, updated_at, currency) VALUES ('i', 'o', '{}', '1', 'pcs', 1, 1, 0, 0, 0, 'XOF'); INSERT INTO local_rfqs VALUES ('r', 'o', 's', '{}', 'R', 'XOF', 'draft', 'a', 0, 0);").unwrap();
        connection.execute("INSERT INTO local_project_print_defaults (project_id, department_title, company_address, company_contact, default_currency, default_language_pair, updated_at) VALUES ('p', 'old department', 'old address', 'old contact', 'XOF', 'zh_fr', 1)", []).unwrap();
        migrate(&mut connection).unwrap();
        assert_eq!(connection.query_row("SELECT company_contact FROM local_project_print_defaults WHERE project_id = 'p'", [], |row| row.get::<_, String>(0)).unwrap(), "old contact");
        assert_eq!(
            connection
                .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM local_purchase_orders", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            1
        );
        connection.execute("INSERT INTO local_exchange_rates (id, from_currency, to_currency, rate_decimal, effective_at, source, reason, version) VALUES ('rate', 'XAF', 'ETB', '1.25', '2026-01-01', 'manual', 'fixture reason', 1)", []).unwrap();
        connection.execute("INSERT INTO local_projects VALUES ('etb-project', 'c', 'ETB-P', 'ETB', 'site', 'dept', 'ETB', 'zh_en', 1, 1, NULL)", []).unwrap();
        connection.execute("INSERT INTO local_project_print_defaults (project_id, department_title, company_address, company_contact, default_currency, default_language_pair, updated_at) VALUES ('etb-project', 'new department', 'new address', NULL, 'ETB', 'zh_fr', 2)", []).unwrap();
        assert_eq!(connection.query_row("SELECT COUNT(*) FROM local_schema_migrations WHERE version = '0024_currency_expansion'", [], |row| row.get::<_, i64>(0)).unwrap(), 1);
        migrate(&mut connection).unwrap();
        assert_eq!(connection.query_row("SELECT COUNT(*) FROM local_schema_migrations WHERE version = '0024_currency_expansion'", [], |row| row.get::<_, i64>(0)).unwrap(), 1);
        drop(connection);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn supplier_country_isolation_uses_file_sqlite_for_catalog_and_requisition() {
        let path =
            std::env::temp_dir().join(format!("honsen-supplier-country-{}.sqlite", Uuid::new_v4()));
        let service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
        let now = SystemTime::now();
        let engineer = account();
        service
            .cache_verified_account(engineer.clone(), "correct-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                &engineer.username,
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();

        let (
            ci,
            cm,
            ci_project,
            cm_project,
            department,
            team,
            material,
            ci_supplier,
            legacy_supplier,
            ci_price,
            legacy_price,
        ) = (
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
        );
        let connection = service.connection.lock().unwrap();
        connection.execute_batch("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES ('placeholder', 'ZZ', 'placeholder', 'UTC', 1, 1);").unwrap();
        connection
            .execute(
                "UPDATE local_countries SET id = ?1, business_code = 'CI' WHERE id = 'placeholder'",
                [ci.to_string()],
            )
            .unwrap();
        connection.execute("INSERT INTO local_countries (id, business_code, name, time_zone, is_active, version) VALUES (?1, 'CM', 'Cameroon', 'UTC', 1, 1)", [cm.to_string()]).unwrap();
        connection.execute("INSERT INTO local_projects (id, country_id, business_code, name, site, department_name, default_currency, default_language_pair, is_active, version) VALUES (?1, ?2, 'CI-P', 'CI project', 'site', 'dept', 'XOF', 'zh_fr', 1, 1), (?3, ?4, 'CM-P', 'CM project', 'site', 'dept', 'XAF', 'zh_fr', 1, 1)", params![ci_project.to_string(), ci.to_string(), cm_project.to_string(), cm.to_string()]).unwrap();
        connection.execute("INSERT INTO local_departments (id, business_code, name, is_active, version) VALUES (?1, 'D', 'dept', 1, 1)", [department.to_string()]).unwrap();
        connection.execute("INSERT INTO local_teams (id, department_id, business_code, name, is_active, version) VALUES (?1, ?2, 'T', 'team', 1, 1)", params![team.to_string(), department.to_string()]).unwrap();
        connection.execute("INSERT INTO local_materials (id, sku, name_zh, aliases_json, model, specification, unit, is_active, version) VALUES (?1, 'GLOBAL-SKU', 'global material', '[]', 'M', 'S', 'bag', 1, 1)", [material.to_string()]).unwrap();
        connection.execute("INSERT INTO local_suppliers (id, business_code, name, country_id, is_active, is_blacklisted, version) VALUES (?1, 'CI-SUP', 'CI supplier', ?2, 1, 0, 1), (?3, 'LEGACY-SUP', 'legacy supplier', NULL, 1, 0, 1)", params![ci_supplier.to_string(), ci.to_string(), legacy_supplier.to_string()]).unwrap();
        connection.execute("INSERT INTO local_material_prices (id, material_id, supplier_id, currency, unit_price_minor, unit, effective_at, is_active, version) VALUES (?1, ?2, ?3, 'XOF', 5600, 'bag', '2026-10-12', 1, 1), (?4, ?2, ?5, 'XOF', 5700, 'bag', '2026-10-12', 1, 1)", params![ci_price.to_string(), material.to_string(), ci_supplier.to_string(), legacy_price.to_string(), legacy_supplier.to_string()]).unwrap();
        drop(connection);
        grant_test_scope(&service, engineer.id, ci_project, department, team, now);

        let ci_catalog = service
            .search_catalog("global", Some(ci_project), now)
            .unwrap();
        assert_eq!(ci_catalog[0].prices.len(), 1);
        assert_eq!(ci_catalog[0].prices[0].supplier_id, ci_supplier);
        assert_eq!(
            service.search_catalog("global", None, now).unwrap()[0]
                .prices
                .len(),
            1
        );
        assert_eq!(service.list_suppliers(now).unwrap().len(), 1);
        assert!(
            service
                .search_catalog("global", Some(cm_project), now)
                .unwrap()[0]
                .prices
                .is_empty()
        );

        let cross_country = RequisitionDraftInput {
            id: Uuid::new_v4(),
            display_no: "CM-DRAFT-1".into(),
            country_id: cm,
            project_id: cm_project,
            site: "site".into(),
            department_id: department,
            team_id: team,
            applicant_id: engineer.id,
            currency: "XAF".into(),
            primary_currency: "XAF".into(),
            language_pair: "zh_fr".into(),
            urgency: "normal".into(),
            urgency_reason: None,
            order_date: "2026-10-12".into(),
            delivery_address: "address".into(),
            expected_delivery_date: None,
            notes: None,
            order_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
            order_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
            tax_rate_basis_points: 0,
            lines: vec![RequisitionLineInput {
                id: Uuid::new_v4(),
                material_id: Some(material),
                material_snapshot: MaterialSnapshotInput {
                    name_zh: "forged".into(),
                    name_fr: None,
                    model: "M".into(),
                    specification: "S".into(),
                },
                supplier_id: Some(ci_supplier),
                currency: "XAF".into(),
                quantity: "1".into(),
                unit: "bag".into(),
                unit_price_minor: "1".into(),
                line_discount: AdjustmentInput::FixedMinor { minor: "0".into() },
                line_freight: AdjustmentInput::FixedMinor { minor: "0".into() },
                freight_included: false,
                sort_order: 0,
            }],
        };
        assert_eq!(
            service.save_requisition_draft(cross_country.clone(), now),
            Err(AuthError::Forbidden)
        );
        grant_test_scope(&service, engineer.id, cm_project, department, team, now);
        assert_eq!(
            service.save_requisition_draft(cross_country, now),
            Err(AuthError::InvalidInput)
        );
        let cm_supplier = Uuid::new_v4();
        let cm_price = Uuid::new_v4();
        service.connection.lock().unwrap().execute(
            "INSERT INTO local_suppliers (id, business_code, name, country_id, is_active, is_blacklisted, version) VALUES (?1, 'CM-SUP', 'CM supplier', ?2, 1, 0, 1)",
            params![cm_supplier.to_string(), cm.to_string()],
        ).unwrap();
        service.connection.lock().unwrap().execute(
            "INSERT INTO local_material_prices (id, material_id, supplier_id, currency, unit_price_minor, unit, effective_at, is_active, version) VALUES (?1, ?2, ?3, 'XAF', 5800, 'bag', '2026-10-12', 1, 1)",
            params![cm_price.to_string(), material.to_string(), cm_supplier.to_string()],
        ).unwrap();
        assert_eq!(service.list_suppliers(now).unwrap().len(), 2);
        service.connection.lock().unwrap().execute(
            "DELETE FROM local_authorization_snapshots WHERE account_id = ?1 AND project_id = ?2",
            params![engineer.id.to_string(), ci_project.to_string()],
        ).unwrap();
        let visible_suppliers = service.list_suppliers(now).unwrap();
        assert_eq!(visible_suppliers.len(), 1);
        assert_eq!(visible_suppliers[0].id, cm_supplier);
        let visible_quotes = service.search_catalog("global", None, now).unwrap();
        assert_eq!(visible_quotes[0].prices.len(), 1);
        assert_eq!(visible_quotes[0].prices[0].supplier_id, cm_supplier);
        assert!(
            service
                .search_catalog("global", Some(ci_project), now)
                .unwrap()[0]
                .prices
                .is_empty()
        );
        service.connection.lock().unwrap().execute(
            "UPDATE local_authorization_snapshots SET verified_at = ?1, expires_at = ?2 WHERE account_id = ?3 AND project_id = ?4",
            params![unix_seconds(now) - 2, unix_seconds(now) - 1, engineer.id.to_string(), cm_project.to_string()],
        ).unwrap();
        assert!(service.list_suppliers(now).unwrap().is_empty());
        let expired_catalog = service.search_catalog("global", None, now).unwrap();
        assert_eq!(expired_catalog.len(), 1);
        assert!(expired_catalog[0].prices.is_empty());
        let connection = service.connection.lock().unwrap();
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM local_purchase_orders", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM local_sync_outbox", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        drop(connection);
        drop(service);
        std::fs::remove_file(path).unwrap();
    }
}
