# V1 remote Alpha native acceptance — 2026-11-08

Current run only; historical local harness evidence does not establish remote acceptance.

| Item                                                    | Result         | Evidence / limit                                                                                                      |
| ------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Windows install and first launch                        | NATIVE_UI_PASS | NSIS 0.1.18 success screen, installed HonsenProcure.exe window                                                        |
| admin login                                             | NATIVE_UI_PASS | User completed authentication; desktop shows admin / super administrator and successful pull. UUID continuity NOT_RUN |
| Zhanghekai creation                                     | BLOCKED        | Native username check returned available; no account submitted                                                        |
| ceshi1 creation                                         | BLOCKED        | Native username available; name and engineer selected; CI / Bethel2 selected; department list empty                   |
| Employee login / password change                        | NOT_RUN        | Neither test account created                                                                                          |
| Project isolation / revocation                          | NOT_RUN        | Missing account prerequisite                                                                                          |
| Supplier / quotes / procurement / SPO / HPA / receiving | NOT_RUN        | Missing employee accounts and lawful organizational scope                                                             |
| Independent Windows clients and sync                    | NOT_RUN        | Separate Windows profiles and credential isolation not demonstrated                                                   |
| PDF / Excel / COS / upgrade / uninstall preservation    | NOT_RUN        | Installation success does not cover these gates                                                                       |

Installer SHA256: f89b74c71b215ac37e0b4547eb7701a2002ebae22865c3b4b7ed8c3a572e296e.
Installed path: `C:\Program Files\Honsen Program\Honsen Procure\HonsenProcure.exe`.
Runtime source previously recorded as 248f06c; this run did not rebuild it.

Native observations: account scope reload did not restore departments. Country CI
and Bethel2 project were selectable (earlier accessibility disabled interpretation
was corrected). Master data > Departments also displayed no data and exposed a
maintenance form. No lawful department/team definition was supplied or invented.
The account page pulls sync then reads local master data; missing remote records
versus pull/projection omission remains unresolved. No authenticated raw API payload
was captured, so this is not proof that PostgreSQL contains no departments.

Plugin guidance was read and left unchanged. Project preferences are documented in
ALPHA-NATIVE-AUTOMATION.md; no plugin configuration loader was modified. No business
code repair, deployment, migration, seed, admin reset or cloud business write occurred.

BLOCKER: lawful department/team scope unavailable to the installed client.
DEFERRED: determine remote master-data versus sync cause using authorized evidence;
complete employee and remaining native gates after that prerequisite is resolved.
WARNING: native accessibility snapshots can lag rendered state; refresh before claims.

Decision: ALPHA_INTERNAL_TEST_READY is not achieved.

## Authorized organization supplementation (2026-11-08)

User supplied exact approved seed department/team definitions and authorized normal audited maintenance only. Native installed admin UI saved PRJ / 项目部 and PROC / 采购部, then PRJ-CIVIL / 土建施工组 linked to 项目部; PRJ-HVAC / 暖通施工组 submitted. UI reports saved, awaiting sync confirmation; no server acknowledgment payload or independent-client pull evidence collected. Remaining four teams and employee accounts incomplete. No project import, Bootstrap, SQL or deployment. Local save is not remote or dual-client PASS.

## Native continuation after 1ebbee6

Normal UI created PRJ-ELEC, PRJ-PLB, PRJ-FINITION under PRJ. Read-only installed SQLite inspection found exactly PRJ/PROC and five PRJ teams, each version1. All seven outbox upserts have non-null acknowledged_at, null rejected_at and retry_count0. Local create audits identify actor82fe1128-acfa-4155-8937-6daeb5f825fe. This is client acknowledgment/local audit evidence, not direct PostgreSQL/API/server-audit or second-client acceptance. No credentials read. PROC-CFA remains pending business-structure clarification and was not created/granted. Only Administrator Windows profile loaded; no second independently authenticated Windows desktop established. Existing Sandbox accounts are not proof of isolated clients.
ceshi1 again returned available; formal UI confirmation prepared: 测试1 / engineer / CI / Bethel2办公楼 / PRJ / PRJ-CIVIL / 中文. Submission pending mandatory immediate account-creation confirmation under plugin policy. Password only entered into protected runtime field; no password evidence persisted. Original department-choice blocker resolved in UI; account submission and independent remote/two-client evidence remain BLOCKER. Zhanghekai and employee business gates NOT_RUN. No product source fix or deployment. Untracked release-assets preserved.

## ceshi1 actual creation and remote readback

After explicit immediate approval, submitted installed Windows creation form. UI returned 已创建；首次登录必须改密. Switched to managed accounts and queried ceshi1 through normal authorized flow: enabled, display name测试1, and remote scope CI / Bethel2办公楼 / 项目部 / 土建施工组; UI returned 已读取云端授权范围. Creation NATIVE_UI_PASS; creation summary engineer only. Employee authentication, password change, session invalidation and effective role enforcement remain NOT_RUN. No duplicate creation/admin password reset. Initial click geometry failure recovered by activating window and scrolling; no duplicate HTTP submission inferred. Account UUID not exposed in observed UI. Zhanghekai remains uncreated.

## ceshi1 native employee session (2026-11-08)

User completed employee login and reports initial password changed. Observed installed0.1.18 window: 测试1(ceshi1)/工程师, no first-password prompt. Read-only local_accounts confirms UUID98152e88-1a46-434a-8b0e-5937d8a08a95, roles engineer only, enabled1, requires_password_change0. Login landing NATIVE_UI_PASS (user-assisted); password-change interaction user-reported with resulting cache state verified, not autonomously observed. New-password relogin and old-session rejection NOT_RUN. After sync, Bethel2/项目部/土建施工组 selectable; initial missing-scope banner cleared, no defect inferred. Account-management navigation absent; trusted-boundary denial still NOT_RUN.
Actual UI opened new requisition REQ-6455fbe7-0916-4ad8-af47-e2e92ff05859 but material selector returned no data. Material library shows0items/read-only engineer guidance; read-only SQLite local_materials count0. No save or submission, no TEST business record created and no user history altered. BLOCKER controlled TEST material/catalog prerequisite; create through administrator/purchaser normal UI before retry. No code repair justified by empty catalog alone. Independent-client/server-persistence/other Alpha gates remain open.

## Zhanghekai prepared through native admin UI

Normal online existence check returned available. Real creation summary: Zhanghekai / 张和凯 / administrator+purchaser only / CI / Bethel2办公楼 / PRJ / PRJ-CIVIL / 中文. No super administrator selected. Protected runtime password entered without evidence output. Final creation remains pending mandatory action-time approval; no account creation PASS yet. No repeat ceshi1 creation or password reset. Current native window preserved at confirmation page.

## Zhanghekai actual creation and authorized readback

Following existing explicit immediate approval and user resume after Escape stop, installed native UI submitted creation and returned 已创建；首次登录必须改密. Managed-account normal remote query then returned enabled Zhanghekai, display张和凯, scope CI/Bethel2办公楼/项目部/土建施工组 and 已读取云端授权范围. Summary administrator+purchaser, no super administrator. Creation NATIVE_UI_PASS. Effective trusted role enforcement, account UUID, employee login/firstchange/relogin and independent-client tests remain NOT_RUN. User authentication handoff pending under plugin rules. No duplicate ceshi1, resets, deployment, SQL writes or product source edits. Geometry/viewport failures recovered by fresh observation and scrolling, not duplicate account creation.

## Native Zhanghekai catalog workflow

Observed installed0.1.18 authenticated张和凯(Zhanghekai), Bethel2/PRJ/PRJ-CIVIL. Read-only local account UUID739a1cec-4106-4aaf-8e0f-15925ea26481 roles administrator+purchaser, requires_password_change0. Login landing observed; password-change interactions/relogin/session invalidation not observed.
Created via actual GUI suppliers TEST-ALPHA-20261108-A/B (TEST Alpha 合成供应商 A/B), material TEST-ALPHA-20261108-M01 (TEST Alpha 合成验收材料, TEST-MODEL-01, TEST100mm, PCS). Entered synthetic XOF integer quotes A1000/B1200; saved new A1100. Native material table displays A1100/B1200. Read-only SQLite retains A1000 inactive id4b3c6004-d7d4-463b-a1ed-2c6c91726f58, A1100 active6d703735-bf08-4a3a-9820-5dc3529a3069, B1200 activeb1555a75-3c18-44d6-911c-61d3ea55f8c4, all version1. Six catalog outbox events acknowledged, no rejection/retries. NATIVE_UI_PASS for bounded create/quote update; local history retention verified. Direct server read/audit and independent-client pull still unverified; no full sync PASS. No real supplier prices altered. Await employee authentication handoff to verify readonly prices and submit TEST requisition. No product code/schema/deploy changes.

## ceshi1 native TEST requisition submitted

Observed ceshi1 engineer view sees TEST material and A1100/B1200 XOF; only view-all-quotes control, no material/price edit controls or account-management nav. UI-only readonly evidence; trusted rejection not tested. Used real procurement page to choose TEST material, quantity3 PCS at catalogA1100, saved then submitted. UI returned待确认 and disabled line edits. Order UUIDabd2c2c4-a227-49fb-8491-f0cff3382740, display REQ-1b1d727f-202d-424e-8a43-e409f3683fd1, total3300XOF, honsen_self_purchase, workflow_status pending_confirmation, version6. Legacy status remains draft; workflow_status is distinct, no defect inferred. Read-only SQLite line catalog_price_id6d703735-bf08-4a3a-9820-5dc3529a3069 and qty3/unit1100/total3300 verified. All six applicant order events acknowledged/null rejection/retries0, final payload workflow pending_confirmation. NATIVE_UI_PASS for bounded save/submit, client acknowledgment evidence only; server independent read and second-client pull unverified. TEST material identifies synthetic order; no non-test business changed. No source fix/schema/deploy. Await purchaser login handoff for review.

## Native Zhanghekai approval, formal HPA and partial receipt

Continued same authenticated purchaser session without another identity switch. Existing TEST request approved through actual confirm-order control; native audit adds审批已确认. Formal HPA issued through native button: CI-BETHEL2-20261107-HPA-4NM1JMPR-1, execution status采购执行中, audit正式单据已签发. This Honsen-self-purchase path is not SPO/supplier split acceptance. Through execution page registered1PCS of3; native status收货中 and cumulative1/pending2. Bounded approval/HPA issuance/partial receipt NATIVE_UI_PASS; immutable snapshot challenge, duplicate receipt, direct PostgreSQL and independent-client proof still NOT_RUN. Observed order date2026-11-07 although client date2026-11-08; retained as WARNING pending timezone/date verification, no silent source repair. Synthetic payment entry prepared TEST payee/1000XOF, not submitted; immediate financial-action confirmation pending. No real payment executed. UI geometry/out-of-bounds issues recovered by refreshed observations and scrolling; source unchanged.

## Native TEST payment and remaining receipt

After immediate user approval, registered1000XOF TEST simulated payment via real GUI. UI cumulative1000, unpaid2300, original entry retained with reversal button and missing-voucher notice. Payment is Staging ledger only, no bank transfer. Registered remaining2PCS through native receipt form. UI已完成 and receipt controls removed; read-only local order workflow completed version10, formal number unchanged. Latest procurement_expenditure, both receipt events and relevant order events acknowledged/no rejection/retries. Payment registration and remaining receipt bounded NATIVE_UI_PASS; duplicate-request rejection and receipt-sum independent check not yet proven. Reversal pending immediate approval; not submitted. Server direct read/independent clients/PDF/COS remain NOT_RUN. No source/schema/deploy changes; client default business dates remain Nov7 warning.

## Native TEST reversal and actual export failures

After explicit immediate approval, native reversal dialog reason TEST Alpha验收 was submitted. UI retains original+1000XOF and separate-1000XOF, paid0/unpaid3300. Latest procurement_expenditure outbox acknowledged/null rejection. Bounded reversal NATIVE_UI_PASS, no bank transaction. Clicked native Excel export: FAIL explicit 导出失败，未下载部分结果. Formal HPA preview: FAIL 无法预览：请检查授权、正式签发状态及冻结文档翻译. No PDF generated, no Excel PASS. Read-only SQLite confirms language_pair zh_fr with material frozen nameFr/null and nameEn/null. Source248 history-excel calls get_formal_print_document for issued records, so both failures may share translation prerequisite; exact runtime error not exposed, root cause remains candidate until independently rechecked. Do not rewrite formal snapshot. Missing translations in synthetic fixture are retained evidence, not proof of authorization defect. Original source/tools unchanged. DEFERRED valid multilingual fixture and fresh order, export diagnosis, PDF/COS/SPO/independentWindows gates.

## T12 local repair candidate — 2026-11-08

Worktree H:/Honsen/Honsen-Procure-t12, branch codex/t12-native-export-20261108, based on runtimefdf908a (248 runtime) with this historical Alpha report preserved fromc7654b4. All native evidence above remains exact old installed0.1.18; it is not transferred to this changed candidate.
Implemented trusted internal-export projection using the same historical authorization, formal identity and frozen redacted amounts as formal print; only missing translated labels may remain null and receive explicit missingtranslation cells in internal XLSX. Formal print stays strict. Preissue HPA/OPA/SPO rejects missingrequired frozen names before allocating numbers/outbox; structured missing_document_translation returned. Existing historical snapshots untouched. OPA recursive frozen-owner-total export found during independent review and repaired with dedicated redaction/amount regression. New navy A4 template, separate HPA/SPO/OPA bilingual headings and bundled licensed NotoSansSC font are candidate changes, not accepted design.
Evidence: desktop32PASS; focusedExcel8PASS; typecheck/lint/build/format/diffchecksPASS (3existing lint warnings and bundle-size warning). Excel Chromium2DOM downloads and real exceljs reopensPASS using isolated output; these are synthetic browser samples, NOT native Windows acceptance. Earlier shared-output cancellation and ENOENT failures preserved. Print French/English2DOMPASS; pagination FAIL root y=-94 instead0 after three repair attempts, screenshot/trace retained test-results/formal-print-pagination-on-eeb5c--without-hidden-shell-pages-chromium. No testassertion weakened. Windows release EXE compilation passed before final OPA review correction; superseded build, no final native claim. Rust final results and containing checkpoint recorded in memory.
BLOCKER current T12 acceptance: unresolved pagination after3repairs, full native install/save/reopen/print evidence absent. Original historical HPA remains strictly blocked by missing frozen French name; no fake translation/cashreversal/renumbering. SPO/OPA native printNOTRUN. Company-logo/header config and HPA payment/receipt projections absent from current frozenprint contract; not invented. Exact large-money Excel values remain text to avoid precision loss; numericcelltype requirement still open. Parent/draft print, embedded-font PDF structure, physicalA4, PDF text extraction, paymentreceipt print fields, config freezing and real file persistence remain NOTRUN, no T12closure.
DEFERRED approved lightweight transfer expansion: existing cash/bank_transfer/mobile_payment/other schema, UI defaultsother. No transferdata code or migration implemented in this selected T12 slice. Server strict unknownfield validation prevents shipping newdetailpayloads to unchanged Staging; separate compatible servercandidate needed, no deployment permitted. WARNING dependency audit4 vulnerabilities, no automaticdependencychanges; source package-lock unchanged. Toolbox contract/identity/Runner untouched, original integration gates remain open.

Final candidate Rust recheck186PASS0FAIL7originalignored; final Windows release EXE buildPASS after OPA correction, SHA256 532930c5a7e402cc254a50da86c22b8da91a3d74f5991f88b9f978fc499e29c4. It is an uninstalled local binary, not a release/installed acceptance. No final installer run. Browser synthetic missingtranslation XLSX sample .cache/t12-evidence/historical-missing-translation-browser.xlsx SHA25697a8dbae58c75b56bc4697bec339240feca22ac52d44d977a3652ca22f5bc0c3, reopened by exceljs; not native business export. All Rust logs relocated .cache/t12-evidence. T12 stillBLOCKED.
