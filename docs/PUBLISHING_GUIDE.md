# 🚀 SpentSmart - Publishing & Release Guide

This guide covers how to build your Production APK and publish it to GitHub Releases.

## 📦 Phase 1: Build the APK

We use EAS (Expo Application Services) to build the standalone APK.

### 1. Run the Build Command
```bash
# Build for Android (Preview profile = APK)
eas build --platform android --profile preview
```

### 2. Wait for Completion
- The build takes ~10-15 minutes.
- Once finished, you will get a **Download Link** in the terminal.
- Download the file (e.g., `spentsmart.apk`).

---

## 🏷️ Phase 2: Create a GitHub Release

Hosting your APK on GitHub is the professional way to distribute your app without the Play Store.

### 1. Tag Your Version
Open your terminal and tag the current code version:
```bash
# 1. Add all changes
git add .
git commit -m "chore: prepare for release v1.0.0"

# 2. Create a tag (e.g., v1.0.0)
git tag v1.0.0

# 3. Push the tag to GitHub
git push origin v1.0.0
```

### 2. Create the Release on GitHub
1.  Go to your repository: **[ExpenseTracker](https://github.com/Ujjwaljain16/ExpenseTracker)**
2.  Click on **Releases** (on the right sidebar) -> **Draft a new release**.
3.  **Choose a tag**: Select `v1.0.0` (the one you just pushed).
4.  **Release title**: `SpentSmart v1.0.0 - Production Release`.
5.  **Description**:
    ```markdown
    ## 🛡️ SpentSmart v1.0.0

    First production release of the privacy-first UPI tracker!

    ### ✨ Features
    - 📷 **Scan & Pay**: Works with all UPI apps.
    - 🔒 **Biometric Lock**: Secure your data.
    - 📊 **Analytics**: Track spending by category.
    - 🏠 **Local Storage**: 100% Offline & Private.

    ### 📥 Installation
    1. Download `spentsmart.apk` below.
    2. Install on your Android device.
    3. Grant permissions (Camera, Contacts).
    ```

### 3. Upload the APK
1.  Look for the **"Attach binaries by dropping them here"** box at the bottom.
2.  Drag and drop your downloaded `application-....apk` file.
3.  **Rename it** (Optional): You can rename the file to `spentsmart-v1.0.0.apk` before uploading for better clarity.
4.  Click **Publish release**.

🎉 **Done!** Users can now download the APK directly from your GitHub Releases page.

---

## 🔄 Phase 3: Updating the App

When you add new features in the future:

1.  Update `version` in `app.json` (e.g., `1.0.1`).
2.  Run `eas build --platform android --profile preview` again.
3.  Tag new version: `git tag v1.0.1`.
4.  Create new GitHub Release and upload the new APK.
