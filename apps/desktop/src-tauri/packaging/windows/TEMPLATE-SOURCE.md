# Pinned NSIS template

Source: https://github.com/tauri-apps/tauri/blob/5b23c82ea5ba6b9aec420dd71f60493edc486aa9/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi

Official `tauri-cli-v2.12.2` tag resolves to that commit. Upstream Git blob SHA-1: `f66b011e6b8acdd3e8e4f463c185e5c347b8f18c` (32390 bytes). License: adjacent TAURI-LICENSE-MIT, copied from the same commit.

Local change: only four per-machine default path assignments add the `Honsen Program` parent. Placeholder conditional, architecture fallbacks, explicit NSIS /D handling, RestorePreviousInstallLocation, pages and all other template behavior remain upstream. Do not regenerate this file from a build-cache script.

Reviewed local template SHA-256: 63e281869ad42d4e69e35a032537a21bd767e24cdd1ec8b759bb4151fe0d99e6.
