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
