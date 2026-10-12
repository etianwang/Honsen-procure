# Initial Master Data and Configuration

## Company and print identity

- Legal Chinese name: `深圳市弘胜装修有限公司`.
- English brand: `Honsen-epc`.
- Logo source: repository-root `logo.ico`.
- Company address, contact details, project-department title, project address, default tax rate, default currency and default print-language pair are project settings. They may be saved as reusable defaults and are snapshotted into an issued document.

## Initial business hierarchy

Business codes are immutable after creation and are maintained by an administrator. The complete approved mapping is in [MASTER-DATA-CODE-APPROVAL.md](MASTER-DATA-CODE-APPROVAL.md); deployment must create it through the authenticated, audited workflow rather than a migration seed.

| Country       | Project                         | Site               | Department                       | Teams                                                                          |
| ------------- | ------------------------------- | ------------------ | -------------------------------- | ------------------------------------------------------------------------------ |
| Côte d’Ivoire | Bethel2 office building project | Bethel2 site       | Côte d’Ivoire project department | HVAC, plumbing, electrical, ELV, façade, fit-out, fire protection, civil works |
| Côte d’Ivoire | Kerene villa project            | Kerene site        | Côte d’Ivoire project department | HVAC, plumbing, electrical, ELV, façade, fit-out, fire protection, civil works |
| Côte d’Ivoire | Mori office                     | Mori office        | Côte d’Ivoire project department | HVAC, plumbing, electrical, ELV, façade, fit-out, fire protection, civil works |
| Cameroon      | Minrex data center              | Minrex data center | Cameroon project department      | HVAC, plumbing, electrical, ELV, façade, fit-out, fire protection, civil works |
| Ethiopia      | Marriott hotel                  | Marriott hotel     | Ethiopia project department      | façade, fit-out                                                                |

The deployment administrator must create the two enabled super-administrator accounts before production use and bind every account to one or more of the above country, project, department and team records. Names, usernames, photos and temporary passwords are provisioned out of band and never committed to this repository.

## Currency and exchange rates

- Supported currencies are `XOF`, `CNY`, `USD` and `EUR`.
- XOF has zero minor decimal places; CNY, USD and EUR have two.
- The system attempts a daily public exchange-rate refresh. If it fails, a purchaser or administrator may enter a rate manually with a reason and audit event.
- Each issued order copies and locks its selected exchange rate; later rate changes cannot alter its totals.

## Human-readable formal document numbers

Formal issue is local and offline-capable. The permanent, readable number is:

`<country-code>-<project-code>-<YYYYMMDD>-<document-type>-<installation-short-code>-<sequence>`

Example: `CI-Bethel2-20261012-OPA-A7K2M9QF-0001`.

- The date is calculated using the project’s local IANA time zone (for example `Africa/Abidjan` for Côte d’Ivoire and `Africa/Douala` for Cameroon), not the server time zone. `OPA` is an owner-self-purchase application; `HPA` is a Honsen-self-purchase application; `SPO` is a supplier-child purchase order. These are fixed document-type enum values, not supplier business codes; master-data validation reserves them from supplier-code reuse.
- A draft may show a local temporary reference only. At formal issue, SQLite transactionally allocates a monotonically increasing, zero-padded local sequence and persists the UUID, formal number, full installation UUID and outbox event together. It may not be regenerated after issue.
- Each installed database has a cryptographically generated persistent installation UUID. Its readable short code is at least eight Crockford-Base32 characters deterministically derived from that UUID; it aids people, but is not a global-uniqueness or security credential. The server stores the full UUID, enforces unique `(installation_uuid, sequence)` and formal-number keys, and validates that the short code matches the UUID.
- A backup restored to the same logical installation keeps its UUID and counter. A database copied to another active installation, or restored after a reinstallation where it will issue new documents, must run an audited clone/recovery re-key before the next issue: generate a new installation UUID/short code and start a new sequence namespace while retaining historical documents unchanged. A fresh installation without a restored database generates a new UUID.
- If a clone or short-code collision nevertheless produces the same formal number for different UUIDs/documents, the server preserves both originals, rejects automatic registration of the later collision and opens an auditable conflict. Neither the number nor the issued snapshot is silently changed. There is no provisional-to-final mapping and the server never assigns a replacement number.

## Account and synchronization provisioning

There is no public registration and no separate device-enrollment credential. A super administrator creates administrator, purchaser and viewer accounts with initial passwords; administrator-level user management creates the remaining authorized accounts. Sync is authenticated by the signed-in account session. The server records the non-secret local installation UUID for the one-online-session rule, cursors, forced-lock notifications and formal-number namespace validation; it is not a credential and cannot independently access company data.

## Deployment-only configuration

Tencent COS and PostgreSQL settings reside in root `.env` and are excluded from source control. The desktop never receives PostgreSQL or COS secrets. The cloud service reads its own deployment environment; attachment uploads use server-issued short-lived URLs. No secret values are documented, logged or included in fixtures.

## Internal distribution and toolbox updates

The product is internally distributed, not publicly released as a standalone Windows product. It still requires `HonsenUpdateRunner.exe` and the Honsen Toolbox update contract for automatic updates. Permanent `appId`, install directory, EXE name, installer type and internal release/update URL remain required before packaging work; they are intentionally not invented here.
