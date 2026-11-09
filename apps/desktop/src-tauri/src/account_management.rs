use super::*;

// Password-bearing requests deliberately do not implement Debug or Clone.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateManagedAccount {
    pub username: String,
    pub display_name: String,
    pub temporary_password: String,
    pub roles: Vec<Role>,
    pub ui_locale: String,
    pub employee_photo_key: String,
    pub scope: ManagedAuthorizationBinding,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedAccount {
    pub id: Uuid,
    pub username: String,
    #[serde(default)]
    pub display_name: Option<String>,
    pub roles: Vec<Role>,
    pub is_enabled: bool,
    pub requires_password_change: bool,
    #[serde(default)]
    pub scopes: Vec<ManagedAuthorizationBinding>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedAccountDetails {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub ui_locale: String,
    pub roles: Vec<Role>,
    pub is_enabled: bool,
    pub requires_password_change: bool,
    pub is_locked: bool,
    pub account_version: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateManagedAccount {
    pub expected_account_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui_locale: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roles: Option<Vec<Role>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unlock: Option<bool>,
}
impl UpdateManagedAccount {
    fn validate(&self) -> Result<(), AuthError> {
        if self.expected_account_version.is_empty()
            || self.expected_account_version.len() > 20
            || !self
                .expected_account_version
                .bytes()
                .all(|b| b.is_ascii_digit())
            || self
                .display_name
                .as_ref()
                .is_some_and(|v| v.trim().is_empty() || v.chars().count() > 100)
            || self
                .ui_locale
                .as_ref()
                .is_some_and(|v| !["zh-CN", "fr-FR", "en-US"].contains(&v.as_str()))
            || self.roles.as_ref().is_some_and(|v| {
                v.is_empty() || v.len() > 4 || v.contains(&Role::SuperAdministrator)
            })
            || self.unlock == Some(false)
            || (self.display_name.is_none()
                && self.ui_locale.is_none()
                && self.roles.is_none()
                && self.is_enabled.is_none()
                && self.unlock.is_none())
        {
            return Err(AuthError::InvalidInput);
        }
        Ok(())
    }
}

impl LocalAuthService {
    pub async fn get_managed_account_details(
        &self,
        account_id: Uuid,
        now: SystemTime,
    ) -> Result<ManagedAccountDetails, AuthError> {
        self.managed_account_details_request(account_id, None, now)
            .await
    }
    pub async fn update_managed_account(
        &self,
        account_id: Uuid,
        input: UpdateManagedAccount,
        now: SystemTime,
    ) -> Result<ManagedAccountDetails, AuthError> {
        input.validate()?;
        if input.roles.as_ref().is_some_and(|v| {
            v.iter()
                .any(|r| matches!(r, Role::Administrator | Role::Purchaser))
        }) {
            self.require_role(Role::SuperAdministrator, now)?;
        }
        self.managed_account_details_request(account_id, Some(input), now)
            .await
    }
    async fn managed_account_details_request(
        &self,
        account_id: Uuid,
        input: Option<UpdateManagedAccount>,
        now: SystemTime,
    ) -> Result<ManagedAccountDetails, AuthError> {
        if account_id.is_nil() {
            return Err(AuthError::InvalidInput);
        }
        let request = self.authorization_management_request(now)?;
        let endpoint = api_endpoint_from(
            &configured_api_base_url()?,
            &format!("accounts/{account_id}"),
        )?;
        let client = self.https_client()?;
        let builder = if let Some(input) = input {
            client.patch(endpoint).json(&input)
        } else {
            client.get(endpoint)
        };
        let response = builder
            .bearer_auth(&request.token)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        let status = response.status();
        // Check the initiating session even for a conflict. Never retry a stale version.
        if status == reqwest::StatusCode::CONFLICT {
            Self::require_request_session(
                &*self.connection.lock().map_err(|_| AuthError::Database)?,
                request.session,
            )?;
            return Err(AuthError::AccountConflict);
        }
        self.authorization_management_response(request.session, status)?;
        let result = response
            .json::<ManagedAccountDetails>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            request.session,
        )?;
        if result.id != account_id {
            return Err(AuthError::SyncTransport);
        }
        Ok(result)
    }
}

impl CreateManagedAccount {
    fn validate(&self) -> Result<(), AuthError> {
        if self.username.is_empty()
            || self.username.len() > 100
            || !self
                .username
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric())
            || self.display_name.trim().is_empty()
            || self.display_name.chars().count() > 100
            || !(8..=1024).contains(&self.temporary_password.chars().count())
            || !valid_required_text(&self.employee_photo_key, 1024)
            || self.roles.is_empty()
            || self.roles.len() > 4
            || self.roles.contains(&Role::SuperAdministrator)
            || !["zh-CN", "en-US", "fr-FR"].contains(&self.ui_locale.as_str())
            || self.scope.project_id.is_nil()
            || self.scope.department_id.is_nil()
            || self.scope.team_id.is_nil()
        {
            return Err(AuthError::InvalidInput);
        }
        Ok(())
    }
}

impl LocalAuthService {
    async fn password_change_response(
        &self,
        session: OnlineSession,
        response: reqwest::Response,
    ) -> Result<(), AuthError> {
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::LOCKED {
            // Never expose or log the response body; only the supported code is interpreted.
            let failure = response.json::<serde_json::Value>().await.ok();
            Self::require_request_session(
                &*self.connection.lock().map_err(|_| AuthError::Database)?,
                session,
            )?;
            if status == reqwest::StatusCode::UNAUTHORIZED
                && failure
                    .as_ref()
                    .and_then(|v| v.get("code"))
                    .and_then(|v| v.as_str())
                    == Some("INVALID_LOGIN")
            {
                return Err(AuthError::InvalidCredentials);
            }
            if status == reqwest::StatusCode::LOCKED {
                return Err(AuthError::AccountLocked);
            }
        }
        self.authorization_management_response(session, status)
    }

    pub async fn find_managed_accounts(
        &self,
        username: String,
        now: SystemTime,
    ) -> Result<Vec<ManagedAccount>, AuthError> {
        if !valid_required_text(&username, 100) {
            return Err(AuthError::InvalidInput);
        }
        let request = self.authorization_management_request(now)?;
        let mut endpoint = api_endpoint_from(&configured_api_base_url()?, "accounts")?;
        endpoint
            .query_pairs_mut()
            .append_pair("username", &username);
        let response = self
            .https_client()?
            .get(endpoint)
            .bearer_auth(&request.token)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        self.authorization_management_response(request.session, response.status())?;
        let result = response
            .json::<Vec<ManagedAccount>>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        if result.len() > 1 {
            return Err(AuthError::AccountNameCollision);
        }
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            request.session,
        )?;
        if result
            .iter()
            .any(|account| !account.username.eq_ignore_ascii_case(&username))
        {
            return Err(AuthError::SyncTransport);
        }
        Ok(result)
    }

    pub async fn create_managed_account(
        &self,
        input: CreateManagedAccount,
        now: SystemTime,
    ) -> Result<ManagedAccount, AuthError> {
        input.validate()?;
        let request = self.authorization_management_request(now)?;
        if input
            .roles
            .iter()
            .any(|r| matches!(r, Role::Administrator | Role::Purchaser))
        {
            self.require_role(Role::SuperAdministrator, now)?;
        }
        let response = self
            .https_client()?
            .post(api_endpoint_from(&configured_api_base_url()?, "accounts")?)
            .bearer_auth(&request.token)
            .json(&input)
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        self.authorization_management_response(request.session, response.status())?;
        let result = response
            .json::<ManagedAccount>()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        Self::require_request_session(
            &*self.connection.lock().map_err(|_| AuthError::Database)?,
            request.session,
        )?;
        Ok(result)
    }

    pub async fn change_account_password(
        &self,
        current: String,
        replacement: String,
        now: SystemTime,
    ) -> Result<(), AuthError> {
        if current.is_empty()
            || current.len() > 1024
            || !(12..=1024).contains(&replacement.chars().count())
            || current == replacement
        {
            return Err(AuthError::InvalidInput);
        }
        // Password change is available before ordinary business authorization.
        let session = self
            .connection
            .lock()
            .map_err(|_| AuthError::Database)?
            .online_session
            .ok_or(AuthError::NoActiveSession)?;
        {
            let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
            Self::require_request_session(&connection, session)?;
            let active: bool = connection.query_row("SELECT enabled=1 AND ?2-last_active_at <= ?3 FROM local_accounts a JOIN local_session s ON s.user_id=a.id WHERE a.id=?1", params![session.account_id.to_string(),unix_seconds(now),IDLE_LOCK_WINDOW.as_secs() as i64], |row| row.get(0)).map_err(|_| AuthError::Database)?;
            if !active {
                return Err(AuthError::NoActiveSession);
            }
        }
        let token = self
            .credential_vault
            .load_sync_token(session.account_id)?
            .ok_or(AuthError::NoActiveSession)?;
        let response = self
            .https_client()?
            .post(cloud_auth_endpoint("change-password")?)
            .bearer_auth(token)
            .json(&serde_json::json!({"currentPassword":current,"newPassword":replacement}))
            .send()
            .await
            .map_err(|_| AuthError::SyncTransport)?;
        self.password_change_response(session, response).await?;
        // Server revokes all sessions; never permit reuse of the cached old password.
        let connection = self.connection.lock().map_err(|_| AuthError::Database)?;
        Self::require_request_session(&connection, session)?;
        connection
            .execute(
                "UPDATE local_accounts SET cached_verified_at=0 WHERE id=?1",
                [session.account_id.to_string()],
            )
            .map_err(|_| AuthError::Database)?;
        drop(connection);
        self.lock()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn password_change_http_errors_preserve_only_valid_sessions() {
        use std::io::{Read, Write};
        for (status, body, expected, retained) in [
            (
                401,
                "{\"code\":\"INVALID_LOGIN\"}",
                AuthError::InvalidCredentials,
                true,
            ),
            (
                401,
                "{\"code\":\"UNAUTHENTICATED\"}",
                AuthError::NoActiveSession,
                false,
            ),
            (401, "not-json", AuthError::NoActiveSession, false),
            (
                423,
                "{\"code\":\"ACCOUNT_LOCKED\"}",
                AuthError::AccountLocked,
                true,
            ),
        ] {
            let service = LocalAuthService::open_in_memory().unwrap();
            let session = OnlineSession {
                account_id: Uuid::new_v4(),
                generation: Uuid::new_v4(),
            };
            {
                let mut c = service.connection.lock().unwrap();
                c.execute("INSERT INTO local_accounts(id,username,roles_json,enabled,requires_password_change,cached_verified_at) VALUES(?1,'synthetic','[]',1,0,0)", [session.account_id.to_string()]).unwrap();
                c.online_session = Some(session);
                c.session_invalidated = false;
                c.execute(
                    "INSERT INTO local_session(user_id,started_at,last_active_at) VALUES(?1,0,0)",
                    [session.account_id.to_string()],
                )
                .unwrap();
            }
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                let mut request = [0; 2048];
                let received = socket.read(&mut request).unwrap();
                assert!(received > 0, "expected an HTTP request before responding");
                write!(socket, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            });
            tauri::async_runtime::block_on(async {
                let response = reqwest::Client::builder()
                    .no_proxy()
                    .timeout(Duration::from_secs(5))
                    .build()
                    .unwrap()
                    .get(format!("http://{address}/change-password"))
                    .send()
                    .await
                    .unwrap();
                assert_eq!(
                    service.password_change_response(session, response).await,
                    Err(expected)
                );
            });
            server.join().unwrap();
            assert_eq!(
                service.connection.lock().unwrap().online_session.is_some(),
                retained
            );
        }
    }
    #[test]
    fn first_login_trusted_business_gate_and_bootstrap_exception() {
        let service = LocalAuthService::open_in_memory().unwrap();
        let now = SystemTime::now();
        let id = Uuid::new_v4();
        service
            .cache_verified_account(
                CachedAccount {
                    id,
                    username: "synthetic-first-login".into(),
                    roles: vec![Role::Administrator],
                    enabled: true,
                    requires_password_change: true,
                },
                "synthetic-temporary",
                now,
            )
            .unwrap();
        let mut connection = service.connection.lock().unwrap();
        connection.session_invalidated = false;
        connection
            .execute(
                "INSERT INTO local_session(user_id,started_at,last_active_at) VALUES(?1,?2,?2)",
                params![id.to_string(), unix_seconds(now)],
            )
            .unwrap();
        assert!(matches!(
            LocalAuthService::require_role_on_connection(&connection, Role::Administrator, now),
            Err(AuthError::Forbidden)
        ));
        assert!(matches!(
            LocalAuthService::require_conflict_resolution(&connection, now),
            Err(AuthError::Forbidden)
        ));
        // Bootstrap accounts explicitly use requires_password_change=false.
        connection
            .execute(
                "UPDATE local_accounts SET requires_password_change=0 WHERE id=?1",
                [id.to_string()],
            )
            .unwrap();
        assert!(
            LocalAuthService::require_role_on_connection(&connection, Role::Administrator, now)
                .is_ok()
        );
        assert!(LocalAuthService::require_conflict_resolution(&connection, now).is_ok());
    }
    fn input() -> CreateManagedAccount {
        CreateManagedAccount {
            username: "SyntheticAccount".into(),
            display_name: "Synthetic name".into(),
            temporary_password: "synthetic-temporary".into(),
            roles: vec![Role::Engineer],
            ui_locale: "zh-CN".into(),
            employee_photo_key: "synthetic/photo".into(),
            scope: ManagedAuthorizationBinding {
                project_id: Uuid::new_v4(),
                department_id: Uuid::new_v4(),
                team_id: Uuid::new_v4(),
            },
        }
    }
    #[test]
    fn managed_account_rejects_super_and_missing_bindings() {
        let mut value = input();
        assert!(value.validate().is_ok());
        value.roles = vec![Role::SuperAdministrator];
        assert!(matches!(value.validate(), Err(AuthError::InvalidInput)));
        value.roles = vec![Role::Engineer];
        value.employee_photo_key.clear();
        assert!(value.validate().is_err());
        value.employee_photo_key = "synthetic/photo".into();
        value.scope.project_id = Uuid::nil();
        assert!(value.validate().is_err());
    }
    #[test]
    fn managed_account_requires_authenticated_online_session_before_transport() {
        let service = LocalAuthService::open_in_memory().unwrap();
        tauri::async_runtime::block_on(async {
            assert!(matches!(
                service
                    .find_managed_accounts("synthetic".into(), SystemTime::now())
                    .await,
                Err(AuthError::NoActiveSession)
            ));
            assert!(matches!(
                service
                    .create_managed_account(input(), SystemTime::now())
                    .await,
                Err(AuthError::NoActiveSession)
            ));
            assert!(matches!(
                service
                    .change_account_password(
                        "synthetic-current".into(),
                        "synthetic-replacement".into(),
                        SystemTime::now()
                    )
                    .await,
                Err(AuthError::NoActiveSession)
            ));
        });
    }
    #[test]
    fn account_lookup_summary_does_not_require_scopes() {
        let account: ManagedAccount = serde_json::from_value(serde_json::json!({"id":Uuid::new_v4(),"username":"synthetic","roles":["engineer"],"isEnabled":true,"requiresPasswordChange":true})).unwrap();
        assert!(account.scopes.is_empty());
        assert!(
            serde_json::from_value::<ManagedAccount>(
                serde_json::json!({"passwordHash":"forbidden"})
            )
            .is_err()
        );
    }
    #[test]
    fn managed_account_patch_rejects_empty_unknown_and_privileged_changes() {
        let parse = |value| serde_json::from_value::<UpdateManagedAccount>(value);
        assert!(
            parse(serde_json::json!({"expectedAccountVersion":"1","password":"secret"})).is_err()
        );
        for value in [
            serde_json::json!({"expectedAccountVersion":"1"}),
            serde_json::json!({"expectedAccountVersion":"1","roles":["super_administrator"]}),
            serde_json::json!({"expectedAccountVersion":"1","unlock":false}),
            serde_json::json!({"expectedAccountVersion":"-1","displayName":"Test"}),
            serde_json::json!({"expectedAccountVersion":"1","displayName":" "}),
        ] {
            assert_eq!(
                parse(value).unwrap().validate(),
                Err(AuthError::InvalidInput)
            );
        }
        assert!(parse(serde_json::json!({"expectedAccountVersion":"123","displayName":"合成姓名","isEnabled":false})).unwrap().validate().is_ok());
    }
    #[test]
    fn managed_account_details_requires_online_session_before_transport() {
        let service = LocalAuthService::open_in_memory().unwrap();
        tauri::async_runtime::block_on(async {
            assert!(matches!(
                service
                    .get_managed_account_details(Uuid::new_v4(), SystemTime::now())
                    .await,
                Err(AuthError::NoActiveSession)
            ));
            let input = serde_json::from_value(
                serde_json::json!({"expectedAccountVersion":"1","displayName":"Synthetic"}),
            )
            .unwrap();
            assert!(matches!(
                service
                    .update_managed_account(Uuid::new_v4(), input, SystemTime::now())
                    .await,
                Err(AuthError::NoActiveSession)
            ));
        });
    }
}
