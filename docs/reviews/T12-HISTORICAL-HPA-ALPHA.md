# Alpha historical HPA preview

The installed 0.1.26 native preview failed twice on the completed Bethel2
3,300 XOF HPA. A read-only query of the frozen record confirmed zh_fr, one
material line with nameZh and no nonblank nameFr, and no frozen company
print profile. The strict projection requires the frozen secondary name.
The current material catalog cannot satisfy that check.

The desktop preview offers an internal, screen-only view for a historical
HPA without a frozen print profile when strict projection fails specifically
on a missing secondary translation. The view shows the frozen number,
available names, quantities and amounts. The trusted account scope, snapshot
integrity and formal-number checks run before selecting the view. Complete
HPA, SPO and OPA documents use the strict formal path. New issuance still
requires frozen translations. Internal Excel uses its existing projection.
There is no database migration, sync contract change or historical edit.

## Quote regression

The 0.1.26 Windows Playwright full run had 360 passes and one failure. The
trace resolves the intended XAF option, retries while the popup is moving
and scrolls the root document to 296 px during the click. The click lands
at viewport y=16. The combobox stays open with XAF active but unselected,
before the price assertions. The isolated runs selected XAF and passed
three times. The amount test now selects the active XAF option by keyboard
and retains the visible selection, saved currency, supplier and exact
integer amount assertions. The original full run remains recorded as failed.

## Local verification

- Targeted Windows Chromium run passed all 24 cases, including screen-only
  historical HPA, formal HPA/SPO/OPA, the XAF quote and internal Excel.
- The formal-document matrix saved six PDFs and reopened the files from
  disk, checking A4 dimensions, page count, the last translated line and
  frozen totals. The Chinese/French HPA fixture produced five pages and
  6,400 XOF. These are synthetic browser-rendered files.
- The Rust library suite passed 197 tests with seven opt-in tests ignored.
  The focused isolated SQLite HPA issuance test also passed with the
  strict print projection and preview return checked for equality.

## Installed 0.1.27 user acceptance

`USER_ACCEPTED` applies to one previously issued TEST HPA on Windows x64
0.1.27, built from `6fb38ebee355f71be0e1ccc08c6098354cac7dc3`.
The user verified formal preview in Procure, saved the PDF, and opened it
in WPS PDF. The A4 single-page output used French as the primary language
and Chinese as the secondary language. The user checked the material,
formal number, total, right-side fee summary with zero-value items, and
`Page 1 / 1`.

Windows registration and the installed executable report 0.1.27. The
installed executable differs from the recorded build payload only by
the three-byte Tauri NSIS marker (`UNK` to `NSS`). The unchanged candidate
installer SHA-256 is
`64F6430C4563285079CBD6DB74E462208E13CD9139C29F903248D185C3E402E4`.

The two user-supplied screenshots are attached to the restricted local
handoff at `.cache/alpha-0.1.27-hpa-preview/user-acceptance/` in the
candidate workspace. The public evidence index records their fingerprints.

| Screenshot                    | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `hpa-preview-windows.png`     | `32CD26D721DA610C43D898EC99A08873C0DB3E8240834C181F4CA6F36F43F5AA` |
| `hpa-pdf-reopened-in-wps.png` | `1FD2C482C9A37C1202E2CE877D97FA2FC2EE4FA4008B96ED6EE7424E332014C3` |

## Known issues

The historical compatibility view remains screen-only. The single accepted
HPA does not close other historical HPA cases, SPO, OPA, multipage native
PDF, physical printing, mobile payments, complete three-language coverage
or the native DPI matrix. Toolbox remains Beta.
