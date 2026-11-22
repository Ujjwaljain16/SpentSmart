# Privacy policy and Play data-safety: v2 draft

> **Draft for the owner to review.** It replaces `PRIVACY.md` only when v2 ships with sync or the assistant
> turned on. Every statement below matches the code as of 22 Nov 2026; check it again against the code before
> publishing, and get legal advice if needed. Placeholders are in [brackets].

---

# Privacy Policy

**Last updated: [date of release]**

SpentSmart keeps your financial data on your phone. Two optional features use our server: **Sync & backup**
(end-to-end encrypted, so we can't read it) and the **Assistant** (sends the figures needed to answer your
question to an AI model). Both are off until you turn them on.

## 1. Data on your phone

Transactions, accounts, budgets, goals, categories, tags, your name, avatar and settings are stored only on your
device, in an encrypted database (SQLCipher, AES-256). The key is generated on the device and kept in the Android
Keystore. Android Auto Backup is disabled for the app.

## 2. Sync & backup (optional)

If you turn on Sync & backup:

- You sign in with Google. We receive your Google account ID and email address so we can tell your phones apart
  from other people's. We don't receive your Google password.
- Your data is **encrypted on your phone before it is sent** (XChaCha20-Poly1305), with a key that only your
  phones have. A copy of that key is stored on our server, locked with your **recovery key**, which only you have.
  **We cannot read your amounts, payees, notes, categories or dates.**
- What our server can see: your Google account ID and email, the names of your phones (for example "Pixel 8"),
  when each phone last synced, how many records you have, their sizes, and when they changed.
- If you lose your recovery key **and** all your signed-in phones, nobody can recover the backup, including us.
- **Stop syncing** keeps your data on the phone. **Delete cloud backup** permanently deletes everything we hold
  about you (account, phones, encrypted records, the locked key). It cannot be undone.
- Servers: database on [Neon, region], app server on [Render/Fly, region].

## 3. Assistant (optional, lab feature)

If you turn on the Assistant and ask a question:

- The question goes to our server and on to **Anthropic** (the Claude model) to be answered.
- The model can't open your database. It asks the app for specific figures, which your phone works out. Only
  those figures go back: usually totals ("spent this month", "left in your food budget"). When you search, up to
  20 matching transactions (date, payee, amount, category, note).
- Changes the assistant suggests (adding a transaction or a goal) are saved only when you tap Save.
- We don't store your conversations on our server. Anthropic processes the request under its commercial terms,
  which don't allow training on it: [link to Anthropic's commercial terms and retention period].

## 4. Voice and receipts

- **Voice:** when you tap Speak, Android's speech recogniser turns your words into text. Where your phone supports
  it, this happens on the phone; otherwise Android's speech service (Google) processes the audio under Google's
  terms. SpentSmart doesn't record or keep audio.
- **Receipts:** text is read from the photo on your phone (Google ML Kit, on-device). The photo isn't uploaded or
  kept by SpentSmart.

## 5. Statement import

A bank statement file you choose is read on your phone and deleted from the app's storage right after. Nothing
from it is uploaded unless Sync & backup is on, in which case the imported transactions sync encrypted like any
others.

## 5a. Automatic logging (optional, off by default)

- **Capture payments.** If you turn this on and allow notification access, SpentSmart looks at notifications from
  UPI apps, bank apps and your SMS app only. Notifications from any other app (chats, email, social) are ignored
  without being read. From the allowed apps it keeps only messages about a completed payment, and from those only
  the amount, payee, time, reference and which app it came from. Messages containing a one-time password or other
  code are dropped before anything is saved. Captured payments stay on your phone, are never synced, and become
  transactions only when you add them. Turning the setting off discards anything captured but not yet reviewed;
  you can also revoke notification access in Android's settings at any time.
- **Log payments from other apps (beta).** If you turn this on, SpentSmart is offered when another app asks you to
  pay with UPI. It passes the payment request unchanged to your UPI app, where you pay with your PIN as usual, and
  records the payee, amount and the UPI app's result. SpentSmart never handles money or your UPI PIN.

## 6. Permissions

| Permission | Why | When |
|---|---|---|
| Notification access | Capture payments (§5a) | Only if you turn it on and allow it in Android's settings |
| Camera | UPI QR codes; receipt photos | Only on the scanner, or when you choose "Take photo" for a receipt |
| Microphone | Voice entry | Only while you're dictating |
| Contacts (read) | Fill in a payee name | Only the contact you pick |
| Photos | Save your QR code; choose a receipt photo | Saving only when you tap Save; choosing uses Android's photo picker |
| Notifications | Optional reminders | Only if you turn reminders on |
| Biometrics / screen lock | Optional app lock | Handled by Android |
| Internet | Sync & backup, Assistant, app updates | Only for those features |

SpentSmart doesn't have the SMS permission and can't read your message inbox; with Capture payments on, it sees
only the notifications your SMS app shows for new bank messages, as described in §5a. It doesn't access your
location, bank accounts or clipboard.

## 7. Other third parties

- **Expo (EAS Update)** for app updates: technical information like app version and platform.
- **UPI apps** you pay through receive the payee and amount.
- **Google** for sign-in (if you use Sync) and Android speech services (see §4).
- **Anthropic** for the Assistant (see §3).

## 8. Retention and deletion

- On the phone: until you delete it (Settings → Delete all data) or uninstall. Delete all data doesn't touch the
  cloud backup.
- On our server: until you delete the cloud backup. [Inactive accounts: decide a policy, e.g. deleted after N
  months without any sync.]
- Server logs: request metadata without request bodies, kept for [N days].

## 9. Children, changes, contact

Not directed at children under 13. Changes are published here with a new date. Contact: [email / issues link].

---

# Play Console data-safety answers (draft)

Answer as for a build with Sync and the Assistant available, even though they're optional.

| Question | Answer | Why |
|---|---|---|
| Does the app collect or share user data? | **Yes** | Sync (account ID, email) and the Assistant (financial figures sent to answer) |
| Is all data encrypted in transit? | **Yes** | HTTPS to the API; the local-only http exception covers the emulator address only |
| Can users request deletion? | **Yes** | In app: Delete cloud backup. Also [web/email route Play requires] |

**Data types**

| Type | Collected | Shared | Optional | Purpose | Notes |
|---|---|---|---|---|---|
| Personal info → Email address | Yes | No | Yes (Sync) | Account management | Google sign-in |
| Personal info → User IDs | Yes | No | Yes (Sync) | Account management | Google account ID |
| Financial info → Other financial info | Yes | Yes (Anthropic, as a service provider) | Yes (Assistant) | App functionality | Figures needed for an answer. Sync records are end-to-end encrypted; check Play's current guidance on whether data the developer can't read counts as "collected", and answer conservatively |
| Audio → Voice or sound recordings | Only if Android's recogniser isn't on-device | Processed by Google | Yes | App functionality | Decide with Play's guidance on OS-provided services |
| Photos | No | No | — | — | Receipts are read on the phone |
| App activity, device IDs, location, contacts, messages | No | No | — | — | Contacts are read to fill a name and not stored or sent |

Before submitting: re-check against the release build's actual network calls (for example a proxy on the emulator),
and confirm Anthropic's and Google's processing terms for the "shared" answers.
