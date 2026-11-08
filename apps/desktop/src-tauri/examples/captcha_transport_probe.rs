// Public endpoint transport diagnostic. Never logs challenge values or credentials.
fn main() {
    let report = tauri::async_runtime::block_on(async {
        let client = match reqwest::Client::builder()
            .https_only(true)
            .timeout(std::time::Duration::from_secs(20))
            .build()
        {
            Ok(client) => client,
            Err(error) => return serde_json::json!({"stage":"build","error":format!("{error:?}")}),
        };
        match client
            .get("https://api-pr.honsen.africa/v1/api/auth/captcha")
            .send()
            .await
        {
            Err(error) => serde_json::json!({"stage":"send","error":format!("{error:?}")}),
            Ok(response) => {
                let status = response.status().as_u16();
                match response.json::<serde_json::Value>().await {
                    Err(error) => {
                        serde_json::json!({"stage":"decode","status":status,"error":format!("{error:?}")})
                    }
                    Ok(value) => {
                        serde_json::json!({"stage":"complete","status":status,"validId":value.get("id").and_then(|v|v.as_str()).is_some_and(|s|uuid::Uuid::parse_str(s).is_ok()),"hasQuestion":value.get("question").and_then(|v|v.as_str()).is_some()})
                    }
                }
            }
        }
    });
    let path = std::env::args().nth(1).expect("output JSON path required");
    std::fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
}
