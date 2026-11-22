# Developing on the emulator

JavaScript changes reload in seconds with a development build and Metro. A new APK is only needed when native
code or native config changes: the Kotlin module, `app.json` plugins, permissions.

## Once: a development build

Build it locally (no EAS quota needed; about 10 minutes the first time, well under a minute when only the Kotlin
module changed):

```bash
cd apps/mobile
npx expo prebuild -p android --no-install          # generates android/ (git-ignored)
cd android && ./gradlew :app:assembleDebug -Dorg.gradle.jvmargs="-Xmx3g"
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

or, with EAS builds left: `pnpm --filter spentsmart exec eas build -p android --profile development`.

The laptop has 16 GB: run the emulator capped (`-memory 2048`), and prefer not to run a full Gradle build while it's
up. Small incremental builds are fine.

## Every session

```bash
pnpm --filter @spentsmart/api dev:local                  # API on 127.0.0.1:3000: in-process Postgres, sign-in by name, fake model
cd apps/mobile && npx expo start --dev-client --port 8081
adb reverse tcp:8081 tcp:8081
```

Open the app, or jump straight to the bundle:
`adb shell am start -a android.intent.action.VIEW -d "exp+spentsmart://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.

The dev client reads `apps/mobile/.env.development`, so it talks to the local API at `http://10.0.2.2:3000` and
shows "Sign in for testing" under Settings → Sync & backup.

**Gotchas**

- The first bundle can exceed the dev client's timeout. Pre-warm it:
  `curl "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false"`.
- `expo start` and `expo prebuild` rewrite `apps/mobile/tsconfig.json`. Revert with
  `git checkout apps/mobile/tsconfig.json` before committing or running an EAS build (EAS refuses a dirty tree).
- Don't run Metro with `CI=1`: it turns off reloads.
- Reinstalling the APK kills the app and briefly unbinds the notification listener; reopen from Metro.
- On Windows, stopping a background shell doesn't stop the node process under it. Free a port with
  `Get-NetTCPConnection -LocalPort 8081 -State Listen` and `Stop-Process`.

## Emulator settings that matter

```bash
adb shell settings put secure show_ime_with_hard_keyboard 0                      # soft keyboard stops hiding buttons
adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton    # 3-button navigation
adb shell cmd overlay disable com.android.internal.systemui.navbar.gestural
adb shell cmd uimode night yes                                                  # dark mode
```

If the emulator hangs on a quick-boot snapshot, cold boot it with `-no-snapshot-load`.

## End-to-end flows (Maestro)

`apps/mobile/.maestro/` has flows for onboarding (`_onboard.yaml`, used by the others), quick add, account balance,
transfer, budget and safe-to-spend, goals, insights, statement import, sync restore and the assistant.

```bash
maestro test apps/mobile/.maestro/quick-add.yaml
```

- `sync-restore.yaml` and `assistant.yaml` need the local API running.
- `import-statement.yaml` (and `insights.yaml`, which runs it) needs `statement-nov.csv` in Downloads:
  `adb push statement-nov.csv /sdcard/Download/`.

## Testing automatic logging

Fake bank SMS, notification access, the Android 15+ caveat and simulated proxy results:
[CAPTURE.md §7](CAPTURE.md#7-testing-on-the-emulator).

## Release-like builds

Signed APKs that point at the live server: [RELEASING.md](RELEASING.md).
