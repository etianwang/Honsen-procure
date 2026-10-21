# T04 FIX2 native two-desktop builder evidence

Candidate application source: `e95482346fa41357958e01ee50bfffb0bcb90f03`. This is builder evidence, not independent QA acceptance. PostgreSQL 16.15 ran in the isolated task container on `127.0.0.1:55472`, using the synthetic `t04_fix2_ab_test` database. Both Windows desktop processes used separate E:-resident SQLite profiles, actual WebView IPC, Rust HTTPS and the test server. The test intentionally seeded historical duplicates only into the disposable database.

- Pull of two duplicate categories and one dependent material advanced cursor to 3 and durably recorded three quarantine rows, including the material dependency.
- Administrator invoked the real remote repair command. The second desktop pulled the repaired category and retained the material's original category UUID; all three quarantine rows cleared.
- Two offline desktop categories with different UUIDs and the same code produced one accepted event and one `CATEGORY_CODE_CONFLICT`. A trusted administrator command retained the original event with null acknowledgement and superseded fields, generated a distinct linked event, and pushed it successfully. Both desktop SQLite projections converged on the replacement code.
- Normal create, update, repeat Push/Pull, legacy snake_case Pull and a non-administrator IPC denial passed in the same run. Final driver result: PASS. The full synthetic result and temporary profiles are in the task-private E: runtime, not Git; the two scripts in this evidence commit reproduce the test when supplied an isolated database and built binaries.
- This does not establish independent QA PASS, release readiness or CI status. Independent recheck remains required, including adversarial recovery and authorization boundaries.
