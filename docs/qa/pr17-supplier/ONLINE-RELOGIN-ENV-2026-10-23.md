# PR 17 online revocation re-login — environment recheck

Result: **BLOCKED_ENV**. Candidate PR head: `20da0985fdb18b1e4a6571c54de8a0a4af40282c`; prior QA evidence: `5be8379f8c6cce1c6afda1b9c9387b8cabfdd3a5`.

On 2026-10-23, one independent direct Win32 synthetic credential probe in the current Windows user returned `CredWriteW` false, raw error 8: “内存资源不足，无法处理此命令。” `CredEnumerateW` succeeded and counted 762 credentials. No credential was written or deleted by the probe. The identity was `desktop-rtp971k\\this pc`, medium integrity; the Administrators group was deny-only and `net session` returned system error 5. Thus this session could not provision a fresh Windows user without elevation; existing users were not impersonated or changed. No clean VM was available to this session.

At inspection, Windows 11 Pro reported 13,739,648 KiB free physical memory and 8,947,676 KiB free virtual memory; C: had 8,163,115,008 bytes free and E: 400,351,141,888 bytes free. VaultSvc, SamSs and KeyIso were running. These facts do not establish the exhausted resource or quota. The probe and TEMP were placed in `E:\\Honsen-PR17-QA`; no production database was accessed. No retry loop was used.

The requested real online login, revoke, online re-login, UI/Rust IPC isolation, retained-history check and account switch were not performed in a clean profile: the current profile fails the OS credential-write prerequisite and is not a clean user. Previous offline and server evidence is limited to the exact boundaries in `REVOCATION-FOLLOWUP.md`; it does not establish this online scenario. No new application defect or security pass is claimed. No schema or migration changes.

**BLOCKER:** provide a clean Windows user or VM with a functioning Windows credential vault, then run the requested real EXE/WebView2/Rust IPC scenario against task-owned SQLite, PostgreSQL 16 and HTTPS. Do not remove real credentials or disable protection. PR #17 quality checks were successful on the candidate at inspection; do not lift the security hold on that basis.
