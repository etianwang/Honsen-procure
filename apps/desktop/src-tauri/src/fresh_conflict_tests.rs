use super::*;

fn fixture() -> (LocalAuthService, SystemTime, Uuid, Uuid, String) {
    let service = LocalAuthService::open_in_memory().unwrap();
    let now = SystemTime::now();
    let actor = Uuid::new_v4();
    service
        .cache_verified_account(
            CachedAccount {
                id: actor,
                username: "fresh-conflict-owner".into(),
                roles: vec![Role::Administrator],
                enabled: true,
                requires_password_change: false,
            },
            "synthetic-conflict-password",
            now,
        )
        .unwrap();
    service
        .activate_online_session(actor, &"a".repeat(32), now)
        .unwrap();
    let local =
        serde_json::json!({"notes":"retain this local proposal","manualStampDutyMinor":"37"})
            .to_string();
    let event = Uuid::new_v4();
    {
        let c = service.connection.lock().unwrap();
        c.execute("INSERT INTO local_sync_outbox(event_id,entity_type,entity_id,operation,base_version,payload_json,created_at,owner_account_id) VALUES(?1,'purchase_order',?2,'upsert',0,?3,1,?4)", params![event.to_string(),Uuid::new_v4().to_string(),local,actor.to_string()]).unwrap();
    }
    (service, now, actor, event, local)
}
fn conflict(event: Uuid) -> SyncAcknowledgementInput {
    SyncAcknowledgementInput {
        event_id: event,
        status: "conflict".into(),
        server_version: Some(0),
        error_code: Some("VERSION_CONFLICT".into()),
        server_payload: Some(serde_json::json!({})),
        server_operation: Some("upsert".into()),
    }
}
#[test]
fn fresh_conflict_zero_retains_both_payloads_and_stops_retries_without_acknowledging() {
    let (service, now, _, event, local) = fixture();
    let acknowledgement = conflict(event);
    service
        .apply_sync_acknowledgements(vec![acknowledgement.clone()], now)
        .unwrap();
    assert!(service.pending_sync_events(100, now).unwrap().is_empty());
    {
        let c = service.connection.lock().unwrap();
        let row:(String,Option<i64>,Option<i64>,i64)=c.query_row("SELECT payload_json,acknowledged_at,superseded_at,retry_count FROM local_sync_outbox WHERE event_id=?1",[event.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).unwrap();
        assert_eq!(row.0, local);
        assert_eq!(row.1, None);
        assert!(row.2.is_some());
        assert_eq!(row.3, 0);
        let saved:(i64,String,String,String)=c.query_row("SELECT server_version,local_payload_json,server_payload_json,server_operation FROM local_sync_conflicts WHERE event_id=?1",[event.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).unwrap();
        assert_eq!(saved, (0, local.clone(), "{}".into(), "upsert".into()));
    }
    service
        .apply_sync_acknowledgements(vec![acknowledgement], now)
        .unwrap();
    let c = service.connection.lock().unwrap();
    assert_eq!(
        c.query_row(
            "SELECT count(*) FROM local_sync_conflicts WHERE event_id=?1",
            [event.to_string()],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
    assert_eq!(
        c.query_row(
            "SELECT retry_count FROM local_sync_outbox WHERE event_id=?1",
            [event.to_string()],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}
#[test]
fn fresh_conflict_invalid_envelopes_remain_unacknowledged_and_recoverable() {
    for invalid in 0..9 {
        let (service, now, _, event, local) = fixture();
        let mut ack = conflict(event);
        match invalid {
            0 => ack.server_payload = None,
            1 => ack.server_payload = Some(serde_json::json!([])),
            2 => ack.server_operation = None,
            3 => ack.server_operation = Some("delete".into()),
            4 => ack.server_version = None,
            5 => ack.server_version = Some(-1),
            6 => ack.status = "accepted".into(),
            7 => {
                ack.status = "accepted".into();
                ack.server_version = None;
            }
            _ => {
                ack.status = "accepted".into();
                ack.server_version = Some(-1);
            }
        }
        service.apply_sync_acknowledgements(vec![ack], now).unwrap();
        assert_eq!(service.pending_sync_events(100, now).unwrap().len(), 1);
        let c = service.connection.lock().unwrap();
        let row:(String,Option<i64>,Option<i64>)=c.query_row("SELECT payload_json,acknowledged_at,superseded_at FROM local_sync_outbox WHERE event_id=?1",[event.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
        assert_eq!(row, (local, None, None));
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM local_sync_conflicts WHERE event_id=?1",
                [event.to_string()],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }
    let (service, now, _, event, _) = fixture();
    let mut ack = conflict(event);
    ack.status = "accepted".into();
    ack.server_version = Some(1);
    service.apply_sync_acknowledgements(vec![ack], now).unwrap();
    assert!(service.pending_sync_events(100, now).unwrap().is_empty());
}
#[test]
fn fresh_conflict_cannot_be_consumed_after_switching_account() {
    let (service, now, actor, event, local) = fixture();
    let other = Uuid::new_v4();
    service
        .cache_verified_account(
            CachedAccount {
                id: other,
                username: "other-conflict-user".into(),
                roles: vec![Role::Administrator],
                enabled: true,
                requires_password_change: false,
            },
            "synthetic-conflict-password",
            now,
        )
        .unwrap();
    service
        .activate_online_session(other, &"b".repeat(32), now)
        .unwrap();
    let ack = conflict(event);
    assert_eq!(
        service.apply_sync_acknowledgements_for_account(vec![ack.clone()], now, actor, None),
        Err(AuthError::SyncAccountBoundary)
    );
    service.apply_sync_acknowledgements(vec![ack], now).unwrap();
    let c = service.connection.lock().unwrap();
    let row:(String,Option<i64>,Option<i64>,i64)=c.query_row("SELECT payload_json,acknowledged_at,superseded_at,retry_count FROM local_sync_outbox WHERE event_id=?1",[event.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).unwrap();
    assert_eq!(row, (local, None, None, 0));
    assert_eq!(
        c.query_row(
            "SELECT count(*) FROM local_sync_conflicts WHERE event_id=?1",
            [event.to_string()],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}
