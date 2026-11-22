# Releasing

## Build profiles (`apps/mobile/eas.json`)

| Profile | Output | Talks to | Notes |
|---|---|---|---|
| `development` | APK, dev client | Metro + local API | for the dev loop |
| `preview` | APK | `https://spentsmart.onrender.com` | the build you install on a phone |
| `emulator` | APK | `http://10.0.2.2:3000` with test sign-in | release build against the local API |
| `production` | app bundle | live server | Play Store; version code auto-increments |

```bash
cd apps/mobile
eas build -p android --profile preview
```

- EAS refuses to build from a dirty tree: commit first, and revert `tsconfig.json` if Expo rewrote it.
- `runtimeVersion` follows the app `version` (policy `appVersion`). Bump `version` in `app.json` whenever native
  code or native config changes, so OTA updates (`eas update --channel preview`) only reach compatible builds.
- Version codes are kept by EAS (`appVersionSource: remote`); only `production` auto-increments. Preview APKs and
  local builds are all version code 1, so each installs over the last as an update.
- The free plan has a monthly Android build quota. Batch fixes into one build per test round.

## Building a signed release APK locally

Installs from a download as long as the app declares none of the permissions Play Protect blocks for sideloaded
apps in India (SMS, notification listener, accessibility). Same signature as EAS builds, so it installs over them as an update and Google sign-in keeps working (Google
checks the signing certificate's SHA-1).

1. **Download the EAS keystore once:** `npx eas-cli credentials -p android` → `preview` → *Keystore* →
   *Download existing keystore*. It's saved in `apps/mobile` as `*.jks` (git-ignored) and the passwords are printed.
2. **Generate the native project:** `npx expo prebuild -p android --no-install`.
3. **Point release signing at the keystore.** Put the four values in `apps/mobile/android/keystore.properties`
   (inside the git-ignored `android/`):

   ```properties
   storeFile=C:/dev/SpentSmart-v2/apps/mobile/<name>.jks
   storePassword=…
   keyAlias=…
   keyPassword=…
   ```

   and in `android/app/build.gradle` add a `release` signing config that loads it, used by `buildTypes.release`.
4. **Work around the monorepo entry path on Windows.** Gradle passes an absolute entry file that Expo turns into a
   path relative to `apps/mobile` but resolves from the repo root. Point `entryFile` at
   `"${projectRoot}/node_modules/expo-router/entry.js"` and give it a temporary junction:

   ```powershell
   New-Item -ItemType Junction -Path apps\mobile\node_modules\expo-router -Target node_modules\expo-router
   ```

   Remove the junction afterwards (`[IO.Directory]::Delete(...)`), or Metro may see two copies.
5. **Build with the profile's public settings:**

   ```bash
   export EXPO_PUBLIC_API_URL=https://spentsmart.onrender.com
   export EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id from eas.json>
   cd apps/mobile/android && ./gradlew :app:assembleRelease -Dorg.gradle.jvmargs="-Xmx3g"
   ```

   About 20 minutes the first time, 2 to 3 minutes incrementally. Output:
   `android/app/build/outputs/apk/release/app-release.apk`.
6. **Verify before handing it over:**

   ```bash
   apksigner verify --print-certs app-release.apk      # SHA-1 must be ee:eb:f5:80:…:e2:e5
   aapt2 dump permissions app-release.apk               # no SMS, notification-listener or overlay permissions
   ```

## After a server change

`apps/api` deploys on Render from the repo; migrations run on start-up. Quick checks: `/healthz` returns
`{"ok":true}`, `/v1/config` shows `"testSignIn":false`, and `/v1/sync/pull` without a token returns 401. See
[apps/api/README.md](../apps/api/README.md).
