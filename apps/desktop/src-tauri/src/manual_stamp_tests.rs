use super::*;

fn draft(stamp: Option<&str>) -> RequisitionDraftInput {
    let id = Uuid::new_v4();
    serde_json::from_value(serde_json::json!({"id":id,"displayNo":"STAMP-TEST","countryId":id,"projectId":id,"site":"test","departmentId":id,"teamId":id,"applicantId":id,"currency":"XAF","primaryCurrency":"XAF","languagePair":"zh_fr","urgency":"normal","orderDate":"2026-11-06","deliveryAddress":"test","orderDiscount":{"kind":"fixed_minor","minor":"0"},"orderFreight":{"kind":"fixed_minor","minor":"0"},"taxRateBasisPoints":1925,"manualStampDutyMinor":stamp,"lines":[{"id":id,"materialSnapshot":{"nameZh":"测试","model":"test","specification":"test"},"currency":"XAF","quantity":"1","unit":"PCS","unitPriceMinor":"10000","lineDiscount":{"kind":"fixed_minor","minor":"0"},"lineFreight":{"kind":"fixed_minor","minor":"0"},"freightIncluded":false,"sortOrder":0}]})).unwrap()
}

#[test]
fn manual_stamp_is_separate_from_percentage_tax_and_checks_integer_bounds() {
    let no_stamp = calculate_requisition(&draft(None)).unwrap();
    assert_eq!((no_stamp.tax, no_stamp.total), (1925, 11925));
    let with_stamp = calculate_requisition(&draft(Some("375"))).unwrap();
    assert_eq!((with_stamp.tax, with_stamp.total), (1925, 12300));
    for invalid in ["-1", "1.5", "", "001", "9223372036854775808"] {
        assert!(calculate_requisition(&draft(Some(invalid))).is_err());
    }
    assert!(calculate_requisition(&draft(Some("9223372036854775807"))).is_err());
    let mut mixed = draft(Some("1"));
    let mut other = mixed.lines[0].clone();
    other.currency = "USD".into();
    other.id = Uuid::new_v4();
    mixed.lines.push(other);
    mixed.tax_rate_basis_points = 0;
    assert!(calculate_requisition(&mixed).is_err());
}

#[test]
fn manual_stamp_migration_preserves_old_rows_and_optional_payload_shape() {
    let mut c = Connection::open_in_memory().unwrap();
    migrate(&mut c).unwrap();
    c.execute_batch("DROP TRIGGER local_manual_stamp_duty_frozen;ALTER TABLE local_purchase_orders DROP COLUMN manual_stamp_duty_minor;DELETE FROM local_schema_migrations WHERE version='0062_manual_stamp_duty';PRAGMA foreign_keys=OFF;INSERT INTO local_purchase_orders(id,display_no,country_id,project_id,site,department_id,team_id,applicant_id,currency,primary_currency,language_pair,status,workflow_status,urgency,order_date,delivery_address,subtotal_minor,line_discount_minor,order_discount_minor,freight_minor,tax_rate_basis_points,tax_minor,total_minor,version,created_at,updated_at) VALUES('saved','SAVED','c','p','s','d','t','a','XOF','XOF','zh_fr','draft','draft','normal','2026-11-06','s',100,0,0,0,1800,18,118,7,1,2);").unwrap();
    migrate(&mut c).unwrap();
    let row:(i64,i64,Option<i64>)=c.query_row("SELECT total_minor,version,manual_stamp_duty_minor FROM local_purchase_orders WHERE id='saved'",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
    assert_eq!(row, (118, 7, None));
    migrate(&mut c).unwrap();
    let legacy = draft(None);
    assert!(
        serde_json::to_value(legacy)
            .unwrap()
            .get("manualStampDutyMinor")
            .is_none()
    );
}

#[test]
fn manual_stamp_save_and_outbox_are_atomic() {
    let service = LocalAuthService::open_in_memory().unwrap();
    let now = SystemTime::now();
    let d = draft(Some("375"));
    let id = d.applicant_id;
    service
        .cache_verified_account(
            CachedAccount {
                id,
                username: "stamp".into(),
                roles: vec![Role::Purchaser],
                enabled: true,
                requires_password_change: false,
            },
            "synthetic-password",
            now,
        )
        .unwrap();
    service
        .activate_online_session(id, &"s".repeat(32), now)
        .unwrap();
    {
        let c = service.connection.lock().unwrap();
        c.execute("INSERT INTO local_countries(id,business_code,name,time_zone,is_active,version) VALUES(?1,'CM','CM','Africa/Douala',1,1)",[id.to_string()]).unwrap();
        c.execute("INSERT INTO local_projects(id,country_id,business_code,name,site,department_name,default_currency,default_language_pair,is_active,version) VALUES(?1,?1,'P','P','test','D','XAF','zh_fr',1,1)",[id.to_string()]).unwrap();
        c.execute("INSERT INTO local_departments(id,business_code,name,is_active,version) VALUES(?1,'D','D',1,1)",[id.to_string()]).unwrap();
        c.execute("INSERT INTO local_teams(id,department_id,business_code,name,is_active,version) VALUES(?1,?1,'T','T',1,1)",[id.to_string()]).unwrap();
        c.execute("INSERT INTO local_authorization_snapshots(account_id,project_id,department_id,team_id,verified_at,expires_at) VALUES(?1,?1,?1,?1,?2,?3)",params![id.to_string(),unix_seconds(now),unix_seconds(now)+3600]).unwrap();
    }
    assert_eq!(
        service
            .save_requisition_draft(d.clone(), now)
            .unwrap()
            .total_minor,
        "12300"
    );
    {
        let c = service.connection.lock().unwrap();
        let payload: String = c
            .query_row(
                "SELECT payload_json FROM local_sync_outbox WHERE entity_type='purchase_order'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let value: serde_json::Value = serde_json::from_str(&payload).unwrap();
        assert_eq!(value["manualStampDutyMinor"], "375");
        assert_eq!(value["totalMinor"], "12300");
        let tx = c.unchecked_transaction().unwrap();
        let audit = order_audit_snapshot(&tx, id).unwrap();
        drop(tx);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&audit).unwrap()["manualStampDutyMinor"],
            "375"
        );
        c.execute_batch("CREATE TRIGGER fail_stamp_outbox BEFORE INSERT ON local_sync_outbox BEGIN SELECT RAISE(ABORT,'injected');END;").unwrap();
    }
    let mut changed = d.clone();
    changed.manual_stamp_duty_minor = Some("900".into());
    assert!(service.save_requisition_draft(changed, now).is_err());
    {
        let c = service.connection.lock().unwrap();
        let row:(i64,i64,i64)=c.query_row("SELECT manual_stamp_duty_minor,total_minor,(SELECT count(*) FROM local_sync_outbox) FROM local_purchase_orders WHERE id=?1",[id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        assert_eq!(row, (375, 12300, 1));
    }
}
