# T04 FIX2 final builder evidence

Application candidate `7c57ff3c4258b1603c1d2634772b978c3d3c0285`; subsequent commit `7cf2b669e34434eba2f4989f56ab0ad0cf98a9d9` changes only test formatting. This evidence is builder verification, not independent QA.

- Isolated PostgreSQL 16.15 on loopback port 55472 and separate E:-resident native Windows desktop SQLite profiles were used. The shared database and other QA sessions were not touched.
- Real desktop A/B driver PASS: duplicate categories and dependent material were persisted in quarantine while cursor advanced to 3; administrator repair preserved the original UUID and restored the material reference. Offline conflicting creates produced one accepted and one paused event; recovery preserved the old event and linked a new event, and both desktops converged. Normal create/update, repeated push/pull, legacy snake_case projection and non-administrator denial also passed.
- The recorded synthetic result is `desktop-ab-e136ce1782744ed0a1e8e8fcac6b56fd/close-ab.test.json` in the task-private E: runtime. Reproduction scripts were already pushed in evidence commit `b9ecf4587285d41ef462a2d52095972405d29a3d`; databases, certificates and binaries are intentionally excluded from Git.
- Focused PostgreSQL repair and simultaneous duplicate-group repair: 2 PASS. Local Rust repair/intent regression: 1 PASS. Playwright targeted category recovery tests: 3 PASS. Cargo format/check, server/desktop lint and typecheck, and repository formatting check passed. Existing desktop lint warning in `App.tsx` was nonfatal.
- Independent QA and final GitHub CI for the current head remain separate gates. PR #15 stays Draft; no release hold was changed. Older-program downgrade compatibility remains unverified.
