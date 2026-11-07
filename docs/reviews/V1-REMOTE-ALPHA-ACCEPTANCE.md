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
