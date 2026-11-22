# Security policy

SpentSmart holds people's financial data, so security reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue.** Report privately through GitHub:
**Security → Report a vulnerability** on this repository (a private security advisory).

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get an acknowledgement,
and a fix or a plan, as soon as it has been looked at.

## Scope

- The Android app (`apps/mobile`): local storage (SQLCipher, Keystore), the app lock, deep links, the native
  module, exports.
- The sync server (`apps/api`): authentication, row-level security, the sync protocol, rate limits.
- The encryption in `packages/sync-core`: key wrapping, record encryption, merge.

Out of scope: denial of service against the free-tier hosting, findings that need a rooted or compromised phone,
and reports from automated scanners without a demonstrated impact.

## How data is protected

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-model) and
[docs/adr/0001-end-to-end-encrypted-sync.md](docs/adr/0001-end-to-end-encrypted-sync.md).
