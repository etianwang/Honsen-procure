# Honsen Procure 0.1.27 Internal Alpha delivery

## Frozen artifact

The existing Windows x64 installer is frozen at source
`6fb38ebee355f71be0e1ccc08c6098354cac7dc3`. The acceptance and delivery
commits are documentation-only. The original acceptance checkpoint is
`91ee2a08e38cce1cc7231c5193970d3d428fead9`.

Installer SHA-256
`64F6430C4563285079CBD6DB74E462208E13CD9139C29F903248D185C3E402E4`.
The installer is unsigned. The release package remains 0.1.27.

## Acceptance

`USER_ACCEPTED` covers the user's installed Windows HPA formal preview,
PDF save and WPS PDF reopen for one checked single-page document. The
[scoped evidence index](T12-HISTORICAL-HPA-ALPHA.md) records the source,
installed identity, screenshot fingerprints and exact limits. Original
screenshots remain in the restricted local evidence directory.

Earlier business and automated evidence retains its tested source and scope.
This documentation-only update was checked for formatting, references,
artifact identity and evidence consistency. Existing application tests and
the user's accepted manual operation were not repeated.

## Local delivery

Status is `LOCAL_DELIVERY_READY`, `NOT_DISTRIBUTED`. The local package
is `.cache/alpha-0.1.27-internal-delivery/` in the original candidate
workspace. It contains the unchanged installer, SHA256SUMS, Chinese
installation instructions, Alpha release notes, Known Issues, test coverage,
feedback instructions, distribution steps and a delivery status receipt.
It excludes credentials, device SQLite and raw business evidence.

The authorized distributor must configure a company-restricted destination,
the named recipients and access checks. After upload, verify authorized
download, denied anonymous or unauthorized access, and the downloaded
installer hash. Record the actual channel, date and verifier before marking
distribution complete. The public repository is not an installer channel.

## Remaining scope

Missing frozen translations continue to block historical formal PDF output.
Other historical HPA, native SPO/OPA, multipage and physical printing
scenarios, mobile payments, full language/accessibility/DPI acceptance and
the original parent gates remain open. Toolbox remains Beta.
