> 2026-11-05 current environment correction: historical WSL HCS BLOCKED_ENV is resolved. WSL2, normal-user Docker and PostgreSQL16 are freshly working. Business results are evaluated separately at854186c; see [restored acceptance](V1-RESTORED-ACCEPTANCE-20261105.md). The historical source-bound failures below remain preserved.

# V1 business native verification — 2026-11-05

Tested clean frozen application source: `c08ac9ddc0cfe3eeabe7ed464d0c10c034172360`. The containing evidence commit is not the tested source. Exact EXE/helper hashes and the six-file frontend manifest are in the adjacent JSON and raw `.honsen-native-qa/native-smoke-20261104162423-offline.test.json`.

## Actual local native print result

PASS within this boundary: the existing offline native driver, with `HONSEN_PROCURE_NATIVE_PRINT_LINES=40`, used a fresh isolated test profile and actual trusted business IPC to save, approve, allocate and issue an SPO. Ordinary offline login/CAPTCHA and procurement execution opened its frozen Chinese/French preview. No business SQLite writes were used to simulate issuance. The hold deliberately runs one client fixture; it is not a dual-client convergence test.

The actual native print button opened WebView2 system printing. Microsoft Print To PDF saved `.cache/v1-c08ac9d-native-40.pdf`, SHA-256 `c7c25b40b0da22740a46c1f6fea906a5ae599cba8342cac6b312003a3a6e3356`. `pdfinfo` confirms Microsoft producer, four A4 pages, 595.32×841.92 points. Poppler rendered all four PNGs; each was visually inspected. The pages contain 10+14+14+2=40 intact material rows, repeated table headings, HONSEN Procure page headers, actual 1/4 through 4/4 footers and correct 4000 XOF final total. Chinese/French glyphs and specifications are legible; no blank page, row clipping or overlap was observed.

The hold was released through its owned signal; the runner exited zero with scoped fixture PASS and cleaned its owned EXE/server. Ports1420/9241 have no listener afterward. Profiles, PDF, renders and raw evidence remain local. The failed `pdftotext` invocation (executable absent from PATH) is retained; completeness was checked visually on every rendered page rather than claiming an unavailable text-extraction check passed.

## Genuine remaining native business blocker

The prescribed WSL2 environment cannot instantiate: `wsl -d Ubuntu-24.04 -- true` exits -1 with `Wsl/Service/CreateInstance/CreateVm/HCS/HCS_E_HYPERV_NOT_INSTALLED`; raw output is `.cache/v1-native-wsl-blocker.log`. No installation, virtualization/security policy change, alternate database or port substitution was attempted. This is unrelated to the resolved historical CDP argument delivery issue.

Consequently this candidate's real HTTPS/PostgreSQL dual-client payment, reversal, COS, HPA and SPO synchronization chains were not executed. Their acceptance remains BLOCKED_ENV; older source PASS evidence is not transferred. COS credentials were not read and no COS object was touched because the disposable PostgreSQL prerequisite failed first.

BLOCKER: restore the authorized WSL2 virtualization prerequisite, then rebuild/pin the final source and run the existing fresh-database payment/COS, HPA and SPO native runners. DEFERRED: installed-release security, physical printers, all-language native PDF matrix, closed-order historical permissions and other original final gates. WARNING: this successful debug-profile local SPO print does not close those gates or establish network convergence. No main modification, merge, Release or production deployment occurred.
