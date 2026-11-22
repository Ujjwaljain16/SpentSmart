# Privacy Policy

**Last updated: 22 November 2026.** The same text is in the app under Settings → Privacy policy.

## In short

SpentSmart keeps your financial data on your phone. Optional features that go further are off until you turn them
on: **Sync & backup** (end-to-end encrypted, so we can't read it) and the **Assistant**.

## Data on your phone

Transactions, accounts, budgets, goals, categories, tags, your name, avatar and settings are stored only on your
device, in an encrypted database (AES-256). The key is made on the phone and kept in the Android Keystore.
Android's automatic cloud backup is turned off for SpentSmart.

## Sync & backup (optional)

- You sign in with Google. We receive your Google account ID and email, to tell your phones apart from other
  people's. We never see your Google password.
- Your data is encrypted on your phone before it's sent, with a key only your phones have. A copy of that key is
  stored on our server locked with your recovery key, which only you have. **We can't read your amounts, payees,
  notes, categories or dates.**
- What our server can see: your Google account ID and email, your phones' names (like "Pixel 8"), when each last
  synced, and how many records you have and when they changed.
- If you lose your recovery key and all your signed-in phones, nobody can recover the backup, including us.
- **Stop syncing** keeps your data on the phone. **Delete cloud backup** permanently deletes everything we hold
  about you. It can't be undone.
- Servers: database on Neon and app server on Render, both in Singapore.

## Assistant (optional)

- **With your own Google Gemini key:** your phone sends the question straight to Google. SpentSmart's servers
  aren't involved, and the key stays in this phone's Keystore.
- On a **free** Gemini key, Google may use what you send to improve its products, and people may review it; on a
  paid key it doesn't. So by default only figures are sent (totals, categories, dates, amounts), never payee names
  or notes. You can allow names and notes in Settings → Assistant.
- **Through a SpentSmart account** instead: your question goes through our server to Anthropic's Claude model. We
  don't store conversations, and Anthropic's commercial terms don't allow training on them.
- Either way, the model can't open your database. It asks the app for specific figures, which your phone works out,
  and only those go back.
- Changes it suggests are saved only when you tap Save.

## Voice, receipts and statements

- **Voice:** Android's speech recogniser turns your words into text, on the phone where supported, otherwise
  through Google's speech service. SpentSmart doesn't record or keep audio.
- **Receipts:** text is read from the photo on your phone. The photo isn't uploaded or kept.
- **Statements:** the file you choose is read on your phone and deleted from the app's storage straight after.

## Permissions

| Permission | Why |
|---|---|
| Camera | Scanning UPI QR codes and receipt photos |
| Microphone | Only while you're dictating |
| Contacts (read) | Only the contact you pick as a payee |
| Photos | Saving your QR code; choosing a receipt uses Android's photo picker |
| Notifications | Only if you turn on reminders |
| Internet | Sync & backup, the Assistant and app updates |

SpentSmart doesn't access your SMS, location, bank accounts or clipboard.

## Other services

- **Expo**, for app updates: technical details like app version and platform.
- **UPI apps** you pay through receive the payee and amount.
- **Google**, for sign-in, speech recognition, and Gemini if you add your own key.
- **Anthropic**, for the Assistant through a SpentSmart account.

## Keeping and deleting

- On your phone: until you delete it (Settings → Delete all data) or uninstall. That doesn't touch the cloud backup.
- On our server: until you delete the cloud backup.
- Server logs hold technical request details, never your financial data, and are kept only as long as our hosting
  provider retains them.

## Diagnostics

Warnings, errors and the last 20 crashes are kept on the phone with amounts, UPI IDs and emails removed. You can
view them in Settings → Diagnostics. Nothing is uploaded.

## Children, changes and contact

SpentSmart isn't meant for children under 13. Changes to this policy appear here and in the app with a new date.
Questions or concerns: open an issue at https://github.com/Ujjwaljain16/SpentSmart/issues.
