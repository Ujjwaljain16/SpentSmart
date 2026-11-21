# Developing on the emulator

JavaScript changes reload in seconds with a development build and Metro. A new APK is needed only when a native
module or native config (`app.json` plugins, permissions) changes.

## Once

1. Build the development client: `pnpm --filter spentsmart exec eas build -p android --profile development`
   (or locally with `npx expo run:android`, if the laptop has the RAM for Gradle next to the emulator).
2. Install it on the emulator: `adb install -r <downloaded>.apk`.

## Every session

```
pnpm --filter @spentsmart/api dev:local     # API on 127.0.0.1:3000: in-process Postgres, sign-in by name, fake model
pnpm --filter spentsmart start              # Metro; press "a" or open the dev client on the emulator
```

The dev client reads `apps/mobile/.env.development`, so it talks to the local API at `http://10.0.2.2:3000`, and
"Sign in for testing" appears under Settings → Sync & backup.

## End-to-end flows

`apps/mobile/.maestro/` holds Maestro flows (`maestro test apps/mobile/.maestro/<flow>.yaml`). `sync-restore.yaml`
and `assistant.yaml` need the local API running; `import-statement.yaml` needs a statement CSV in the emulator's
Downloads folder (`adb push statement.csv /sdcard/Download/`).

## Memory

The laptop has 16 GB. Run the emulator capped (`-memory 2048`), and don't run a local Gradle build at the same time.
