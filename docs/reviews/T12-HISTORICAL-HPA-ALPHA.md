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

## Known issues

The historical compatibility view does not offer formal PDF or print.
Windows installed PDF save and reopen need separate acceptance from the
browser PDF tests. Physical printing combinations, mobile payments,
complete three-language coverage and the native DPI matrix remain open.
Toolbox remains Beta.
