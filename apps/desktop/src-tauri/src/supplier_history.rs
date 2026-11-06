use super::*;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPriceHistoryView {
    pub price_id: Uuid,
    pub material_id: Uuid,
    pub material_name_zh: String,
    pub material_name_fr: Option<String>,
    pub material_name_en: Option<String>,
    pub material_model: String,
    pub material_specification: String,
    pub material_active: bool,
    pub supplier_id: Uuid,
    pub supplier_name: String,
    pub supplier_active: bool,
    pub is_blacklisted: bool,
    pub currency: String,
    pub unit_price_minor: String,
    pub unit: String,
    pub effective_at: String,
    pub source_note: Option<String>,
    pub is_active: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trusted_supplier_and_quote_writes_survive_file_restart_with_pending_outbox() {
        let path = std::env::temp_dir().join(format!(
            "honsen-supplier-producer-{}.sqlite",
            Uuid::new_v4()
        ));
        let now = SystemTime::now();
        let actor = Uuid::new_v4();
        let country = Uuid::new_v4();
        let material = Uuid::new_v4();
        let supplier = Uuid::new_v4();
        let mut service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
        service
            .cache_verified_account(
                CachedAccount {
                    id: actor,
                    username: "synthetic-producer".into(),
                    roles: vec![Role::Purchaser],
                    enabled: true,
                    requires_password_change: false,
                },
                "synthetic-password",
                now,
            )
            .unwrap();
        let login = |service: &LocalAuthService| {
            let captcha = service.issue_captcha(now).unwrap();
            let numbers: Vec<u8> = captcha
                .question
                .split_whitespace()
                .filter_map(|s| s.parse().ok())
                .collect();
            service
                .offline_login(
                    "synthetic-producer",
                    "synthetic-password",
                    captcha.id,
                    numbers.iter().sum(),
                    now,
                )
                .unwrap();
        };
        login(&service);
        // Authorization/master-data scaffolding only; business records below
        // are created exclusively through trusted production mutation methods.
        crate::tests::grant_new_test_scope(&service, actor, country, now);
        let project: Uuid = service
            .connection
            .lock()
            .unwrap()
            .query_row(
                "SELECT project_id FROM local_authorization_snapshots WHERE account_id=?1",
                [actor.to_string()],
                |row| row.get::<_, String>(0),
            )
            .unwrap()
            .parse()
            .unwrap();
        service.save_material(serde_json::from_value(serde_json::json!({"id":material,"nameZh":"synthetic material","aliases":[],"model":"M","specification":"S","unit":"pcs","isActive":true,"version":1})).unwrap(),now).unwrap();
        service.save_supplier(serde_json::from_value(serde_json::json!({"id":supplier,"businessCode":"SYNTH-SUP","name":"synthetic supplier","countryId":country,"isPreferred":false,"isBlacklisted":false,"isActive":true,"version":1})).unwrap(),now).unwrap();
        let mut quote_ids = Vec::new();
        for amount in ["100", "125"] {
            let id = Uuid::new_v4();
            quote_ids.push(id);
            service
                .add_material_price(
                    MaterialPriceInput {
                        id,
                        material_id: material,
                        supplier_id: supplier,
                        currency: "XOF".into(),
                        unit_price_minor: amount.into(),
                        unit: "pcs".into(),
                        effective_at: "2026-11-06".into(),
                        source_note: Some("synthetic regression".into()),
                        version: 1,
                    },
                    now,
                )
                .unwrap();
        }
        let before = service
            .list_supplier_prices(supplier, project, None, now)
            .unwrap();
        assert_eq!(before.len(), 2);
        assert_eq!(
            before.iter().map(|q| q.price_id).collect::<HashSet<_>>(),
            quote_ids.into_iter().collect()
        );
        let pending = service.pending_sync_events(100, now).unwrap();
        assert_eq!(pending.len(), 4);
        assert_eq!(
            pending
                .iter()
                .filter(|e| e.entity_type == "material_price")
                .count(),
            2
        );
        let vault = std::mem::replace(
            &mut service.credential_vault,
            Box::new(MemoryCredentialVault::new()),
        );
        drop(service);
        let reopened = LocalAuthService::open(
            Connection::open(&path).unwrap(),
            vault,
            path.with_extension("media"),
            None,
        )
        .unwrap();
        login(&reopened);
        assert_eq!(
            reopened
                .list_supplier_prices(supplier, project, None, now)
                .unwrap(),
            before
        );
        assert_eq!(reopened.pending_sync_events(100, now).unwrap(), pending);
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn supplier_history_pages_survive_restart_and_enforce_live_scope() {
        let path =
            std::env::temp_dir().join(format!("honsen-supplier-history-{}.sqlite", Uuid::new_v4()));
        let mut service = LocalAuthService::open_file_for_test(path.to_str().unwrap()).unwrap();
        let now = SystemTime::now();
        let ids: Vec<Uuid> = (0..10).map(|_| Uuid::new_v4()).collect();
        let (
            actor,
            country,
            other_country,
            project,
            other_project,
            department,
            team,
            material,
            supplier,
            foreign_supplier,
        ) = (
            ids[0], ids[1], ids[2], ids[3], ids[4], ids[5], ids[6], ids[7], ids[8], ids[9],
        );
        {
            let mut c = service.connection.lock().unwrap();
            c.execute("INSERT INTO local_accounts(id,username,roles_json,enabled,requires_password_change,cached_verified_at) VALUES(?1,'synthetic','[\"engineer\"]',1,0,?2)",params![actor.to_string(),unix_seconds(now)]).unwrap();
            c.execute(
                "INSERT INTO local_session(user_id,started_at,last_active_at) VALUES(?1,?2,?2)",
                params![actor.to_string(), unix_seconds(now)],
            )
            .unwrap();
            c.session_invalidated = false;
            for country_id in [country, other_country] {
                c.execute("INSERT INTO local_countries(id,business_code,name,time_zone,is_active,version) VALUES(?1,?1,'synthetic','UTC',1,1)",[country_id.to_string()]).unwrap();
            }
            for project_id in [project, other_project] {
                c.execute("INSERT INTO local_projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair,is_active,version) VALUES(?1,?2,?1,'synthetic','site','department','XOF','zh_fr',1,1)",params![project_id.to_string(),country.to_string()]).unwrap();
            }
            c.execute("INSERT INTO local_departments(id,business_code,name,is_active,version) VALUES(?1,?1,'department',1,1)",[department.to_string()]).unwrap();
            c.execute("INSERT INTO local_teams(id,department_id,business_code,name,is_active,version) VALUES(?1,?2,?1,'team',1,1)",params![team.to_string(),department.to_string()]).unwrap();
            c.execute("INSERT INTO local_authorization_snapshots(account_id,project_id,department_id,team_id,verified_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6)",params![actor.to_string(),project.to_string(),department.to_string(),team.to_string(),unix_seconds(now),unix_seconds(now)+86400]).unwrap();
            c.execute("INSERT INTO local_materials(id,name_zh,aliases_json,model,specification,unit,is_active,version) VALUES(?1,'synthetic','[]','M','S','pcs',0,1)",[material.to_string()]).unwrap();
            for (supplier_id, country_id) in
                [(supplier, country), (foreign_supplier, other_country)]
            {
                c.execute("INSERT INTO local_suppliers(id,business_code,name,country_id,is_active,is_blacklisted,version) VALUES(?1,?1,'synthetic',?2,0,1,1)",params![supplier_id.to_string(),country_id.to_string()]).unwrap();
            }
            for i in 0..31 {
                c.execute("INSERT INTO local_material_prices(id,material_id,supplier_id,currency,unit_price_minor,unit,effective_at,is_active,version) VALUES(?1,?2,?3,'XOF',?4,'pcs','2026-01-01',?5,1)",params![Uuid::new_v4().to_string(),material.to_string(),supplier.to_string(),i,(i==30) as i64]).unwrap();
            }
        }
        let first = service
            .list_supplier_prices(supplier, project, None, now)
            .unwrap();
        let second = service
            .list_supplier_prices(supplier, project, first.last().map(|p| p.price_id), now)
            .unwrap();
        assert_eq!((first.len(), second.len()), (25, 6));
        assert_eq!(
            first
                .iter()
                .chain(&second)
                .map(|p| p.price_id)
                .collect::<HashSet<_>>()
                .len(),
            31
        );
        assert!(first.iter().chain(&second).any(|p| !p.is_active));
        assert!(
            first
                .iter()
                .all(|p| !p.material_active && !p.supplier_active && p.is_blacklisted)
        );
        assert!(
            service
                .list_supplier_prices(supplier, project, second.last().map(|p| p.price_id), now)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            service.list_supplier_prices(supplier, other_project, None, now),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            service.list_supplier_prices(foreign_supplier, project, None, now),
            Err(AuthError::Forbidden)
        );
        service
            .cache_verified_account(
                CachedAccount {
                    id: actor,
                    username: "synthetic".into(),
                    roles: vec![Role::Engineer],
                    enabled: true,
                    requires_password_change: false,
                },
                "synthetic-password",
                now,
            )
            .unwrap();
        let vault = std::mem::replace(
            &mut service.credential_vault,
            Box::new(MemoryCredentialVault::new()),
        );
        drop(service);
        let reopened = LocalAuthService::open(
            Connection::open(&path).unwrap(),
            vault,
            path.with_extension("media"),
            None,
        )
        .unwrap();
        let challenge = reopened.issue_captcha(now).unwrap();
        let numbers: Vec<u8> = challenge
            .question
            .split_whitespace()
            .filter_map(|part| part.parse().ok())
            .collect();
        reopened
            .offline_login(
                "synthetic",
                "synthetic-password",
                challenge.id,
                numbers.iter().sum(),
                now,
            )
            .unwrap();
        assert_eq!(
            reopened
                .list_supplier_prices(supplier, project, None, now)
                .unwrap(),
            first
        );
        for (column, value) in [("enabled", 0), ("requires_password_change", 1)] {
            reopened
                .connection
                .lock()
                .unwrap()
                .execute(
                    &format!("UPDATE local_accounts SET {column}=?1 WHERE id=?2"),
                    params![value, actor.to_string()],
                )
                .unwrap();
            assert_eq!(
                reopened.list_supplier_prices(supplier, project, None, now),
                Err(AuthError::Forbidden)
            );
            reopened
                .connection
                .lock()
                .unwrap()
                .execute(
                    &format!("UPDATE local_accounts SET {column}=?1 WHERE id=?2"),
                    params![1 - value, actor.to_string()],
                )
                .unwrap();
        }
        reopened
            .connection
            .lock()
            .unwrap()
            .execute(
                "UPDATE local_authorization_snapshots SET verified_at=0, expires_at=?1",
                [unix_seconds(now) - 1],
            )
            .unwrap();
        assert_eq!(
            reopened.list_supplier_prices(supplier, project, None, now),
            Err(AuthError::Forbidden)
        );
        reopened.lock().unwrap();
        assert_eq!(
            reopened.list_supplier_prices(supplier, project, None, now),
            Err(AuthError::NoActiveSession)
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }
}

impl LocalAuthService {
    pub fn list_supplier_prices(
        &self,
        supplier_id: Uuid,
        project_id: Uuid,
        after: Option<Uuid>,
        now: SystemTime,
    ) -> Result<Vec<SupplierPriceHistoryView>, AuthError> {
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        let account_id = Self::catalog_account_on_connection(&connection, now)?;
        let authorized: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM local_authorization_snapshots a JOIN local_projects p ON p.id=a.project_id AND p.is_active=1 AND p.deleted_at IS NULL JOIN local_countries c ON c.id=p.country_id AND c.is_active=1 AND c.deleted_at IS NULL JOIN local_departments d ON d.id=a.department_id AND d.is_active=1 AND d.deleted_at IS NULL JOIN local_teams t ON t.id=a.team_id AND t.department_id=d.id AND t.is_active=1 AND t.deleted_at IS NULL JOIN local_suppliers s ON s.country_id=p.country_id AND s.id=?3 AND s.deleted_at IS NULL WHERE a.account_id=?1 AND a.project_id=?2 AND a.expires_at>=?4)", params![account_id.to_string(), project_id.to_string(), supplier_id.to_string(), unix_seconds(now)], |row| row.get(0)).map_err(|_| AuthError::Database)?;
        if !authorized {
            return Err(AuthError::Forbidden);
        }
        let mut statement = connection.prepare("SELECT q.id,m.id,m.name_zh,m.name_fr,m.name_en,m.model,m.specification,m.is_active,s.id,s.name,s.is_active,s.is_blacklisted,q.currency,q.unit_price_minor,q.unit,q.effective_at,q.source_note,q.is_active FROM local_material_prices q JOIN local_materials m ON m.id=q.material_id JOIN local_suppliers s ON s.id=q.supplier_id WHERE q.supplier_id=?1 AND q.deleted_at IS NULL AND m.deleted_at IS NULL AND s.deleted_at IS NULL AND (?2 IS NULL OR q.id>?2) ORDER BY q.id LIMIT 25").map_err(|_| AuthError::Database)?;
        statement
            .query_map(
                params![supplier_id.to_string(), after.map(|id| id.to_string())],
                |row| {
                    Ok(SupplierPriceHistoryView {
                        price_id: Uuid::parse_str(&row.get::<_, String>(0)?)
                            .map_err(|_| rusqlite::Error::InvalidQuery)?,
                        material_id: Uuid::parse_str(&row.get::<_, String>(1)?)
                            .map_err(|_| rusqlite::Error::InvalidQuery)?,
                        material_name_zh: row.get(2)?,
                        material_name_fr: row.get(3)?,
                        material_name_en: row.get(4)?,
                        material_model: row.get(5)?,
                        material_specification: row.get(6)?,
                        material_active: row.get::<_, i64>(7)? != 0,
                        supplier_id: Uuid::parse_str(&row.get::<_, String>(8)?)
                            .map_err(|_| rusqlite::Error::InvalidQuery)?,
                        supplier_name: row.get(9)?,
                        supplier_active: row.get::<_, i64>(10)? != 0,
                        is_blacklisted: row.get::<_, i64>(11)? != 0,
                        currency: row.get(12)?,
                        unit_price_minor: row.get::<_, i64>(13)?.to_string(),
                        unit: row.get(14)?,
                        effective_at: row.get(15)?,
                        source_note: row.get(16)?,
                        is_active: row.get::<_, i64>(17)? != 0,
                    })
                },
            )
            .map_err(|_| AuthError::Database)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| AuthError::Database)
    }
}
