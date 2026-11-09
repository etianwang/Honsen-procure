# Pinned NSIS template

Source: https://github.com/tauri-apps/tauri/blob/5b23c82ea5ba6b9aec420dd71f60493edc486aa9/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi

Official `tauri-cli-v2.12.2` tag resolves to that commit. Upstream Git blob SHA-1: `f66b011e6b8acdd3e8e4f463c185e5c347b8f18c` (32390 bytes). License: adjacent TAURI-LICENSE-MIT, copied from the same commit.

Local changes:

- The accepted installation-directory P1 changes four per-machine default assignments to add the `Honsen Program` parent. Placeholder conditional, architecture fallbacks, explicit NSIS `/D` handling and `RestorePreviousInstallLocation` retain upstream behavior.
- The separately approved Runner-replacement P1 includes the private helper after version definitions, pins/validates the installation directory before installation file writes, excludes the duplicate Runner resource, and uniquely extracts the external Runner into the private plugin directory. A missing or duplicate external Runner fails compilation. The helper publishes and verifies that payload before application registration.
- `toolbox-hooks.nsh` removes the obsolete Runner `CopyFiles`/`Delete`, retains the existing manifest and public registration fields, closes helper guards after registration, and performs strictly paired private-image cleanup before normal uninstall. The helper keeps installer diagnostics separate from the existing Rust adapter log.

No build-script, Tauri configuration, public identity, Manifest, Runner argument/result, URL, data-boundary, directory migration or automatic rollback changes are included. Do not regenerate this file from a build-cache script.

Reviewed local template SHA-256: ccba2ea3631562b3e3fe8f3c9993337b2247bcb3a5e58b88782298c82bed6646.

Implementation and bounded file/NSIS evidence: `docs/reviews/RUNNER-REPLACEMENT-INSTALLER-20261104.md`. Real final-package/public-apply acceptance is recorded separately by the main agent; targeted helper results alone do not close that gate.
