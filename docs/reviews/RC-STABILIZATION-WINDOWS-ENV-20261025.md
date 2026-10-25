# RC stabilization — Windows environment evidence — 2026-10-25

Status: **clean Sandbox environment eligibility PASS; native login and dual-client acceptance NOT RUN / BLOCKED_ENV**. This evidence-only T14 slice does not close security, Formal, T09/T10/T11, parent tasks or release gates.

## Source and isolation

- Agent A continued its existing `codex/procurement-t09a` worktree from `ca44150c966fe5c2041442f4d34f0c6ed7b2342c`, initially clean. The containing documentation commit is this slice's checkpoint. No application, migration, installer, Runner, publishing or Toolbox contract implementation changed.
- The user-authorized RC stabilization preserves frozen candidate `f4756afdb01ebac7b17ae9016d9ad56ab450fea5`; this branch never moves that ref. The controller's subsequent `710edd7` handoff is evidence, not a replacement source identity. Current rules were also read from the controller's AGENTS.md without modifying this worktree's rules.
- Read-only verification of `E:/Honsen-build/rc/artifacts/f4756afdb01ebac7b17ae9016d9ad56ab450fea5/delivery-inventory.json` and actual files matched:

| Artifact                         | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `HonsenProcure.exe`              | `71b7518ca03730518e6c6c1456c74cbc0f7ef0a7aa4529d49374096fe7181eb5` |
| `Honsen-Procure-0.1.2-Setup.exe` | `23ac1e5cc35b2840e905a4078b2d333b9f0faa60bbe91c0cdd96116b63f78577` |

These checks establish artifact identity only. Neither file was installed or used for login on the host by Agent A.

## Fresh environment checks

- Windows Sandbox Appx `0.8.107.0` is already installed. Initial `wsb list --raw` returned no running environments. Hyper-V `Get-VM` failed because this account lacks inventory permission; running vmms/vmcompute services do not establish that a usable VM exists. No VMware/VirtualBox command or active process, configured SSH test-machine alias, or explicitly supplied remote test host was found. No system feature, account default, group membership or production configuration changed.
- Reused the existing task-owned `E:/Honsen-T09A/sandbox/eligibility-20261024213803/eligibility.wsb`, after reading its mappings and decoded logon command. That command only writes a task-unique synthetic credential in the guest, removes that same credential if created, and records guest OS/WebView2/network metadata. It never reads production or COS credentials.
- Copied the configuration to fresh `E:/Honsen-build/agent-a/rc-stabilization-20261025/eligibility.wsb`, changing only the writable host-output directory. The historical input remains read-only and historical output is untouched. No new test harness or application code was created.
- `wsb start --config <existing XML text> --raw` created Sandbox **`e922739e-4dcc-4b75-a6af-4894140ae3bd`**. Passing the filename first was rejected as invalid configuration; the CLI accepts the XML text. This argument error changed no application/system configuration.
- Initial `ExistingLogin` execution failed `0x80070520` because no interactive session existed. The installed `wsb connect` entry point established it; subsequent `wsb exec ... --run-as ExistingLogin --command 'cmd.exe /c ver' --raw` returned exit code zero. No protection was disabled.
- Fresh guest evidence at **2026-10-25T12:28:50.1730001Z**: synthetic credential write exit code `0`, `ownCredentialRemoved=true`, WebView2 `155.0.4283.62`, guest Windows `10.0.26100.0`, separate `WDAGUtilityAccount`. Node is not preinstalled. Raw task evidence is `E:/Honsen-build/agent-a/rc-stabilization-20261025/output/eligibility.json`; session metadata and connect logs are in its parent task directory.
- Agent A handed this one guest to Agent C for its separately owned fixed-candidate installation validation. Guest commands are serialized between owners. That handoff is not an installation/update acceptance claim by Agent A.
- After C returned exclusive guest access, Agent A ran the existing packaged `honsen-procure-test-profile.exe vault-probe` directly from C's explicit guest installation directory, using two fresh task-unique `.test.sqlite` paths. At **2026-10-25T12:33:19.1905971Z**, both the Sandbox command and native utility returned exit code `0` and `PASS native test-profile OS credential-vault probe`. The utility wrote/read back and removed only its own two synthetic credentials. Its SHA-256 is **`dcf67230ebefcda6e70fe3a16191e535563a6ec8af65a8f8896ef0167b83cbe7`**, exactly the utility hash in the fixed candidate's host failure record. No application source or protection setting changed. Evidence: `output/native-vault-probe.json` and `output/native-vault-probe.log` beneath the task root above. This is native credential-library environment evidence, not application login.

The current host's fixed-candidate native utility failure with Windows error 8 was already recorded by the controller at 2026-10-25T12:09:24.0376334Z. Agent A did **not** repeat host CredWrite, remove existing host credentials, lower protection or treat the guest probe as a native-login PASS. Historical 2026-10-24 guest results were only navigation evidence; the eligibility result above was freshly obtained.

## Remaining acceptance and safe recovery

- **BLOCKER — native login/security:** installed actual-EXE online login, revocation followed by forced lock/re-login, and unauthorized-command denial have not run in this guest. The existing credential-free `native-test-server.ts` binds only host loopback, which is not the guest's loopback. Its existing native-security driver uses debug-only smoke modes and hardcoded debug build paths; it cannot simply be presented as the fixed release executable's acceptance. No proxy, alternate security path or replacement driver was invented.
- **BLOCKER — T09/T11 dual client/COS:** the existing guest-capable T09/T11 wrapper can use the private test host, but requires an authorized `CosEnvFile` and real isolated test namespace. No such configuration was supplied to this run, and no COS test environment variables were present. Production `.env` was not read and fake cloud values were not invented. Actual payment/reversal/offline restart/cross-client COS integrity/expiry acceptance remains NOT RUN; no fixture, SQLite test or old COS evidence substitutes for it.
- **DEFERRED:** Agent C owns isolated installation/discovery/start/update/uninstall/retention results and the controller owns the new stabilization RC and independent acceptance. Existing Toolbox contract conflicts retain their approval boundary. No parent or security hold is automatically closed.
- **WARNING:** a clean guest now exists, so “no clean Windows available” would be inaccurate. Environment eligibility is narrower than binary login, installed product acceptance or production readiness. Host vault failure and successful guest probe are separate facts.
- **WARNING:** C reported that the fixed installer split registration/uninstaller and application files across different guest directories. A used only the actual explicit application directory for the native utility and did not treat registration as trustworthy or erase that diagnostic installation. C owns the installed-path defect and its independent evidence; a fresh installer repair must be qualified separately.

Safe continuation is to verify the current guest owner and final binary SHA, preserve all prior evidence, and supply the explicitly authorized COS test configuration to the existing guest-capable test path. A separate exact-release native revocation proof is still required. Do not rerun the failing host probe or mutate the frozen RC to make these gates appear complete.
