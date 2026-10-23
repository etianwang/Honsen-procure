// QA only: replay exact authorized PostgreSQL history through production projection.
#[test]
#[ignore = "requires the independent PostgreSQL transcript; run with --include-ignored"]
fn pr17_independent_postgres_transcript_survives_sqlite_restart_and_repair() {
    let source = std::env::var("PR17_QA_TRANSCRIPT").expect("real PostgreSQL transcript required");
    let data: serde_json::Value = serde_json::from_slice(&std::fs::read(source).unwrap()).unwrap();
    let path = std::env::temp_dir().join(format!("independent-pr17-{}.sqlite", Uuid::new_v4()));
    let now = SystemTime::now();
    let mut identity = account();
    identity.id = Uuid::parse_str(data["reader"].as_str().unwrap()).unwrap();
    let open = || {
        let service = LocalAuthService::open(
            Connection::open(&path).unwrap(),
            Box::new(MemoryCredentialVault::new()),
            path.with_extension("media"),
            None,
        )
        .unwrap();
        service
            .cache_verified_account(identity.clone(), "correct-password", now)
            .unwrap();
        let captcha = service.issue_captcha(now).unwrap();
        service
            .offline_login(
                &identity.username,
                "correct-password",
                captcha.id,
                answer(&captcha.question),
                now,
            )
            .unwrap();
        service
    };
    let cursor = data["before"]["nextCursor"].as_str().unwrap();
    let version = data["expanded"]["authorizationVersion"].as_str().unwrap();
    let until = data["expanded"]["replayUntil"].as_str().unwrap();
    let service = open();
    // Existing B-only cache already passed hidden A history; its tail is a real visible event.
    let tail = data["before"]["changes"]
        .as_array()
        .unwrap()
        .last()
        .unwrap()
        .clone();
    assert_eq!(tail["entityType"], "material");
    service
        .apply_sync_pull_page_for_account(
            serde_json::from_value(serde_json::json!({"changes":[tail],"nextCursor":cursor}))
                .unwrap(),
            now,
            identity.id,
            None,
        )
        .unwrap();
    service
        .observe_sync_authorization(
            identity.id,
            data["before"]["authorizationVersion"].as_str().unwrap(),
            data["before"]["replayUntil"].as_str().unwrap(),
            None,
        )
        .unwrap();
    let event_id = Uuid::new_v4().to_string();
    {
        let connection = service.connection.lock().unwrap();
        connection
            .execute(
                "UPDATE local_sync_authorization_replay SET completed=1 WHERE account_id=?1",
                [identity.id.to_string()],
            )
            .unwrap();
        connection.execute("INSERT INTO local_sync_outbox(event_id,entity_type,entity_id,operation,base_version,payload_json,created_at,owner_account_id) VALUES(?1,'material',?2,'upsert',0,'{\"notes\":\"retained pending evidence\"}',1,?3)",params![event_id,Uuid::new_v4().to_string(),identity.id.to_string()]).unwrap();
    }
    assert!(
        service
            .observe_sync_authorization(identity.id, version, until, None)
            .unwrap()
    );
    drop(service);
    for attempt in 1..=2 {
        let service = open();
        let page: SyncPullPageInput = serde_json::from_value(data["replay"][0].clone()).unwrap();
        assert_eq!(page.changes.len(), 500);
        let result =
            service.apply_sync_pull_page_with_replay(page, now, identity.id, None, Some(version));
        let task = service.pending_sync_replay(identity.id).unwrap();
        eprintln!(
            "attempt={attempt}, result={result:?}, incremental={}, replay={task:?}",
            service.pull_cursor_for_account(identity.id).unwrap()
        );
        if result.is_ok() {
            return;
        }
        assert_eq!(
            service.pull_cursor_for_account(identity.id).unwrap(),
            cursor
        );
        assert_eq!(
            task.unwrap(),
            (version.to_owned(), "0".into(), until.to_owned())
        );
        let retained:String=service.connection.lock().unwrap().query_row("SELECT payload_json FROM local_sync_outbox WHERE event_id=?1 AND acknowledged_at IS NULL",[&event_id],|row|row.get(0)).unwrap();
        assert!(retained.contains("retained pending evidence"));
        if attempt == 2 {
            let reference = &data["replay"][0]["changes"][0]["payload"];
            eprintln!(
                "actual first history payload={reference}; typed reference parse={:?}",
                serde_json::from_value::<ReferenceMasterDataInput>(reference.clone())
            );
            panic!(
                "accepted authorized historical page cannot project after grant/restart; retry remains blocked"
            );
        }
    }
}
