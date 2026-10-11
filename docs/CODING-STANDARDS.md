# Coding Standards

## Repository boundaries

Use the intended layout unless a reviewed decision changes it:

```text
apps/desktop      Tauri 2 Rust host and React/TypeScript renderer
apps/server       TypeScript HTTPS API and PostgreSQL migrations
packages/shared   Zod contracts, DTOs, enums and pure business calculations
docs              This specification set
tests             Cross-package integration/E2E fixtures and harnesses
```

The renderer calls only narrow, validated Tauri commands. Tauri owns SQLite access, secure credential access, admin-session enforcement and print/export integration. The server owns PostgreSQL access, account-session authorization, sync idempotency and global change-log sequencing. Code must not bypass these boundaries.

## TypeScript

- Enable `strict` TypeScript. Do not use `any`, unchecked casts, non-null assertions to silence an error, or implicit JSON shapes at a boundary.
- Use Zod schemas for all HTTP/Tauri request and response payloads; infer types from schemas where practical.
- Keep feature UI components focused on presentation and interaction. Put pricing, status transition, snapshot and sync logic in tested shared/domain services.
- Use locale message keys for all visible UI strings and maintain complete `zh-CN`, `fr-FR` and `en-US` catalogs. Do not concatenate translated fragments; use locale-aware date, number and currency formatting.
- Treat `unknown` values from JSON, filesystem, IPC, environment and network as untrusted until validated.
- Use UUID values as opaque strings. Never derive semantic meaning from them.
- Money is integer minor units. Quantities are decimal strings/decimal values. Do not use JavaScript `number` or `Math.round` for financial calculations.
- Return structured domain errors with a stable code, safe user message and optional non-secret diagnostic context. Do not surface raw SQL, tokens or stack traces to the UI.

## Rust/Tauri

- Expose the minimum command surface. Deserialize validated request types and enforce authorization again in Rust.
- Keep authenticated user/session and role state outside React. A frontend boolean is never an authorization control.
- Use parameterized SQL/bound values and explicit SQLite transactions. Every normal mutation that must sync writes its outbox event in the same transaction.
- Do not use a command that accepts arbitrary SQL, file paths, process commands or credentials from the renderer.

## SQL and data changes

- Use named, ordered migrations; do not depend on ORM auto-sync in production.
- Bind all SQL parameters. Add constraints and indexes that enforce documented invariants, while keeping user-facing validation clear.
- Schema changes must update the relevant local/server migration, shared contract, sync behavior, fixture and test. See `DATABASE.md` and `SYNC-PROTOCOL.md`.

## UI and accessibility

- Start on the authenticated home/order screen. Support keyboard operation: initial search focus, Enter to add, Esc to close dialogs and predictable Tab order.
- Use semantic controls, visible labels, accessible validation/error messages and sufficient color contrast. Do not indicate sync, lock or validation state by color alone.
- Preserve offline usability: no screen that is needed for ordinary purchasing may block on a network request.

## Dependencies, configuration and review

- Prefer platform features and existing project dependencies. Add a dependency only when it materially reduces a supported, tested implementation.
- Keep environment-specific values in documented configuration; never hardcode prices, tax/exchange rates, credentials, vendor details or production URLs.
- Each pull request/change describes user impact, affected migrations, sync effect, test evidence and any decision that remains open.
- Formatting, linting, strict typecheck, unit tests and relevant integration/E2E tests are required before completion. Do not claim unrun checks passed.
