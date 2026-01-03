# 🚀 Publishing Guide: Expense Tracker (Production Ready)

This guide covers the end-to-end process of building and publishing your React Native (Expo) app to the **Google Play Store** and **Apple App Store**.

It is tailored for your **Unified Expense Tracker** app, ensuring all production settings are correct.

---

## 🏗️ 1. Production Build Audit (Pre-Flight Check)

Before building, verify these critical files.

### A. `app.json` Configuration
Ensure your `app.json` has production identifiers (not placeholders).

```json
{
  "expo": {
    "name": "SpentSmart",
    "slug": "spentsmart",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.ujjwaljain.spentsmart",
      "buildNumber": "1"
    },
    "android": {
      "package": "com.ujjwaljain.spentsmart",
      "versionCode": 1,
      "permissions": ["CAMERA", "USE_BIOMETRIC"]
    }
  }
}
```

> [!IMPORTANT]
> Change `com.yourname.expensetracker` to your actual domain (e.g., `com.ujjwal.expensetracker`). This ID cannot be changed after you upload to the store!

### B. Asset Optimization
- **Images**: Run all PNGs through a compressor (like TinyPNG) to reduce bundle size.
- **Icons**: Verify `assets/images/icon.png` is high-res (1024x1024) as it will be your store icon.

---

## 🤖 2. Building for Android (Google Play)

We use EAS Build (Expo Application Services) for the smoothest experience.

### Step 1: Install EAS CLI
```bash
npm install -g eas-cli
eas login
eas build:configure
```

### Step 2: Build the Bundle (AAB)
Google Play requires an `.aab` (Android App Bundle), not an `.apk`.

```bash
eas build --platform android --profile production
```

- When prompted for a **Keystore**, select **"Generate new keystore"**.
- ⚠️ **BACKUP THIS KEYSTORE!** If you lose it, you can never update your app again.

### Step 3: Google Play Console
1. Go to [Play Console](https://play.google.com/console).
2. **Create App**: "Expense Tracker", Language: EN-US, App is "Free".
3. **Internal Testing**: Start here. Upload the `.aab` file EAS generated.
4. **Store Content**:
   - **Short Description**: "Track expenses, scan QR codes, and manage your budget securely."
   - **Screenshots**: Take 4-5 screenshots of: Home, Stats, Edit Mode, Settings.
   - **Privacy Policy**: Required because you use Camera and Biometrics. You can host a simple HTML page on GitHub Pages that says "We do not store data on external servers; all data is local."

---

## 🍎 3. Building for iOS (App Store)

Requires an **Apple Developer Account** ($99/year).

### Step 1: Configure Credentials
```bash
eas credentials
```
- Select "iOS".
- Follow prompts to log in with your Apple ID.
- EAS will auto-generate your **Distribution Certificate** and **Provisioning Profile**.

### Step 2: Build the Archive (IPA)
```bash
eas build --platform ios --profile production
```

### Step 3: TestFlight & App Store Connect
1. Go to [App Store Connect](https://appstoreconnect.apple.com/).
2. **My Apps** -> (+) New App.
3. **SKU**: A unique internal ID (e.g., `expenses-v1`).
4. **Upload**: Use the **Transporter** app (macOS) to upload the `.ipa` file from EAS to App Store Connect.
   - *Alternative*: Configure EAS to submit automatically: `eas submit -p ios`.
5. **TestFlight**: Once processed, add yourself as a tester to verify the production build on a real iPhone.

---

## 🚀 4. Post-Launch Checklist

- [ ] **Monitor Crashes**: Use Sentry or EAS Insights to track if users experience crashes.
- [ ] **Reviews**: Reply to user reviews promptly to boost your store ranking.
- [ ] **Updates**: To release an update:
    1. Bump `version` (e.g., `1.0.1`) in `app.json`.
    2. Bump `versionCode` (Android) and `buildNumber` (iOS).
    3. Run `eas build` again.

## 💡 Troubleshooting Common Issues

### "Upload Key Mismatch" (Android)
If you previously uploaded manually and now use EAS, you must contact Google Support to reset your upload key or provide the EAS-generated PEM certificate to Play Console.

### "Missing Info.plist Key" (iOS)
If Apple rejects the binary for missing permission strings:
- Check `app.json` -> `ios.infoPlist`.
- Ensure `NSCameraUsageDescription` and `NSFaceIDUsageDescription` are clear and user-friendly.

---

**You are now ready to ship! Good luck! 🌟**
