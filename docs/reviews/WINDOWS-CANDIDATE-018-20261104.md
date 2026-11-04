# Windows local candidate0.1.8 — 2026-11-04

Status: exact-source build PASS; installed fresh/upgrade payload comparison NOT RUN. Native hidden-start launch is a confirmed hold for this source, with a separate later fix pending its own SHA.

Exact source `11bb10f42acfcbaffcb15710d9768c5bfcbc493b`. The initial tree was clean and production-input comparison remained empty when build completed. New dialog visibility work was not yet written when this package finished; it must not be relabeled as containing that fix.

Immutable installer `H:/Honsen/artifacts/windows/11bb10f-018/Honsen-Procure-0.1.8-Setup.exe`; SHA-256 `a0d5b5c935645dd0103c525bb7f32064f7973273478c315c97d6b80cffa688d6`. Actual production build script exit0; log `.cache/setup-018-build-20261104.log`.

## Captured actual resource Runner

An ignored read-only100ms watcher observed release-assets/HonsenUpdateRunner.exe after first-stage Runner build/resource copy. It required the resource bytes equal the first-stage target Runner before copying. Capture UTC2026-11-04T09:47:23.117Z; main/setup completed later09:48:45Z. Build exit also verified the resource still equaled the captured copy. No build script/NSIS modification occurred.

First resource-stage Runner (final effective installed payload unknown) `H:/Honsen/artifacts/windows/11bb10f-018/expected-payload-HonsenUpdateRunner.exe`,3793408bytes; SHA-256 `d80cbd4ac3b1811c7b0472f17b48b61f82e8054b351a5384e963c7382263e988`. Exact capture metadata and wrapper: adjacent expected-runner.json/capture-build.mjs. This identifies the actual resource payload rather than assuming the post-Tauri targetRunner bytes were bundled.

Actual installed Runner has NOT been compared yet. Possible running-parent replacement behavior is an acceptance question, not a confirmed NSIS defect. The installer public protocol and original apply path were not changed to bypass it.

## Explicit test block and native hold

Automatic tool approval review rejected a batch command that would create new fresh/upgrade Sandbox guest scripts/configuration and stage the candidate. The tool reason was exactly **blocked by policy**; it supplied no more specific explanation. That command did not execute. It was not resent with different encoding/tools or treated as authorized by the user's general setup permission.

A previously created ignored018 upgrade template exists and passes AST parsing, but it has not run and lacks candidate.json/newsetup/wsb staging. Its earlier successful creation does not mean the later rejected action was approved. The existing tracked sandbox-runner-security.ps1 remains a concrete reviewable fresh-install alternative; it was only inspected, not executed during this blocked attempt. No Sandbox was started, production installation modified or UI focus stolen.

The main controller separately observed that this source's native dialog was hidden when launched with STARTUPINFO SW_HIDE, while visible-start worked. A later B-owned private posted-message explicit-show repair is outside11bb10f/018. This package cannot close the hidden-launch gate. A new code SHA/package and actual hidden native interaction are required.

Scope2 stable asset immediate update remains subject to a real qualified canonical release. Disabled Sandbox networking would establish only offline/source-unreachable behavior, not HTTP404. Fresh/upgrade payload identity, actual installed cancel/continue, strict identity negatives, real Toolbox caller and complete security remain OPEN. No formal Release, merge, deployment, COS operation or source-private contract edit occurred.

Correction: subsequent019 investigation found two same-name NSIS input entries, with the external binary later than the resource entry. Therefore018's first-stage capture must not be treated as its final effective payload. No018 install/extraction confirmed its final Runner hash, and the mutable target cache was later overwritten. Preserve the original captured bytes as first-stage evidence only;019 actual fresh verification is separately documented.
