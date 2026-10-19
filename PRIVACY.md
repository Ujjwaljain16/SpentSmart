# Privacy Policy

**Last updated: 20 October 2026**

SpentSmart is built so that your financial data never leaves your phone. This policy says exactly what the
app does with data and permissions.

## 1. Your data

Transactions, categories, budgets, your name and avatar, and settings are stored **only on your device**, in
an encrypted database (SQLCipher, AES-256). The encryption key is generated on your device and kept in the
Android Keystore. There is no SpentSmart account, server or cloud sync. The developer cannot see your data.

Android Auto Backup is disabled for the app, so your data is not copied to your Google account backup.

## 2. Permissions

| Permission | Why | When |
|---|---|---|
| Camera | Read UPI QR codes | Only while the scanner screen is open. Images are not saved or sent. |
| Contacts | Fill in a payee name | Only when you tap "Pick contact". Only the contact you choose is read; nothing is stored. |
| Notifications | Optional daily reminders | Only if you switch reminders on in Settings. |
| Photos (save only) | Save a QR code to your gallery | Only when you choose "Save QR to gallery". The app cannot read your photos. |
| Biometrics / screen lock | Optional app lock | Only if you switch the app lock on. Handled by Android; SpentSmart never sees biometric data. |

SpentSmart does **not** access your SMS, location, bank accounts or clipboard.

## 3. Network use and third parties

SpentSmart does not send your transactions anywhere. The app uses **Expo (EAS Update)** to download app
updates; that request contains technical information such as app version and platform, not your financial data.
Payments are made inside the UPI app you choose (Google Pay, PhonePe, etc.); those apps have their own privacy
policies and receive the payee and amount you pay.

When you share a QR image or an export, you choose where it goes. Exports are created in temporary storage and
deleted right after the share sheet closes.

## 4. Diagnostics

Warnings and errors are kept only in memory for the current session, with UPI IDs and amounts removed. You can
view them in Settings → Diagnostics. Nothing is uploaded.

## 5. Retention and deletion

Your data stays until you delete it. **Settings → Delete all data** (or the Privacy dashboard) removes every
transaction, category, setting and pending payment. Uninstalling the app removes everything. Back up first with
Settings → Export CSV if you want a copy.

## 6. Children

SpentSmart is not directed at children under 13 and does not knowingly collect their information.

## 7. Changes

If this policy changes, the new version is published in this repository and the date above is updated.

## 8. Contact

Open an issue: https://github.com/Ujjwaljain16/SpentSmart/issues
