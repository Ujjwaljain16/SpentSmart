# Contributing

Thanks for helping. A few things keep SpentSmart trustworthy and easy to change.

## Setup

Node 22, pnpm 10, JDK 17 and the Android SDK. Then:

```bash
pnpm install
pnpm check            # typecheck + lint + tests everywhere; CI runs the same
```

Running the app on an emulator, the local API and Maestro flows: [docs/DEV-LOOP.md](docs/DEV-LOOP.md).

## Ground rules

- **Privacy first.** No analytics, trackers or new network calls without a clear, documented reason. Anything that
  sends data off the phone is opt-in and described in [PRIVACY.md](PRIVACY.md) and the in-app policy.
- **Money is integer paise.** Never floats.
- **Logic goes in `packages/`** as pure, tested TypeScript. Screens orchestrate; repositories are the only code
  that touches SQL.
- **Tests with every change.** Bug fixes come with a regression test that fails without the fix.
- **No `console.*`.** Use `lib/logger`, which redacts amounts, UPI IDs and emails.
- **Migrations are append-only.** Never edit a released migration; add a new one.

## Pull requests

- Small and single-purpose, with a short description of what changed and how it was checked.
- `pnpm check` passes. For UI changes, add a screenshot (light and dark if colours changed).
- Commit messages: short and lowercase, conventional prefixes welcome (`fix:`, `feat:`, `docs:`).

## Reporting bugs

Open an issue with the steps, what you expected, and Settings → Diagnostics output if relevant (it's redacted).
For security issues, see [SECURITY.md](SECURITY.md).
