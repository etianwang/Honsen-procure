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
