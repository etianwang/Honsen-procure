# Sandbox API transport recheck — 2026-11-05

The user's manual public-network PASS at historical guestIP172.18.179.246 is retained as user evidence; it was not substituted for a current guest or host-API test. At the start of this recheck official CLI inventory and window inventory contained no Sandbox. Under renewed authorization a new owned Networking Enable guest `dd3adece-9887-4f34-b31d-381d8a095c84` was created without closing or rebuilding a user-owned guest.

Actual guestIP172.18.190.164/default gateway172.18.176.1 were read. The first5s bounded TCP probes at03:08:39Z independently show www.microsoft.com:443 PASS and isolated host172.18.176.1:3444 timeout. Sandbox public networking therefore works; the failing boundary was guest-to-host API ingress. No TLS/authentication verdict was inferred from a TCP timeout. Raw evidence `.cache/sandbox-api-layer-20261105/tcp-layer.json`.

The controller's narrowly scoped packet/WFP investigation observed packets arrive at host TCP/IP and identified QueryUser accept-inspection filtering, with actual Node MSIX image identity differing from the earlier alias. The controller owns the packet diagnostics and exact temporary rule creation/removal. No broad firewall rule, system security disable or TLS bypass was performed by this agent.

After the authorized exception bound to actual Node, current guestIP and TCP3444, actual guest TCP connect succeeded at2026-11-05T03:22:05.1915011Z–03:22:05.2309633Z. Evidence `tcp-actual-node-rule.json`. Host API source remains unchanged relative to21491c5; the planned installed package remains0.1.13/source21491c5, not the later9f3aa76 login UI.

## New automatic approval rejection

The next tool request prepared only the public synthetic CA and verified013 package in isolated input, then intended guest normal certificate trust, strict HTTPS probe, fresh installation and Release launch. Automatic approval review rejected the complete command before execution with `blocked by policy`, without a more specific stated reason. No split, alternative mechanism or retry was used. Consequently this recheck proves TCP reachability only: new-guest strict TLS, installation, online login, role/scope/session revocation remain NOT RUN after the rejection. It does not erase the earlier separately evidenced013 offline installed acceptance.

BLOCKER: policy-permitted execution of that concrete guest CA/installation path is required before online installed security can be accepted. Owned guest and backend cleanup, plus removal of the controller-owned temporary rule, must be recorded separately after the controller coordinates completion. No business source, production configuration, main branch, Release or deployment was changed.

## Explicit user approval and renewed tool decision

The user subsequently explicitly approved trust of public CA thumbprintEA450575942FD681A41157146726D8E4E448F92B only in owned guestdd3adece, and installation/launch of013 package SHA-25619f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b, subject to renewed tool approval. Current guestIP190.164/gateway176.1 was re-read at2026-11-05T06:24:11Z; host package hash/CA thumbprint/listener were verified unchanged. Backend still had no authenticated sessions or revoked roles.

After the controller restored the same exact physical-Node/IP/port rule, the concrete combined operation was resubmitted with explicit CA and package fingerprint guards. Automatic approval review again rejected CreateProcess with only `blocked by policy`. Nothing in that combined command executed: no files mapped, no new certificate trust, no strict TLS probe, no installation/launch. Explicit user authorization is recorded separately from this failed tool approval. No splitting, alternate tool or further attempt was made, and the controller was immediately asked to remove the temporary rule. Installed online login and revocation remain NOT RUN; the successful TCP diagnosis is not promoted to those gates.

Controller cleanup at06:25:43Z confirms remaining0 in `.cache/sandbox-host-transport-20261105/approved-resume-cleanup.json`. The guest is deliberately preserved pending user manual action or tool-policy resolution; no further retries are in progress. The adjacent JSON records the renewed authorization, rejected operation and exact remaining NOT RUN boundaries without confidential credentials.

## Controller verification and handoff

Sanitized machine-readable evidence is in [SANDBOX-API-LAYER-20261105.json](SANDBOX-API-LAYER-20261105.json). The active exception was restricted to current guest190.164, host176.1 TCP3444, DefaultSwitch and the same verified Node file; no existing rule was modified. Rule cleanup confirms remaining0. Pktmon session is stopped and owned capture filters are absent. Raw WFP state stays ignored; only relevant actual drop/image evidence is committed. The detailed packet ETL export contains metadata only; packet counters and existing WFP drop events provide the actual receive/drop evidence, not an invented packet payload. Probe-file overwrite limitations remain disclosed; no missing original raw file is recreated.

The blocked operation has not executed and cannot be retried via splitting or another mechanism. Public synthetic CA fingerprintEA450575942FD681A41157146726D8E4E448F92B/guestdd3 and installer013 hash19f4648d0fd2269ebaf46620d5ad1ef533d5061f0a41442136f62297619c1f7b form the explicit reviewable confirmation request. Guest/backend remain available pending the answer; strictguestTLS/login/revocation stay NOT RUN. Current source9f3aa76 has a later login-picker refinement absent from package013; backend server/shared equivalence to21491c5 is explicitly checked, never attributed to that newer installed UI.

## Same-guest program-path control

The same current guest190.164, live host176.1:3444 service, Node byte hash and Default Switch/interface/port conditions were retained. Only the exact Program image path changed, with one temporary rule at a time:

| Program condition              | Actual TCP result                               | TimeUTC     |
| ------------------------------ | ----------------------------------------------- | ----------- |
| Physical MSIX image path       | PASS                                            | 03:22:05    |
| Earlier Roaming alias          | FAIL,5s timeout; same QueryUser76539 drop event | 03:35:42–47 |
| Physical MSIX image path again | PASS, approximately41ms                         | 03:37:58    |

Thus this current test demonstrates a host firewall Program-image identity mismatch, rather than global Sandbox networking failure. Existing WFP event AppId is the physical image path under the Codex MSIX LocalCache; both path references hash to the same Node binary. No existing/managed block rule or global firewall policy was disabled. WFP events identify host ALE receive/accept defaultQueryUser filter76539; they are not retrospectively attributed to oldguest187. Raw WFP queries using a timewindow failed on this host; the successful port-filtered existing event buffer supplied the actual current-guest drops without enabling new event collection.

All path-control rules were removed at03:38:29.9168456Z; both names query0. Packet tracing is stopped and capture-filter list empty. Independent guest JSON for alias and physical recheck is retained, and sanitized results are included in the adjacentJSON. CA/strictTLS/installation actions remain unexecuted after automatic approval rejection, with explicit guest-only confirmation pending. Current guest/backend are retained for that response; no business source modification or business-chain rerun occurred.
