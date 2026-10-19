# Architecture

SpentSmart is an Android-only Expo (SDK 54) / React Native app. Everything is stored in an encrypted SQLite
database on the device. There is no backend.

```
app/                 screens (expo-router). Thin: read via hooks, write via repositories
components/          UI pieces, no storage access
contexts/            Database, Settings, Theme, Security, Categories providers
hooks/               useLiveQuery, usePagedTransactions, debounce, theme colours
services/            side-effects: payments (launch UPI app), export (PDF/CSV), reminders
db/                  SQL driver, migrations, repositories, SQLCipher client + key
domain/              pure logic: money, UPI parse/build/response, periods, categories, reports
modules/upi-intent/  Kotlin Expo module (startActivityForResult, app discovery, app launch)
lib/                 logger (redacting), routes, payment-draft hand-off
tests, **/*.test.ts  vitest
```

## Layers and rules

1. **`domain/` is pure.** No React Native, no storage. Everything in it has unit tests.
2. **`db/` is the only code that touches SQL.** Screens never build queries. Repositories take a `SqlDriver`,
   so the same code runs on-device (expo-sqlite + SQLCipher) and in tests (Node's built-in SQLite).
3. **Screens do not import `db/` internals**; they use `useRepos()` and the hooks.
4. **No `console.*`** (lint-enforced). Use `lib/logger`, which redacts UPI IDs and amounts.

## Data

* **Money is integer paise.** `domain/money.ts` parses user input strictly (no negatives, exponents, > 2
  decimals, zero, or > ₹1 crore). The database `CHECK`s the same rule.
* **Schema** (`db/migrations.ts`, versioned with `PRAGMA user_version`, append-only):
  `transactions`, `categories`, `payment_attempts`, `settings`. Indexes serve time-ordered paging, category
  filters and type filters.
* **Encryption:** SQLCipher, 256-bit random key generated on first launch and stored in Android Keystore via
  `expo-secure-store`. Release builds refuse to open an unencrypted database. A database that cannot be
  opened is never overwritten; the user is shown a recovery screen with an explicit "erase" option.
* **Concurrency:** one connection, all calls serialised in `createSerializedDriver`; transactions are real
  `BEGIN IMMEDIATE … COMMIT`. (expo-sqlite "exclusive" transactions open a second connection that would not
  have the key.)
* **Reads scale:** history is keyset-paginated; analytics are `GROUP BY` queries, not "load everything".
  Measured with 100,000 rows (Node SQLite, see `db/db.test.ts` "scale"): first page ≈ 0.2 ms, deep page ≈ 2 ms,
  text search ≈ 11 ms, a year of insights ≈ 26 ms.
* **UI freshness:** repositories call `notify()` after writes; `useLiveQuery` re-runs while a screen is
  focused. No polling, no per-row storage reads.

## Payments

See [UPI-INTEGRATION.md](UPI-INTEGRATION.md). In short: persist an attempt → pay (direct intent for shops, gallery-QR
for personal payees, which UPI apps refuse to pay by intent) → ask the user to confirm, with the UPI app's answer
pre-selected when there is one → record idempotently.

## Security model

* App lock (biometric / device credential): enabling or disabling requires authenticating; the app starts
  locked (no content flash); lock timeout is configurable; while on, screenshots and the recents thumbnail are
  blocked (`FLAG_SECURE`). If the device later has no screen lock, the app lock turns itself off rather than
  locking the user out.
* Privacy mode masks amounts everywhere through one `Money` component.
* Deep links are untrusted: the payment screen only accepts a draft that passes `draftFromParams`
  (valid UPI ID, strict amount); no deep link can create a transaction. There is no `upi://` intent filter
  and the clipboard is never read.
* Native module: no file access at all (no FileProvider); it only discovers UPI apps, starts a payment for a result
  and opens an app.
* Android Auto Backup is disabled so the database and its key cannot be restored separately or leave the device.
* Exports (PDF/CSV) are written to cache, shared, then deleted; all report content is escaped (HTML) or
  neutralised (CSV formula injection).

## Release

`eas.json` has `development`, `preview`, `production` profiles with matching update channels. `runtimeVersion`
follows `version`; **bump `version` whenever native code or native config changes** so OTA updates only reach
compatible builds. CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests, an Android bundle build and a
production-dependency audit.

## Known limitations

* Not verified on a physical device in this pass: the Kotlin module, SQLCipher, biometric prompts, and each
  UPI app's behaviour (see the device test matrix).
* UPI response is a hint, not proof (no server).
* Update code-signing for OTA is not configured (needs a certificate).
* Remaining `npm audit` findings (24 high / 21 moderate) are transitive build-tooling packages of Expo SDK 54;
  they clear with an SDK upgrade, which should be done and device-tested separately.
