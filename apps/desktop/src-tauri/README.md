# Tauri host boundary

This directory contains the T03 Rust trusted boundary: versioned SQLite authentication migration, Argon2id offline-password verification, OS credential-vault storage for the verifier, CAPTCHA, lockout, idle session lock and Tauri command handlers. The React renderer never accesses SQLite or credentials directly.

`tauri.conf.json` now defines the approved development host identity (`honsen.procure` is the Toolbox appId; `africa.honsen.procure` is the distinct Tauri identifier) and registers the existing trusted commands. It has `bundle.active: false`: no installer, Runner, Toolbox manifest, registry entry or release artifact exists here. See `docs/HONSEN_TOOLBOX_INTEGRATION.md` for the still-unimplemented release contract.
