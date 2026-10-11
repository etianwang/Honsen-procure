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

## Human-readable order numbers

The final server-issued number has this structure:

`<country-code>-<project-code>-<YYYYMMDD>-<INT|supplier-code>-<NNNN>`

Example: `CI-Bethel2-20261010-INT-0001`.

- The date is calculated using the project’s local IANA time zone (for example `Africa/Abidjan` for Côte d’Ivoire and `Africa/Douala` for Cameroon), not the server time zone.
- `INT` denotes the internal parent requisition. Supplier child orders use that supplier’s immutable sequential business code.
- The sequence is four digits. Offline drafts use a provisional local reference. During Push, the server assigns the next free final sequence; on collision it advances sequentially until free and records the immutable provisional-to-final mapping in the audit trail.

## Account and synchronization provisioning

There is no public registration and no separate device-enrollment credential. A super administrator creates administrator, purchaser and viewer accounts with initial passwords; administrator-level user management creates the remaining authorized accounts. Sync is authenticated by the signed-in account session. The server still records an opaque local installation ID only to enforce the one-online-session rule, maintain cursors and deliver forced-lock notifications; it is not a credential and cannot independently access company data.

## Deployment-only configuration

Tencent COS and PostgreSQL settings reside in root `.env` and are excluded from source control. The desktop never receives PostgreSQL or COS secrets. The cloud service reads its own deployment environment; attachment uploads use server-issued short-lived URLs. No secret values are documented, logged or included in fixtures.

## Internal distribution and toolbox updates

The product is internally distributed, not publicly released as a standalone Windows product. It still requires `HonsenUpdateRunner.exe` and the Honsen Toolbox update contract for automatic updates. Permanent `appId`, install directory, EXE name, installer type and internal release/update URL remain required before packaging work; they are intentionally not invented here.
