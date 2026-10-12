use std::{
    collections::{BTreeMap, HashSet},
    time::SystemTime,
};

use rusqlite::{OptionalExtension, Transaction, params, params_from_iter, types::Value};
use serde::{Deserialize, Serialize};
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

use super::{
    AuthError, LocalAuthService, insert_local_sync_outbox, unix_seconds, valid_business_code,
    valid_currency, valid_iso_date, valid_non_zero_decimal_rate,
};

#[derive(Debug, Error)]
pub enum SeedImportError {
    #[error("seed JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("seed validation failed: {0}")]
    Invalid(String),
    #[error("existing data conflicts with seed: {0}")]
    Conflict(String),
    #[error("seed database operation failed")]
    Database(#[from] rusqlite::Error),
    #[error("seed authorization failed: {0}")]
    Auth(#[from] AuthError),
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct SeedImportReport {
    pub inserted: BTreeMap<String, usize>,
    pub skipped: BTreeMap<String, usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SeedFile {
    schema_version: u8,
    countries: Vec<Country>,
    projects: Vec<Project>,
    sites: Vec<Site>,
    departments: Vec<Basic>,
    teams: Vec<Team>,
    units: Vec<Basic>,
    tax_templates: Vec<Tax>,
    project_defaults: Vec<Defaults>,
    material_categories: Vec<Basic>,
    materials: Vec<Material>,
    suppliers: Vec<Supplier>,
    material_prices: Vec<Price>,
    exchange_rates: Vec<Rate>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Basic {
    code: String,
    name: String,
    is_active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Country {
    code: String,
    name: String,
    time_zone: String,
    is_active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Project {
    code: String,
    country_code: String,
    name: String,
    site: String,
    department_name: String,
    default_currency: String,
    default_language_pair: String,
    is_active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Site {
    code: String,
    project_code: String,
    name: String,
    is_active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Team {
    code: String,
    department_code: String,
    name: String,
    is_active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Tax {
    code: String,
    name: String,
    country_code: Option<String>,
    rate_basis_points: i64,
    effective_at: String,
    is_active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Defaults {
    project_code: String,
    department_title: String,
    company_address: String,
    company_contact: Option<String>,
    default_currency: String,
    default_language_pair: String,
    default_tax_code: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Material {
    sku: String,
    name_zh: String,
    name_fr: Option<String>,
    category_code: Option<String>,
    specification: String,
    model: String,
    brand: Option<String>,
    unit_code: String,
    #[serde(default)]
    aliases: Vec<String>,
    notes: Option<String>,
    is_active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Supplier {
    code: String,
    name: String,
    country_code: String,
    city: Option<String>,
    contact_name: Option<String>,
    phone: Option<String>,
    #[serde(rename = "whatsApp")]
    whatsapp: Option<String>,
    email: Option<String>,
    address: Option<String>,
    payment_terms: Option<String>,
    delivery_lead_time: Option<String>,
    is_preferred: bool,
    is_blacklisted: bool,
    is_active: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Price {
    material_sku: String,
    supplier_code: String,
    currency: String,
    unit_price_minor: String,
    unit_code: String,
    effective_at: String,
    source_note: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Rate {
    from_currency: String,
    to_currency: String,
    rate_decimal: String,
    effective_at: String,
    source: String,
    reason: Option<String>,
}

fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}
fn optional_text(value: Option<&str>) -> Value {
    value.map_or(Value::Null, text)
}
fn integer(value: bool) -> Value {
    Value::Integer(i64::from(value))
}
fn required(value: &str, max: usize, label: &str) -> Result<(), SeedImportError> {
    if value.trim().is_empty() || value.len() > max {
        return Err(SeedImportError::Invalid(label.into()));
    }
    Ok(())
}
fn code(value: &str) -> Result<(), SeedImportError> {
    if !valid_business_code(value) {
        return Err(SeedImportError::Invalid(format!(
            "invalid business code: {value}"
        )));
    }
    Ok(())
}
fn currency(value: &str) -> Result<(), SeedImportError> {
    if !valid_currency(value) {
        return Err(SeedImportError::Invalid(format!(
            "unsupported currency: {value}"
        )));
    }
    Ok(())
}
fn date(value: &str) -> Result<(), SeedImportError> {
    if !valid_iso_date(value) {
        return Err(SeedImportError::Invalid(format!("invalid date: {value}")));
    }
    Ok(())
}
fn language(value: &str) -> Result<(), SeedImportError> {
    if !matches!(value, "zh_fr" | "zh_en") {
        return Err(SeedImportError::Invalid(format!(
            "unsupported language pair: {value}"
        )));
    }
    Ok(())
}
fn unique(seen: &mut HashSet<String>, key: String) -> Result<(), SeedImportError> {
    if !seen.insert(key.clone()) {
        return Err(SeedImportError::Invalid(format!(
            "duplicate seed key: {key}"
        )));
    }
    Ok(())
}
fn stable_id(table: &str, key: &str) -> Uuid {
    let hash = Sha256::digest(format!("honsen-procure-seed:{table}:{key}"));
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hash[..16]);
    bytes[6] = (bytes[6] & 15) | 0x80;
    bytes[8] = (bytes[8] & 63) | 0x80;
    Uuid::from_bytes(bytes)
}

struct Writer<'a> {
    tx: &'a Transaction<'a>,
    actor: Uuid,
    now: SystemTime,
    report: SeedImportReport,
}
impl Writer<'_> {
    fn reference(&self, table: &str, field: &str, key: &str) -> Result<String, SeedImportError> {
        // All identifiers are fixed by the call sites; only key values originate in the Seed.
        let sql = format!(
            "SELECT id FROM {table} WHERE {field} = ?1 AND is_active = 1 AND deleted_at IS NULL"
        );
        self.tx
            .query_row(&sql, [key], |row| row.get(0))
            .optional()?
            .ok_or_else(|| {
                SeedImportError::Invalid(format!("missing or inactive {table} reference: {key}"))
            })
    }
    fn ensure(
        &mut self,
        table: &str,
        entity_type: &str,
        business_key: &str,
        key: &[(&str, Value)],
        cols: &[(&str, Value)],
        payload: impl FnOnce(&str) -> JsonValue,
    ) -> Result<String, SeedImportError> {
        let where_sql = key
            .iter()
            .map(|(name, _)| format!("{name} = ?"))
            .collect::<Vec<_>>()
            .join(" AND ");
        let defaults = table == "local_project_print_defaults";
        let select_sql = format!(
            "SELECT {}, {}, {} FROM {table} WHERE {where_sql}",
            if defaults { "project_id" } else { "id" },
            cols.iter()
                .map(|(name, _)| *name)
                .collect::<Vec<_>>()
                .join(", "),
            if defaults {
                "0"
            } else {
                "COALESCE(deleted_at, 0)"
            }
        );
        let mut statement = self.tx.prepare(&select_sql)?;
        let mut rows = statement.query(params_from_iter(key.iter().map(|(_, value)| value)))?;
        if let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            let matches = cols.iter().enumerate().all(|(index, (_, expected))| {
                row.get::<_, Value>(index + 1)
                    .is_ok_and(|actual| actual == *expected)
            });
            let deleted: i64 = row.get(cols.len() + 1)?;
            if rows.next()?.is_some() || !matches || deleted != 0 {
                return Err(SeedImportError::Conflict(format!("{table}:{business_key}")));
            }
            *self.report.skipped.entry(entity_type.into()).or_default() += 1;
            return Ok(id);
        }
        drop(rows);
        drop(statement);
        let id = if defaults {
            match &key[0].1 {
                Value::Text(value) => value.clone(),
                _ => return Err(SeedImportError::Invalid("invalid project key".into())),
            }
        } else {
            stable_id(table, business_key).to_string()
        };
        let mut names = if defaults {
            Vec::new()
        } else {
            vec!["id".to_owned()]
        };
        let mut values = if defaults {
            Vec::new()
        } else {
            vec![text(&id)]
        };
        for (name, value) in key.iter().chain(cols.iter()) {
            if *name != "id" && !names.iter().any(|existing| existing == name) {
                names.push((*name).into());
                values.push(value.clone());
            }
        }
        names.push("version".into());
        values.push(Value::Integer(1));
        if defaults {
            names.push("updated_at".into());
            values.push(Value::Integer(unix_seconds(self.now)));
        }
        let insert_sql = format!(
            "INSERT INTO {table} ({}) VALUES ({})",
            names.join(", "),
            vec!["?"; values.len()].join(", ")
        );
        self.tx.execute(&insert_sql, params_from_iter(&values))?;
        let payload = payload(&id).to_string();
        insert_local_sync_outbox(
            self.tx,
            entity_type,
            Uuid::parse_str(&id)
                .map_err(|_| SeedImportError::Invalid("invalid generated ID".into()))?,
            &payload,
            self.now,
        )?;
        self.tx.execute("INSERT INTO local_master_data_seed_audit (id, actor_id, entity_type, entity_id, business_key, payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![Uuid::new_v4().to_string(), self.actor.to_string(), entity_type, id, business_key, payload, unix_seconds(self.now)])?;
        *self.report.inserted.entry(entity_type.into()).or_default() += 1;
        Ok(id)
    }
}

impl LocalAuthService {
    pub fn import_master_data_seed(
        &self,
        source: &str,
        now: SystemTime,
    ) -> Result<SeedImportReport, SeedImportError> {
        self.require_master_data_mutation(now)?;
        let actor = self.active_session_user_id()?;
        let seed: SeedFile = serde_json::from_str(source)?;
        if seed.schema_version != 1 {
            return Err(SeedImportError::Invalid("unsupported schemaVersion".into()));
        }
        let mut connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let tx = connection.transaction()?;
        let mut writer = Writer {
            tx: &tx,
            actor,
            now,
            report: SeedImportReport::default(),
        };
        let mut seen = HashSet::new();
        for item in seed.countries {
            code(&item.code)?;
            required(&item.name, 255, "country name")?;
            required(&item.time_zone, 255, "timeZone")?;
            unique(&mut seen, format!("country:{}", item.code))?;
            writer.ensure("local_countries", "country", &item.code, &[("business_code", text(&item.code))], &[("name", text(&item.name)), ("time_zone", text(&item.time_zone)), ("is_active", integer(item.is_active))], |id| json!({"kind":"country","id":id,"business_code":item.code,"name":item.name,"time_zone":item.time_zone,"is_active":item.is_active,"version":1}))?;
        }
        for item in seed.projects {
            code(&item.code)?;
            required(&item.name, 255, "project name")?;
            required(&item.site, 255, "project site")?;
            required(&item.department_name, 255, "project department")?;
            currency(&item.default_currency)?;
            language(&item.default_language_pair)?;
            unique(&mut seen, format!("project:{}", item.code))?;
            let country_id =
                writer.reference("local_countries", "business_code", &item.country_code)?;
            writer.ensure("local_projects", "project", &item.code, &[("business_code", text(&item.code))], &[("country_id", text(&country_id)), ("name", text(&item.name)), ("site", text(&item.site)), ("department_name", text(&item.department_name)), ("default_currency", text(&item.default_currency)), ("default_language_pair", text(&item.default_language_pair)), ("is_active", integer(item.is_active))], |id| json!({"kind":"project","id":id,"country_id":country_id,"business_code":item.code,"name":item.name,"site":item.site,"department_name":item.department_name,"default_currency":item.default_currency,"default_language_pair":item.default_language_pair,"is_active":item.is_active,"version":1}))?;
        }
        for item in seed.sites {
            code(&item.code)?;
            required(&item.name, 255, "site name")?;
            unique(&mut seen, format!("site:{}", item.code))?;
            let project_id =
                writer.reference("local_projects", "business_code", &item.project_code)?;
            writer.ensure("local_sites", "site", &item.code, &[("business_code", text(&item.code))], &[("project_id", text(&project_id)), ("name", text(&item.name)), ("is_active", integer(item.is_active))], |id| json!({"kind":"site","id":id,"project_id":project_id,"business_code":item.code,"name":item.name,"is_active":item.is_active,"version":1}))?;
        }
        for (table, entity, items) in [
            ("local_departments", "department", seed.departments),
            ("local_units", "unit", seed.units),
            (
                "local_material_categories",
                "material_category",
                seed.material_categories,
            ),
        ] {
            for item in items {
                code(&item.code)?;
                required(&item.name, 255, "reference name")?;
                unique(&mut seen, format!("{entity}:{}", item.code))?;
                writer.ensure(table, entity, &item.code, &[("business_code", text(&item.code))], &[("name", text(&item.name)), ("is_active", integer(item.is_active))], |id| if entity == "material_category" { json!({"id":id,"businessCode":item.code,"name":item.name,"isActive":item.is_active,"version":1}) } else { json!({"kind":entity,"id":id,"business_code":item.code,"name":item.name,"is_active":item.is_active,"version":1}) })?;
            }
        }
        for item in seed.teams {
            code(&item.code)?;
            required(&item.name, 255, "team name")?;
            unique(&mut seen, format!("team:{}", item.code))?;
            let department_id =
                writer.reference("local_departments", "business_code", &item.department_code)?;
            writer.ensure("local_teams", "team", &item.code, &[("business_code", text(&item.code))], &[("department_id", text(&department_id)), ("name", text(&item.name)), ("is_active", integer(item.is_active))], |id| json!({"kind":"team","id":id,"department_id":department_id,"business_code":item.code,"name":item.name,"is_active":item.is_active,"version":1}))?;
        }
        for item in seed.tax_templates {
            code(&item.code)?;
            required(&item.name, 255, "tax name")?;
            date(&item.effective_at)?;
            unique(&mut seen, format!("tax:{}", item.code))?;
            if !(0..=100_000).contains(&item.rate_basis_points) {
                return Err(SeedImportError::Invalid(format!(
                    "invalid tax rate: {}",
                    item.code
                )));
            }
            let country_id = item
                .country_code
                .as_deref()
                .map(|key| writer.reference("local_countries", "business_code", key))
                .transpose()?;
            writer.ensure("local_tax_templates", "tax_template", &item.code, &[("business_code", text(&item.code))], &[("name", text(&item.name)), ("country_id", optional_text(country_id.as_deref())), ("rate_basis_points", Value::Integer(item.rate_basis_points)), ("effective_at", text(&item.effective_at)), ("is_active", integer(item.is_active))], |id| json!({"id":id,"businessCode":item.code,"name":item.name,"countryId":country_id,"rateBasisPoints":item.rate_basis_points,"effectiveAt":item.effective_at,"isActive":item.is_active,"version":1}))?;
        }
        for item in seed.project_defaults {
            required(&item.department_title, 255, "departmentTitle")?;
            required(&item.company_address, 1000, "companyAddress")?;
            currency(&item.default_currency)?;
            language(&item.default_language_pair)?;
            unique(&mut seen, format!("defaults:{}", item.project_code))?;
            if item
                .company_contact
                .as_deref()
                .is_some_and(|value| value.len() > 255)
            {
                return Err(SeedImportError::Invalid("companyContact too long".into()));
            }
            let project_id =
                writer.reference("local_projects", "business_code", &item.project_code)?;
            let tax_id = item
                .default_tax_code
                .as_deref()
                .map(|key| writer.reference("local_tax_templates", "business_code", key))
                .transpose()?;
            writer.ensure("local_project_print_defaults", "project_defaults", &item.project_code, &[("project_id", text(&project_id))], &[("department_title", text(&item.department_title)), ("company_address", text(&item.company_address)), ("company_contact", optional_text(item.company_contact.as_deref())), ("default_currency", text(&item.default_currency)), ("default_language_pair", text(&item.default_language_pair)), ("default_tax_template_id", optional_text(tax_id.as_deref()))], |id| json!({"projectId":id,"departmentTitle":item.department_title,"companyAddress":item.company_address,"companyContact":item.company_contact,"defaultCurrency":item.default_currency,"defaultLanguagePair":item.default_language_pair,"defaultTaxTemplateId":tax_id}))?;
        }
        for item in seed.materials {
            code(&item.sku)?;
            required(&item.name_zh, 255, "material name")?;
            required(&item.model, 255, "material model")?;
            required(&item.specification, 1000, "material specification")?;
            unique(&mut seen, format!("material:{}", item.sku))?;
            let unit_id = writer.reference("local_units", "business_code", &item.unit_code)?;
            let unit: String = writer.tx.query_row(
                "SELECT name FROM local_units WHERE id = ?1",
                [unit_id],
                |row| row.get(0),
            )?;
            let category_id = item
                .category_code
                .as_deref()
                .map(|key| writer.reference("local_material_categories", "business_code", key))
                .transpose()?;
            let aliases = serde_json::to_string(&item.aliases)?;
            writer.ensure("local_materials", "material", &item.sku, &[("sku", text(&item.sku))], &[("category_id", optional_text(category_id.as_deref())), ("name_zh", text(&item.name_zh)), ("name_fr", optional_text(item.name_fr.as_deref())), ("aliases_json", text(&aliases)), ("brand", optional_text(item.brand.as_deref())), ("model", text(&item.model)), ("specification", text(&item.specification)), ("unit", text(&unit)), ("notes", optional_text(item.notes.as_deref())), ("is_active", integer(item.is_active))], |id| json!({"id":id,"sku":item.sku,"categoryId":category_id,"nameZh":item.name_zh,"nameFr":item.name_fr,"aliases":item.aliases,"brand":item.brand,"model":item.model,"specification":item.specification,"unit":unit,"notes":item.notes,"isActive":item.is_active,"version":1}))?;
        }
        for item in seed.suppliers {
            code(&item.code)?;
            required(&item.name, 255, "supplier name")?;
            unique(&mut seen, format!("supplier:{}", item.code))?;
            let country_id =
                writer.reference("local_countries", "business_code", &item.country_code)?;
            writer.ensure("local_suppliers", "supplier", &item.code, &[("business_code", text(&item.code))], &[("name", text(&item.name)), ("country_id", text(&country_id)), ("contact_name", optional_text(item.contact_name.as_deref())), ("address", optional_text(item.address.as_deref())), ("city", optional_text(item.city.as_deref())), ("country", Value::Null), ("phone", optional_text(item.phone.as_deref())), ("whatsapp", optional_text(item.whatsapp.as_deref())), ("email", optional_text(item.email.as_deref())), ("payment_terms", optional_text(item.payment_terms.as_deref())), ("delivery_lead_time", optional_text(item.delivery_lead_time.as_deref())), ("is_preferred", integer(item.is_preferred)), ("is_blacklisted", integer(item.is_blacklisted)), ("is_active", integer(item.is_active))], |id| json!({"id":id,"businessCode":item.code,"name":item.name,"countryId":country_id,"contactName":item.contact_name,"address":item.address,"city":item.city,"country":null,"phone":item.phone,"whatsapp":item.whatsapp,"email":item.email,"paymentTerms":item.payment_terms,"deliveryLeadTime":item.delivery_lead_time,"isPreferred":item.is_preferred,"isBlacklisted":item.is_blacklisted,"isActive":item.is_active,"version":1}))?;
        }
        for item in seed.material_prices {
            currency(&item.currency)?;
            date(&item.effective_at)?;
            unique(
                &mut seen,
                format!(
                    "price:{}:{}:{}:{}",
                    item.material_sku, item.supplier_code, item.currency, item.effective_at
                ),
            )?;
            let amount = item
                .unit_price_minor
                .parse::<i64>()
                .ok()
                .filter(|value| {
                    *value >= 0
                        && item
                            .unit_price_minor
                            .bytes()
                            .all(|byte| byte.is_ascii_digit())
                })
                .ok_or_else(|| {
                    SeedImportError::Invalid(
                        "unitPriceMinor must be a nonnegative integer string".into(),
                    )
                })?;
            let material_id = writer.reference("local_materials", "sku", &item.material_sku)?;
            let supplier_id =
                writer.reference("local_suppliers", "business_code", &item.supplier_code)?;
            let supplier_country: Option<String> = writer
                .tx
                .query_row(
                    "SELECT country_id FROM local_suppliers WHERE id = ?1 AND is_blacklisted = 0",
                    [&supplier_id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();
            if supplier_country.is_none() {
                return Err(SeedImportError::Invalid(format!(
                    "supplier has no usable country: {}",
                    item.supplier_code
                )));
            }
            let unit_id = writer.reference("local_units", "business_code", &item.unit_code)?;
            let unit: String = writer.tx.query_row(
                "SELECT name FROM local_units WHERE id = ?1",
                [unit_id],
                |row| row.get(0),
            )?;
            let key = format!(
                "{}:{}:{}:{}",
                item.material_sku, item.supplier_code, item.currency, item.effective_at
            );
            writer.ensure("local_material_prices", "material_price", &key, &[("material_id", text(&material_id)), ("supplier_id", text(&supplier_id)), ("currency", text(&item.currency)), ("effective_at", text(&item.effective_at))], &[("unit_price_minor", Value::Integer(amount)), ("unit", text(&unit)), ("source_note", optional_text(item.source_note.as_deref())), ("is_active", Value::Integer(1))], |id| json!({"id":id,"materialId":material_id,"supplierId":supplier_id,"currency":item.currency,"unitPriceMinor":item.unit_price_minor,"unit":unit,"effectiveAt":item.effective_at,"sourceNote":item.source_note,"version":1}))?;
        }
        for item in seed.exchange_rates {
            currency(&item.from_currency)?;
            currency(&item.to_currency)?;
            date(&item.effective_at)?;
            if item.from_currency == item.to_currency
                || !valid_non_zero_decimal_rate(&item.rate_decimal)
                || item.source != "manual"
                || item
                    .reason
                    .as_deref()
                    .is_none_or(|value| value.trim().is_empty() || value.len() > 1000)
            {
                return Err(SeedImportError::Invalid(
                    "exchange rate requires a directed positive manual rate and reason".into(),
                ));
            }
            let key = format!(
                "{}:{}:{}:{}",
                item.from_currency, item.to_currency, item.effective_at, item.source
            );
            unique(&mut seen, format!("rate:{key}"))?;
            writer.ensure("local_exchange_rates", "exchange_rate", &key, &[("from_currency", text(&item.from_currency)), ("to_currency", text(&item.to_currency)), ("effective_at", text(&item.effective_at)), ("source", text(&item.source))], &[("rate_decimal", text(&item.rate_decimal)), ("reason", optional_text(item.reason.as_deref()))], |id| json!({"id":id,"fromCurrency":item.from_currency,"toCurrency":item.to_currency,"rateDecimal":item.rate_decimal,"effectiveAt":item.effective_at,"source":item.source,"reason":item.reason,"version":1}))?;
        }
        let violations: i64 =
            writer
                .tx
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get(0)
                })?;
        if violations != 0 {
            return Err(SeedImportError::Invalid("foreign key check failed".into()));
        }
        let report = writer.report;
        tx.commit()?;
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CachedAccount, ExchangeRateInput, MaterialCategoryInput, MaterialInput, MaterialPriceInput,
        ProjectDefaultsInput, ReferenceMasterDataInput, Role, SupplierInput, TaxTemplateInput,
    };

    #[test]
    fn file_sqlite_seed_import_is_atomic_idempotent_and_country_linked() {
        let path = std::env::temp_dir().join(format!("honsen-seed-{}.test.sqlite", Uuid::new_v4()));
        let service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
        let now = SystemTime::now();
        let account = CachedAccount {
            id: Uuid::new_v4(),
            username: "seed-fixture-admin".into(),
            roles: vec![Role::Administrator],
            enabled: true,
            requires_password_change: false,
        };
        service
            .cache_verified_account(account, "fixture-secret-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        let parts = captcha.question.split_whitespace().collect::<Vec<_>>();
        let answer = parts[0].parse::<u8>().unwrap() + parts[2].parse::<u8>().unwrap();
        service
            .offline_login(
                "seed-fixture-admin",
                "fixture-secret-password",
                captcha.id,
                answer,
                now,
            )
            .unwrap();
        let source = include_str!("../../../../seed/master-data.json");
        let report = service.import_master_data_seed(source, now).unwrap();
        for (kind, expected) in [
            ("country", 3),
            ("project", 3),
            ("site", 3),
            ("department", 2),
            ("team", 6),
            ("unit", 14),
            ("material_category", 10),
            ("material", 3),
            ("supplier", 2),
            ("material_price", 1),
            ("tax_template", 3),
            ("project_defaults", 3),
            ("exchange_rate", 8),
        ] {
            assert_eq!(report.inserted.get(kind), Some(&expected), "{kind}");
        }
        let expected_events: usize = report.inserted.values().sum();
        let repeated = service.import_master_data_seed(source, now).unwrap();
        assert!(repeated.inserted.is_empty());
        assert_eq!(repeated.skipped.values().sum::<usize>(), expected_events);
        let connection = service.connection.lock().unwrap();
        let (supplier_code, supplier_country, price): (String, String, i64) = connection.query_row("SELECT s.business_code, c.business_code, p.unit_price_minor FROM local_material_prices p JOIN local_suppliers s ON s.id = p.supplier_id JOIN local_countries c ON c.id = s.country_id JOIN local_materials m ON m.id = p.material_id WHERE m.sku = 'CIVIL-CEM-0001'", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).unwrap();
        assert_eq!(
            (supplier_code.as_str(), supplier_country.as_str(), price),
            ("SUP-002", "CI", 5600)
        );
        let currencies = connection
            .prepare("SELECT default_currency FROM local_projects ORDER BY business_code")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(currencies, ["XOF", "ETB", "XAF"]);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
        let before: (i64, i64, i64) = connection.query_row("SELECT (SELECT COUNT(*) FROM local_countries), (SELECT COUNT(*) FROM local_sync_outbox), (SELECT COUNT(*) FROM local_master_data_seed_audit)", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).unwrap();
        assert_eq!(before, (3, expected_events as i64, expected_events as i64));
        let mut statement = connection
            .prepare("SELECT entity_type, payload_json FROM local_sync_outbox")
            .unwrap();
        for row in statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
        {
            let (entity, payload) = row.unwrap();
            let value: JsonValue = serde_json::from_str(&payload).unwrap();
            match entity.as_str() {
                "country" | "project" | "site" | "department" | "team" | "unit" => {
                    serde_json::from_value::<ReferenceMasterDataInput>(value).unwrap();
                }
                "material_category" => {
                    serde_json::from_value::<MaterialCategoryInput>(value).unwrap();
                }
                "material" => {
                    serde_json::from_value::<MaterialInput>(value).unwrap();
                }
                "supplier" => {
                    serde_json::from_value::<SupplierInput>(value).unwrap();
                }
                "material_price" => {
                    serde_json::from_value::<MaterialPriceInput>(value).unwrap();
                }
                "tax_template" => {
                    serde_json::from_value::<TaxTemplateInput>(value).unwrap();
                }
                "exchange_rate" => {
                    serde_json::from_value::<ExchangeRateInput>(value).unwrap();
                }
                "project_defaults" => {
                    serde_json::from_value::<ProjectDefaultsInput>(value).unwrap();
                }
                _ => panic!("unexpected outbox entity: {entity}"),
            }
        }
        drop(statement);
        drop(connection);
        let mut conflict: JsonValue = serde_json::from_str(source).unwrap();
        conflict["countries"].as_array_mut().unwrap().insert(
            0,
            json!({"code":"NEW","name":"Synthetic country","timeZone":"UTC","isActive":true}),
        );
        conflict["countries"][1]["name"] = json!("changed value");
        assert!(matches!(
            service.import_master_data_seed(&conflict.to_string(), now),
            Err(SeedImportError::Conflict(_))
        ));
        let mut bad_reference: JsonValue = serde_json::from_str(source).unwrap();
        bad_reference["countries"].as_array_mut().unwrap().insert(
            0,
            json!({"code":"NEW","name":"Synthetic country","timeZone":"UTC","isActive":true}),
        );
        bad_reference["suppliers"][0]["countryCode"] = json!("UNKNOWN");
        assert!(matches!(
            service.import_master_data_seed(&bad_reference.to_string(), now),
            Err(SeedImportError::Invalid(_))
        ));
        let connection = service.connection.lock().unwrap();
        let after: (i64, i64, i64) = connection.query_row("SELECT (SELECT COUNT(*) FROM local_countries), (SELECT COUNT(*) FROM local_sync_outbox), (SELECT COUNT(*) FROM local_master_data_seed_audit)", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).unwrap();
        assert_eq!(after, before);
        drop(connection);
        let mut malformed: JsonValue = serde_json::from_str(source).unwrap();
        malformed["countries"][0]["unexpectedField"] = json!(true);
        assert!(matches!(
            service.import_master_data_seed(&malformed.to_string(), now),
            Err(SeedImportError::Json(_))
        ));
        let mut duplicate: JsonValue = serde_json::from_str(source).unwrap();
        let first = duplicate["countries"][0].clone();
        duplicate["countries"].as_array_mut().unwrap().push(first);
        assert!(matches!(
            service.import_master_data_seed(&duplicate.to_string(), now),
            Err(SeedImportError::Invalid(_))
        ));
        drop(service);
        std::fs::remove_file(path).unwrap();
    }
}
