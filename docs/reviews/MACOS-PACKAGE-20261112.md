# macOS Apple Silicon candidate — 2026-11-12

## Scope

User-authorized bounded T15 packaging slice (D), with confirmed macOS startup
and credential persistence defects (B). Baseline `dd46489`; task branch
`codex/macos-package-20261112`. No parent task or release gate closes.

Windows continues using its existing LOCALAPPDATA product directory. macOS
uses `~/Library/Application Support/africa.honsen.procure/honsen.procure.sqlite`.
Missing or relative profile roots fail closed. Debug-only isolated profiles
remain unchanged. Keyring enables the Apple native Keychain backend as well
as the existing Windows backend. No schema migration, synchronization,
authorization, money, snapshot or server change is included.

The macOS override retains `africa.honsen.procure`, `Honsen Procure` and
`HonsenProcure`, builds version 0.1.27, and targets macOS 12 or newer.
The ICNS and PNG are converted from the existing ICO; no new visual identity is added.
Windows configuration, Toolbox identity, Runner, registry and update assets
are unchanged. No Windows manifest is fabricated for the macOS bundle.

## Build

Use Node 24.18.0 from `.nvmrc`, `npm ci`, Rust and Apple Command Line Tools.
On the Apple Silicon build host:

```sh
npm run release:macos --workspace @honsen/desktop
```

Tauri writes the `.app` under `apps/desktop/src-tauri/target/release/bundle/macos/`
and the `.dmg` under `apps/desktop/src-tauri/target/release/bundle/dmg/`.
This candidate is local only; it must not be added to the Windows Toolbox
stable release assets. No Developer ID identity is available on this host;
The bundle uses local ad-hoc signing with a sealed resource manifest.
Developer ID signing and Apple notarization are not claimed.

## Environment and acceptance

Host: macOS 26.6.2, arm64, Command Line Tools SDK 26.4.1, approximately
200 GiB free at preflight. Initial Node 26.7.0 did not match `.nvmrc`;
official Node 24.18.0 arm64 was downloaded to ignored project cache and its
SHA-256 matched the official distribution checksum. Initial Rust and Colima
were absent. Docker initially selected Docker Desktop; no database tests
will run on that context. The restricted-shell GitHub CLI probe failed; a subsequent normally authorized
network/Keychain probe succeeded. The GitHub connector also authenticated.
No token value was read or logged.

Toolbox preflight was read in the required five-source order. The remaining
actual third-party caller/launch arguments and joint Windows acceptance gaps
remain Beta work. These Windows contracts do not define a macOS Runner.

Validation: desktop typecheck, lint, unit 76/76 and production build PASS;
whole-repository Prettier PASS; original Windows manifest/update-source
regressions 9/9 PASS. Rust directory/native-backend tests 3/3, macOS library
188/188, real Keychain set/recreated-entry read/delete 1/1, fmt and Clippy PASS.
The native test uses a unique synthetic service and deletes only that entry.
The macOS employee-executable regression PASS. Existing Windows-only tests
are conditionally absent on macOS; none is relabeled as passed.

Initial native test compilation failed because Tauri required a PNG icon;
the first copy used the wrong working-directory-relative path and the retry
retained the same failure. After correcting the copy, all three path tests
and the following Rust gates passed. Initial app inspection also rejected
the linker-only resource signature. Explicit ad-hoc bundle signing fixed
that boundary. The signed intermediate app included every Cargo binary;
the macOS-only build script now removes the four known generated helpers,
rejects any unexpected executable and reseals/verifies the app before DMG
creation. Initial/intermediate bundles are not delivery candidates.

Rust 1.97.1/Cargo 1.97.1 and Colima 0.10.3 were installed. Colima status is
not running; Compose 5.3.1 and Buildx 0.36.0 are available. No local PostgreSQL
suite ran: no server/shared/schema change; CI retains the full isolated PG
gate. No Docker Desktop database or existing Docker resource was modified.
No shell profile or default Node installation was changed. Use .nvmrc;
the Homebrew node@24 keg is 24.19.0 and is not the selected project runtime.

Final DMG: `Honsen Procure_0.1.27_aarch64.dmg`, 21,014,483 bytes.
SHA-256 `84521b60c91af7e20ded570aab1743bc2d481cd3c0e44ff1ae2737a958825a70`.
Main Mach-O arm64 SHA-256
`6cf35a9c0aaff15339e29b227fcb8d86ef38c047493fae2f05a2e97ba5d64858`.
`hdiutil verify` PASS. A separate read-only mount verified identical main
hash, only one executable, valid deep/strict ad-hoc signature and Info.plist
version 0.1.27, identifier africa.honsen.procure and minimum macOS 12.0.
The owned mount was detached successfully. The mounted Applications link
points to `/Applications`; no installation was performed by this workflow.

Native startup PASS for the final generated app. After the user's ChatGPT
permission/restart handoff, inspection found an intermediate app under
`/Applications/Honsen Procure.app` with main SHA-256
`ac2eac9c4b6f96f84deae86430e3f1028552ea65094d85624a8e48418b76f6f1`
and four helper tools. That installed app was left untouched on disk.
Its empty login process was quit normally before launching the final app
by its full generated path. A separate process-path check confirmed PID
36101 executed the final generated bundle, not the intermediate installed
copy. The native accessibility tree showed the Chinese login page and then
exactly one cloud CAPTCHA, empty account/password fields and disabled online
login. No CAPTCHA was solved and no login or business write was performed.
The final app remains at its login page for the user. This is startup proof,
not authenticated workflow or installed-final-package acceptance.

The final build uses the containing task commit's production file contents.
Documentation updates after artifact creation do not change those inputs.
Local logs and DMG remain ignored; exact source/evidence checkpoint is the
containing commit, with CI/main outcome reported separately.

## Remaining issues

- BLOCKER: none for this bounded local package/startup slice; main integration
  still requires the PR quality gate.
- DEFERRED: authenticated macOS online/offline workflow, synchronization,
  export/printing, three-language/DPI and full native security acceptance.
- DEFERRED: original Windows Alpha distribution, Toolbox Beta and all parent gates.
- WARNING: the installed `/Applications` intermediate copy must be replaced
  using the final DMG before normal use; it was not overwritten automatically.
- WARNING: no Developer ID/notarization, existing lint/chunk warnings and
  four npm audit advisories (one low, three moderate); no dependency refresh.
