# Scope2 Windows private transport / native UI — 2026-11-04

Implementation boundary: `src/update_launch_windows.rs` only. Main integration and the final code SHA are owned by the controller. This report is implementation evidence, not a claim that native dialogs or real stable installation have passed.

## Transport

WinHTTP uses the automatic system proxy and normal HTTPS certificate validation. There is no certificate-ignore SECURITY_FLAGS setting, credential copy, cookie jar or public test endpoint. Each request disables automatic redirects, authentication and cookies before sending. Canonical release metadata rejects redirects, non200 and content exceeding1MiB. A single monotonic15-second deadline controls asynchronous send/header/read completion waits; timeout cancels only the asynchronous request.

The initial draft's synchronous cross-thread cancellation was rejected in independent review and removed before execution. The final implementation uses `WINHTTP_FLAG_ASYNC` and a native status callback. Request context and fixed heap read buffer are held by an Arc binding until the final `HANDLE_CLOSING` callback; stack-return/timeouts cannot free a pending read buffer. A focused callback-lifetime regression exercises request-error followed by handle-closing reclamation. No synchronous request is cancelled cross-thread.

Installer requests start only from HTTPS GitHub same-repository release/download URLs and selected exact asset names. Redirects are manually followed at most five times, require HTTPS/443 with no user info/fragment, and permit only github.com same-repository paths or exact release-assets.githubusercontent.com, objects.githubusercontent.com and github-releases.githubusercontent.com hosts. Signed redirect queries are never logged. Downloads stream into a create-new file inside a fresh UUID-owned temp directory, enforce declared asset size<=1GiB and actual length/digest equality, then return a scoped owner whose Drop removes only its own file and directory. No recursive cleanup or install-directory mutation occurs here.

## Native dialogs

Unicode templates are built as UTF16 and finally copied into held Vec<u32> storage, preserving DWORD base/control alignment. DialogBoxIndirectParamW is used with native USER32 controls, font-based scaling, keyboard/tab support and explicit default focus. Three buttons map to UpdateNow/RemindLater/SkipVersion; default, Escape and window close map to RemindLater. Failure warning explicitly states latest version was not verified and requires Continue or Cancel, with Cancel default/ESC/close. Preferences failure has a distinct acknowledgement warning and does not falsely state launch failed. Launch failure uses fixed local safe text.

GetUserDefaultUILanguage selects Chinese/French/English, with unknown languages falling back to Chinese. No production locale override or new CLI is added.

## Native verification hooks

Ignored cfg(test) probes call the real dialogs and assert specific outcomes, so independently clicking the wrong button fails the test:

- native_update_choice_probe: Update now (system language).
- native_french_choice_probe: Skip this version.
- native_english_choice_probe: Remind later (also use Escape).
- native_chinese_choice_probe: Remind later (also use window close).
- native_failure_confirm_probe: Cancel/false.
- native_failure_continue_probe: explicit Continue/true.
- native_canonical_network_probe: readonly actual canonical HTTPS request, safe success flag/timing only.

These probes remain ignored until independently observed. No real stable release is fabricated; a current404/network failure must follow the approved warning policy. Scope3 Toolbox caller/catalog is not modified.

## Primary source references

- [WinHttpCloseHandle lifecycle and asynchronous cancellation](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nf-winhttp-winhttpclosehandle).
- [WinHTTP completion/context callbacks](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nc-winhttp-winhttp_status_callback).
- [WinHTTP option flags](https://learn.microsoft.com/en-us/windows/win32/winhttp/option-flags).
- [Asynchronous read buffer requirements](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nf-winhttp-winhttpreaddata).
- [In-memory Unicode aligned dialog templates](https://learn.microsoft.com/en-us/windows/win32/dlgbox/using-dialog-boxes).

Required Toolbox five-source preflight was refreshed in order. Existing product identity, Manifest/result fields, public arguments, data and uninstall boundaries are preserved.

## Independent pre-integration recheck

The transport initially considered cancelling a synchronous request across threads. Microsoft explicitly prohibits that pattern; it was removed before execution. The final transport is asynchronous and closes only its pending asynchronous request, retaining callback context/buffer through HANDLE_CLOSING.

Independent review of the separate orchestrator found the need to enforce the approved exact display name and propagate preference-warning dialog creation failures. Controller/C own those repairs. The Windows warning now returns a Result, and the shared local fallback warning accurately covers metadata, download and integrity failures; it states the local version is not confirmed latest and will be revalidated only after explicit confirmation. This review is static and does not establish native/install PASS.

## Independent download-file TOCTOU repair

Independent review found the initial stream-digest-only ownership insufficient between writer close and apply. The owner now holds a verified read-only Windows file handle with share-READ only (no share-WRITE/DELETE) through completion of the apply child. After closing the writer, it opens this guard with OPEN_REPARSE_POINT, rejects reparse/nonregular files, then hashes and length-checks that exact guarded file again. Stream hashing alone is not accepted as disk-byte proof.

Before creating the UUID leaf, directory handles are acquired from the temp root down to the leaf, reject reparse points and deny DELETE sharing while allowing ordinary READ/WRITE sharing. They prevent renaming/replacing path ancestors through the launch/apply interval. Drop first releases its file guard, removes only its owned installer file, releases directory guards, then removes only its owned empty UUID directory. There is no recursive removal.

Fresh real Windows filesystem regression PASS2/2: overwrite, installer rename and directory rename fail while guarded; normal source read/copy succeeds; dropping the owner cleans its directory; bad on-disk hash fails and cleanup preserves an external synthetic sentinel. Combined Windows module tests PASS4/4 with7 native/UI/network probes still ignored. `cargo check --bins`, Clippy bins/tests and Rustfmt pass after this repair; interop-template style advisories remain. Tests use H:-based process TEMP/TMP and `.cache/cargo-target`.

The download entry also independently enforces the exact version-derived Setup name and same-repository `/releases/download/v<version>/<name>` URL, matching the already-strict metadata parser. No public CLI/apply/NSIS contract changes.

## Constructor cleanup regression — independent recheck

A further independent review identified a real initialization bug: constructing the file-deleting owner before pinning the new UUID directory meant a rejected junction could redirect failure cleanup to an outside `installer.exe`. A real H:-based synthetic junction regression first failed with the external sentinel absent (RED). The constructor now acquires the leaf directory guard successfully before constructing that owner. On guard failure, it removes only the UUID directory entry itself and never touches any nested file. No metadata-only recheck substitutes for the held guard.

Drop now releases only its own leaf directory guard before removing its empty UUID directory; parent guards remain held until after that removal. The same synthetic-junction test passes after the repair and preserves the outside installer sentinel (GREEN). Combined module5/5 PASS with7 native probes ignored; bins check, Clippy bins/tests and Rustfmt PASS after the change. The test creates/deletes only synthetic `.cache`/TEMP fixtures, never real installers or user data.
