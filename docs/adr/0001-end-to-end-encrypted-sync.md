# 0001 — End-to-end encrypted sync

Status: accepted (21 Nov 2026). Implemented and live since 22 Nov 2026 (API on Render, Postgres on Neon, both in Singapore), verified end to end: sign-in, first sync, ciphertext-only storage, wipe → restore with the recovery key, device sign-out, backup deletion.

## Context

Users want their ledger on a second phone and a backup if they lose the first. The data is a complete record of
someone's spending, so the server should not be able to read it. That rules out server-side merging, server-side
insights and any query over amounts; the phone already computes all of those (Phase 4).

## Decision

### Keys

* **Data key (DK):** 32 random bytes per user, made on the first phone that turns sync on. Every record is encrypted
  with it. Kept in the Android Keystore-backed SecureStore, next to the SQLCipher key.
* **Recovery key (RK):** 32 random bytes shown once as a Crockford base32 string in groups of four. The user writes
  it down. It never leaves the phone.
* **Wrapping:** `KEK = HKDF-SHA256(RK, salt = user id, info = "spentsmart/wrap/v1")`, and the server stores
  `XChaCha20-Poly1305(KEK, DK)`. A new phone signs in, downloads the wrapped key and asks for the recovery key.
  Losing the recovery key and every signed-in phone means the synced data is gone; we say so before sync is on.
* **Records:** `XChaCha20-Poly1305(DK, nonce, JSON)` with a fresh 24-byte random nonce and associated data
  `user id | collection | record id`, so the server can't swap ciphertexts between records or users without the
  phone noticing.
* Library: `@noble/ciphers` and `@noble/hashes` (pure JS, audited, no native module, same code in tests and on the
  phone).

### What the server sees

User id, Google subject id and email, device names, and for each record: collection name, record id (a random UUID),
version, deleted flag, ciphertext size and timestamps. Not amounts, payees, categories or dates of payments.

### Protocol

* Every record has a client-made UUID and a version. Version 0 means "never synced".
* **Push** `POST /v1/sync/push`: a batch of operations
  `{ opId, collection, recordId, baseVersion, deleted, ciphertext }`.
  * `opId` is an idempotency key. Replaying an op returns the first result and changes nothing.
  * The server applies an op only when the stored version equals `baseVersion` (compare-and-set). On success the
    version becomes `baseVersion + 1`; otherwise the result is `conflict` with the current version.
* **Pull** `GET /v1/sync/pull?cursor=N`: every record whose per-user change sequence is greater than `N`, oldest
  first, in pages. The phone stores the cursor per device.
* Deletes are tombstones (`deleted = true`, ciphertext kept so the AAD and merge still work) and are never removed
  while any device might still pull them.

### Merging (on the phone)

The phone keeps the last synced plaintext of each record as the *base*. When a pull brings a remote version of a
record that also has unsynced local changes, it merges field by field:

| local vs base | remote vs base | result |
|---|---|---|
| same | changed | take remote |
| changed | same | keep local |
| changed | changed, equal | take it |
| changed | changed, different | keep local, write a **conflict record** (field, both values) for the user to resolve |

Deleted on one side and edited on the other keeps the edited record and writes a conflict, because silently losing
an edit is worse than an extra row the user can delete. The merged record is pushed with the remote version as its
base.

Details that came out of the two-phone tests:

* Only data that means the same on every phone syncs. Created/updated times, the local edit counter, payment-attempt
  links and revision history stay on the device.
* Category keys and the two starting accounts aren't UUIDs, so their record ids are derived from the key. The default
  "Food" category on two phones is the same record and merges without a conflict.
* One active budget per category: a budget set locally and not uploaded yet beats an incoming one; otherwise the
  incoming one replaces the local one. The losing budget is archived and the archive syncs.
* Change tracking is done with SQLite triggers, so no write path can forget to queue an upload. The engine mutes them
  while it applies remote changes.
* "Delete all data" on a phone clears its sync state too and never uploads tombstones.

## Server stack (changes the plan)

The plan said NestJS + Prisma. With end-to-end encryption the API is six tables of opaque rows and one
compare-and-set query, so it is **Fastify + zod + node-postgres with plain SQL migrations**:

* Row-level security needs hand-written SQL anyway (`SET LOCAL app.user_id` per request, a non-owner role).
* Tests run against **PGlite** (real Postgres compiled to WebAssembly): RLS, constraints and transactions behave as
  in production, with no Docker on the laptop or in CI.
* Fewer moving parts on a free-tier instance that cold-starts.

## Consequences

* No server-side features that read data (email digests, server insights, web dashboard) without a new decision.
* The assistant (Phase 6) gets its context from the phone.
* Key rotation: `keyVersion` is stored with every record so a later rotation can re-encrypt in the background.
