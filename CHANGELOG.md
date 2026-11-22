# Changelog

All notable changes to SpentSmart. Versions follow the app version in `apps/mobile/app.json`.

## 2.2.1 — 2026-11-23

### Added
- **New icon:** a budget ring around ₹ in the app's teal, as a proper Android adaptive icon with a themed
  (monochrome) layer. Splash and favicon match.
- **Intro tour** on first launch: what the app does, in five slides. Replay it from Settings → How SpentSmart works.
- **Get started checklist** on Home: first expense, UPI payment, budget, tile or widget, backup. Steps tick
  themselves and the list goes away when done; hide or bring it back from Settings.
- **"I don't have the key"** on the restore screen: deletes a backup that can't be opened without its recovery key
  and starts a new one.

### Fixed
- Assistant: retries when Gemini is overloaded (HTTP 500/503) before showing a clear error.
- Assistant: answers come faster; each model runs at the least thinking it allows.
- Assistant: answers render bold, lists and headings instead of showing `**` and `*`.
- Assistant settings: the "Share payee names and notes" switch flips when tapped, and changing it (or the model)
  starts the conversation afresh so old hidden results aren't reused.

## 2.2.0 — 2026-11-23

v2: SpentSmart grows from a UPI payment logger into a full, local-first money app with optional end-to-end
encrypted sync.

### Added
- **Monorepo.** pnpm + Turborepo: `packages/finance` (pure money, UPI, periods, insights and parsers), `packages/sync-core`
  (encryption and merge), `packages/assistant` (tools and loops), `apps/api` (sync server).
- **Ledger v2.** Accounts and balances, transfers that never count as spending, refunds, tags, edit history,
  monthly and category budgets, savings goals.
- **Safe to spend** until payday, on Home.
- **Quick add** from phrases (`swiggy 340 dinner #office`), learning categories from your history (99.6% on 255
  phrases, 95% on a blind set); voice input; receipt OCR on the phone; bank statement CSV import with duplicate
  detection; restore from a SpentSmart CSV export.
- **Insights on the phone:** recurring bills and subscriptions, a month-end forecast with its reasoning, unusual
  spending.
- **End-to-end encrypted sync and backup (optional):** Google sign-in, XChaCha20-Poly1305 with a recovery key only
  you hold, three-way field merge across phones, background sync, device list, delete-backup. Server: Fastify +
  Postgres with row-level security, deployed on Render with Neon (Singapore).
- **Assistant (optional):** ask about your own money with **your own Gemini key**. The phone calls Google directly;
  tools run on the phone and only their figures go to the model; payee names and notes are hidden unless you allow
  them. Amounts the model states that no tool returned are flagged; changes are proposals you confirm.
- **Payments:** Google Pay one-tap for personal UPI IDs via a QR drawn natively (ZXing) before the tap; gallery-QR
  route for other UPI apps; direct intent for shops.
- Quick Settings tile and home-screen widget (Add, Speak, Scan & pay).
- In-app privacy policy; recovery key saved through Android's Save screen; on-phone crash log (redacted).
- Indian digit grouping while typing amounts; theme-matched status and navigation bars; dark mode throughout.

### Changed
- Statement imports and restores insert in bulk (50 rows per statement, all or nothing).
- Insights reuse their result until the data or the day changes.
- Permissions trimmed: photo picker only; contact writing and draw-over-apps blocked.

### Removed
- Automatic logging from notifications and SMS, and the UPI checkout proxy. Built and tested, then removed after a
  phone test showed no dependable source (see `docs/ARCHITECTURE.md`, "Removed: automatic logging").

### Security
- The server refuses to start with test sign-in in production; refresh tokens rotate and reuse revokes the chain;
  every table has row-level security.

## 1.x

The original app: QR scan and pay through your UPI app, categories, insights, CSV/PDF export, app lock, all stored in
SQLCipher on the phone.
