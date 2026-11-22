# SpentSmart v2 — implementation plan

Goal: turn SpentSmart from a private UPI expense logger into a full personal-finance product for young Indian
professionals (track → understand → plan → act), built well enough to ship to real users and to defend line by
line in an engineering interview.

Source: the "PULSE" product blueprint, adapted to what this repo already has. Where this plan disagrees with the
blueprint, the reason is written down.

## Status (22 Nov 2026)

| Phase | State | Left / blocked |
|---|---|---|
| 0 · Close out v1 | Done | — (merchant UPI payment confirmed on a phone) |
| 1 · Monorepo | Done | — |
| 2 · Ledger v2 | Done | — |
| 3 · UX + quick add | Done | Parser 99.6% on 255 phrases, 95% on a 40-phrase blind set. TalkBack: automated check of unnamed or small tap targets; a manual pass with TalkBack is still owed |
| 4 · Insights | Done | — |
| 5 · Sync | Live: Render + Neon (Singapore), Google sign-in. Tested against the live server on the emulator: first sync, server stores ciphertext only, wipe → restore with the recovery key, sign out a device, delete backup | Two-phone test on real devices |
| 6 · Assistant, voice, receipts, import | Built. Voice and receipt scanning confirmed on a phone; assistant tested with the fake model | Assistant is off on the live server until an Anthropic key is set on Render (costs money) |
| 6.5 · Automatic logging | Built: opt-in payment capture from UPI/bank/SMS notifications, review inbox, UPI proxy (beta), Quick Settings tile, home widget. Parser and inbox unit-tested; native code compiles | On-phone test: real GPay/PhonePe/bank alerts, which checkouts list the proxy |
| 7 · Hardening, beta | Started: on-phone crash log, bulk import, permissions trimmed, backup drill, privacy draft (`docs/v2/PRIVACY-DRAFT.md`) | Play listing and consent-screen publishing (not planned for now), low-end performance pass, beta |

How it's tested: `pnpm turbo run typecheck lint test`, plus Maestro flows in `apps/mobile/.maestro` on the emulator
(see `docs/DEV-LOOP.md`).

---

## 1. Where we start (v1, branch `hardening/audit-fixes`)

Already built and tested — v2 builds on these, it does not replace them:

| Blueprint asks for | v1 status |
|---|---|
| Integer minor units for money | Done: `domain/money.ts`, DB `CHECK (amount_paise > 0)` |
| Local SQLite, offline-first | Done: expo-sqlite + **SQLCipher encryption**, versioned migrations, keyset paging, 100k-row test |
| Pure deterministic finance engine | Partly: `domain/` (periods, trends, budget usage, reports) with unit tests |
| Biometric lock, export, privacy | Done: lock overlay, FLAG_SECURE, CSV/PDF export, delete-all |
| Idempotent writes | Done for payments (`attempt_id` unique) |
| CI | Done: typecheck, lint, 164 tests, Android bundle |

What we have that the blueprint doesn't, and keep as the hook: **paying from a UPI QR and capturing the expense in
the same flow** (direct intent for merchants, gallery-QR / GPay-share for personal IDs). Nobody wants to type expenses;
"scan, pay, logged" is the habit-forming loop.

## 2. Product decisions (recommendations, see §7 for the ones you must confirm)

| Decision | Choice | Why |
|---|---|---|
| Name | Keep **SpentSmart** | Already has a package id, EAS project and store-ready assets. Rebrand is cheap later, losing users isn't. |
| Navigation | Home · Activity · Budgets · Insights · Assistant, plus quick-add + scan FAB | Blueprint IA, scan kept as the primary action |
| Capture | Scan & pay (v1) → quick-add text ("swiggy 340 dinner") → voice → receipt OCR → statement import | One `createTransaction` service behind all of them |
| SMS / notification reading | **Not in v2** | Permission and Play policy risk; contradicts the privacy pitch |
| Bank linking (Account Aggregator) | **Not in v2** | Regulated, needs an FIU licence/partner |
| Account balance | Calculated from the ledger, labelled "tracked balance" | Never imply we know the real bank balance |
| Transfers | Own type, paired legs, excluded from spending | Blueprint rule; v1 has no transfers yet |
| Deletion | Soft delete + revision history for transactions | Auditability, needed for sync tombstones |
| AI | Explains and calls tools; never computes or stores numbers itself | Engine computes, DB persists, auth enforces |

## 3. Architecture

```
apps/mobile          Expo app (current repo content moves here)
apps/api             NestJS modular monolith (auth, ledger, budgets, insights, sync, assistant)
packages/finance     pure engine: money, periods, budgets, forecasts, recurring + anomaly detection, insights
packages/contracts   zod schemas + TS types shared by app and API (request/response, sync ops)
packages/config      tsconfig / eslint presets
infra/               docker-compose (Postgres, Redis) for local dev, deploy config
```

* **Monorepo:** pnpm workspaces + Turborepo (cached typecheck/test/build per package).
* **Mobile data layer:** keep the existing hand-written SQL repositories (tested, encrypted, no ORM runtime cost).
  Blueprint suggests Drizzle; switching buys little and risks the encryption setup. Revisit only if schema churn hurts.
* **Backend:** NestJS + PostgreSQL + Prisma, REST `/api/v1`, OpenAPI generated from the zod contracts,
  Postgres row-level security as a second fence behind service-layer ownership checks.
* **Jobs:** BullMQ + Redis only when a job actually exists (recurring detection, insight generation, OCR fallback).
* **Local dev on this laptop (16 GB):** Postgres/Redis in Docker only while working on the API; emulator and Docker
  never at the same time; the EAS build for device tests.

## 4. Phases

Each phase ends with a gate. Nothing moves on until the gate passes. Estimates assume one developer + Claude Code.

### Phase 0 — Close out v1 (≈2–3 days)
* EAS build with the lock/no-app fixes; emulator rerun of lock + share flows.
* Phone run of the UPI matrix (GPay QR share, gallery QR, merchant direct intent).
* Merge PR #1.
* **Gate:** device checks recorded in `docs/UPI-INTEGRATION.md`; PR merged; CI green on `main`.

### Phase 1 — Monorepo + finance package (≈1 week)
* Move app to `apps/mobile`; extract `domain/` → `packages/finance`, shared types → `packages/contracts`.
* Turborepo pipeline; CI runs per affected package; EAS still builds from `apps/mobile`.
* **Gate:** same 164+ tests pass from the new layout; EAS build of `apps/mobile` succeeds; no app behaviour change.

### Phase 2 — Ledger v2 on device (≈1.5 weeks)
* Schema v2 migration (from the v1 schema, tested both ways on real v1 data):
  accounts (cash / bank / wallet / credit card), transaction types expense · income · transfer · refund,
  transfer pairs, merchant, tags, notes, `source` (manual · scan · quick-add · ocr · import · ai),
  `version`, `deleted_at`, `transaction_revisions`, user timezone (IANA) for period boundaries.
* Category budgets with rollover, savings goals.
* Finance engine: tracked balance per account, cash flow, savings rate, budget utilisation + projection.
* **Gate:** property tests for money/period math; transfers never count as spending; v1 → v2 migration test on a
  fixture DB; 100k-row performance test still within limits.

### Phase 3 — New UX + quick-add (≈2 weeks)
* Five-tab navigation, redesigned Home (tracked balance, income/expense, **safe to spend**, on-track status,
  budgets, recent), Activity with filters (date, category, account, amount, merchant, tags).
* Quick-add sheet with an **on-device rule-based parser** (amount, merchant dictionary, category hints, relative
  dates: "yesterday", "last friday") and a confirm preview. No network, instant, testable.
* Onboarding v2 (≈60 s: income, payday, goals, budget, lock), all optional.
* Maestro E2E flows: onboarding, quick-add, scan-and-pay review, budget alert, export.
* **Gate:** Maestro suite green on the emulator; parser accuracy ≥ 90 % on a 200-phrase test set we write;
  TalkBack pass on every screen.

### Phase 4 — Insights engine (≈1.5 weeks, all on device)
* Recurring/subscription detection (amount + cadence + merchant similarity, with confidence).
* Month-end forecast that accounts for already-paid fixed costs and known recurring bills, with a range, not a
  single number.
* Anomaly flags (unusual amount for a merchant/category), period comparisons.
* Every insight carries its evidence (transaction ids, period, formula) and the UI can show "why".
* **Gate:** each detector has fixture-based tests including false-positive cases; insights render offline.

### Phase 5 — Accounts, backend and sync (≈2.5 weeks)
* NestJS API: auth, devices, ledger, budgets, goals, sync. Docker compose for local dev; integration tests against
  a real Postgres in CI (testcontainers).
* Sync protocol: client UUIDs, outbox table, `POST /sync/push` with per-op idempotency keys, `GET /sync/pull` with
  a per-device cursor, version numbers, tombstones, field-level merge with explicit conflict records the user can
  resolve. Foreground sync on open/network change + best-effort background task.
* Security: rotating refresh tokens, Keystore storage, rate limits, RLS, cross-user attack tests.
* **Privacy model — decision needed (§7.1).**
* **Gate:** two-device test (both emulators/phones) — offline edits on both, reconnect, no duplicates, conflicts
  surfaced; cross-user access tests all fail closed; account deletion removes server data.

### Phase 6 — Assistant, voice, receipts (≈2 weeks)
* Assistant: provider-agnostic adapter (Claude by default), tool calling over finance-engine tools
  (`get_summary`, `compare_periods`, `search_transactions`, `budget_status`, `upcoming_recurring`,
  `can_i_afford`, `create_transaction` / `create_goal` with mandatory confirmation). Only aggregates and the
  minimum rows needed leave the device; nothing is used for training.
* Voice capture → Android speech recogniser → same quick-add parser.
* Receipt OCR on device (ML Kit text recognition) → parser → confirm; images stay on the phone unless synced.
* Statement import: PhonePe / GPay / bank CSV/PDF exports → dedupe against existing records.
* **Gate:** assistant eval set (≈50 questions with known answers from a fixture ledger) — every number traceable to a
  tool result; mutation tools never run without confirmation.

### Phase 7 — Hardening and public beta (≈1.5 weeks)
* Crash/error reporting with PII scrubbing (Sentry, self-host or strict config), performance budgets on a low-end
  device, backups/restore test, updated privacy policy and Play data-safety form.
* Play internal testing → closed beta with 20–30 users; track onboarding completion, time to first transaction,
  7/30-day retention, weekly "reviewed my finances" (north star).
* **Gate:** no known critical/high security issues; crash-free sessions ≥ 99.5 % over the beta's first two weeks.

**Total:** roughly 14–15 weeks of focused work. The blueprint's 10 weeks assumed a greenfield app and skipped
statement import and the on-device parser; the extra time goes into correctness, not features.

## 5. Portfolio story (what each phase proves)

| Claim you can make in an interview | Evidence in the repo |
|---|---|
| "Money is never a float, transfers never count as spending" | finance package property tests |
| "It works fully offline and syncs without duplicates" | sync protocol doc + two-device test |
| "Encrypted on device, user-scoped on the server" | SQLCipher setup, RLS policies, cross-user tests |
| "The AI can't make up numbers" | tool layer + eval set with traceable answers |
| "It handles 100k transactions" | scale tests on device and API |
| "Real users use it" | beta metrics write-up |

Write an ADR (`docs/adr/NNNN-*.md`) for every decision in §2–§3 as it is made; they are the interview talking points.

## 6. Out of scope for v2

Bank/AA integration, SMS parsing, shared budgets with roommates (v3 candidate: split via UPI collect links),
web dashboard, iOS release (code stays portable), multi-currency, paid plan.

## 7. Decisions (confirmed 21 Nov 2026)

* **Sync:** end-to-end encrypted. The server stores ciphertext only; insights and assistant context are computed
  on the phone. Consequences for Phase 5: per-user data key wrapped by a key derived on device (backed up via a
  recovery key the user saves), server-side jobs limited to opaque sync bookkeeping, RLS still enforced.
* **AI:** assistant built behind a feature flag (tool layer + eval set first); a paid model is enabled only once
  beta feedback asks for it.
* **Hosting:** free tiers for the beta (Neon Postgres + free Render/Fly instance; accept cold starts).
* **Sign-in:** Google sign-in (Credential Manager on Android), server verifies the Google ID token and issues its
  own short-lived access + rotating refresh tokens.

The options that were considered:

1. **Privacy model for sync.**
   * *A — end-to-end encrypted sync (recommended for this product):* the server stores only ciphertext. Keeps the
     "your data never leaves your phone readable" promise, which is the brand. Cost: the server can't compute
     insights or answer the assistant on its own; all of that runs on device (already true for insights).
   * *B — standard server-readable sync (blueprint default):* simpler, enables server-side jobs, but the privacy
     pitch and policy have to change.
2. **AI cost.** An LLM assistant needs a paid API key (a few hundred rupees a month at beta scale for a small model).
   OK to spend that, or keep the assistant behind a flag until beta feedback says it matters?
3. **Hosting.** Free tiers (Neon Postgres + Render/Fly free instance, cold starts) for the beta, or a small paid
   instance (~₹500–1,500/month) for fewer surprises?
4. **Sign-in.** Email one-time code (simplest, no Google dependency) or Google sign-in (one tap, Android-native)?
