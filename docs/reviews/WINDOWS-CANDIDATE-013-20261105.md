# Installed candidate013 verification — 2026-11-05

Application source `21491c5f4ccfbb668425b302f9be6e0523e1d1df`, local test package0.1.13, built by the unchanged `scripts/build-windows-release.mjs` with target `.cache/cargo-release-21491c5`. Build log `.cache/sandbox-start-20261105073206/build-013.log`. Package SHA-256 `19f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b`; actual installed Release EXE `d9ab9881afe245086d4ac9b1fcbda4de87df8fcab02474ec127d098fc678522f`, Runner `dfb9b313833b2af5cceac9f976c666f7097f6b5c16daa73b6f8bad5fad5481f2`.

## Actual completed offline guest evidence

Owned Sandbox `b0663e3a-99e2-4119-976a-545f172b95d0`: Windows10.0.26100, WDAGUtilityAccount, actual started.json and official CLI ExistingLogin mapped-file write verified. Prior disabled-environment blockage is resolved within that boundary; older approval-review refusals remain historical and were not bypassed. Initial duplicate probe encountered single-instance refusal, not a second guest or installation approval rejection.

Fresh013 installation and existing installed Runner hash/target/foreign-PID negative cases PASS. Each rejects without changing installed hashes/registration or restarting the app; see `.cache/sandbox-start-20261105073206/summary.json` and `runner-negative.json`.

Actual Release UI initialized its default production SQLite. A synthetic uncached username with a correct local arithmetic CAPTCHA was refused at ordinary offline login, remained on login page, and refreshed CAPTCHA; `offline-login.json` records the observation. No debug test profile or direct SQLite business mutation was used.

After closing the guest client, actual initialized SQLite was copied read-only for inspection:688128 bytes, integrity_check ok. Actual013 uninstall exited0, removed EXE/registration and retained the identical database hash `634222435f2b53a22e5afb8480fbea30e045c4a6f3a9d28a81d17e465f41b6ad`. This is an empty initialized account/business database, not authenticated historical-business retention.

The same isolated guest then installed verified baseline012 (`05e84cc`, package hash747a66cfd4a760ad98d0c136a94410397ae148b814d5822b8797656000d286ea), and its actual public Runner applied013 successfully. Result identifies from0.1.12/to0.1.13, exit0; actual installed EXE changed fromeec80723dcc2cf368f55df4bc42bbfc5c54d093b0e5b32a4afbabb59d17b219d to the013 hash above. Initialized SQLite remained byte-identical. This does not prove old-schema migration: baseline012 was deliberately not started against the retained013 database. Evidence `upgrade-012-013.json` states that limitation.

UAC cancellation remains UNVERIFIED. A guest-only synthetic ordinary Windows user launched the installer through RunAs; actual observed outcome was the NSIS welcome page without a UAC/credential prompt. The welcome page was cancelled. No fake1223 result or UAC policy change was used. `uac-result.json` and read-only policy evidence are preserved. This guest was stopped through official CLI only after artifacts were retained.

## Network guest boundary

Fresh owned network-enabled guest `1ca169f7-588e-469f-b784-215d1a8e2a35` installed012 before any SQLite existed. GuestIP172.18.187.218/default gateway172.18.176.1 were actually read. Only public synthetic CA and synthetic login credentials were copied into guest input; no CA private key, COS credential or production configuration was mapped. The public CA was trusted only in this disposable guest and ordinary Release was launched with `HONSEN_SYNC_API_BASE_URL=https://172.18.176.1:3444`; TLS verification was not bypassed.

Actual UI could issue local CAPTCHA but online login stayed unavailable. Guest probe confirms TCP172.18.176.1:3444=false and strict HTTPS timeout. Host listener is actually172.18.176.1:3444/PID8840 and host strictTLS proxy request succeeds. Evidence `.cache/sandbox-network-21491c5/{started-network,https-launch,https-connectivity,host-listener3444}.json`. This identifies an unresolved guest-to-host transport boundary, not a product authentication PASS/FAIL. No firewall or security policy was changed.

BLOCKER: installed online login, actual session/role/scope revocation, authenticated-cache/history upgrade retention remain unaccepted while that transport is blocked. UAC prompt cancellation also remains unverified. No host installation, production Release/deployment, real user data deletion, main change or PR merge occurred. Environment restoration and bounded offline installed results do not automatically close original security/Toolbox/release gates.
