# Tauri host boundary

This directory contains the T03 Rust trusted boundary: versioned SQLite authentication migration, Argon2id offline-password verification, OS credential-vault storage for the verifier, CAPTCHA, lockout, idle session lock and Tauri command handlers. The React renderer never accesses SQLite or credentials directly.

No `tauri.conf.json`, bundle identifier, installer or release configuration exists here. Those require the permanently approved Honsen Toolbox identity and remain T15 work.
