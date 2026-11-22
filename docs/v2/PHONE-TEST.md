# Phone test checklist

For the next build. It installs from a download (no permissions Play Protect blocks), talks to the live server, and
installs over the previous build as an update.

## Already confirmed on a phone
- Voice add (falls back to the online recogniser when the phone has no offline English pack).
- Receipt scan.
- Shop QR paid directly; friend QR through Google Pay's one-tap share; recording on return.
- Google sign-in shows the account picker.
- Installing over USB with `adb install` works when needed.

## New in 2.2.1
- Launcher shows the new teal ₹ icon (also with themed icons on).
- Fresh install: the five-slide tour, then name and setup; Home shows the Get started checklist and it ticks itself.
- Assistant with your Gemini key: answers show bold and lists, no stray `*`; the share switch flips.
- Sync on an account whose key you lost: Restore → I don't have the key.

## Payments
1. Friend's QR → it opens on Google Pay → slide → GPay opens on the payment → PIN → back in SpentSmart, record it.
2. **Try another UPI app** → PhonePe → "QR saved to gallery" → scan from gallery in PhonePe.
3. Amounts show commas while typing (1,50,000), and backspace works through the commas.

## Shortcuts
4. Quick Settings → edit → add **Add expense** → tap it: quick add opens.
5. Home screen → widgets → **SpentSmart quick add** → Add, Speak (mic starts) and Scan & pay.

## Sync
6. Recovery key → **Download as a file** → Android's Save screen opens in Downloads → Save → open the file.
7. Add a transaction, close the app for about 20 minutes, reopen: "Last synced" has moved.

## Quick sanity (2 minutes)
- Every tab in light and dark mode, with gesture or 3-button navigation: nothing see-through or cut off.
- Lock the app and reopen it with your fingerprint.
- Settings → Privacy policy reads correctly; Settings has no Automatic logging section.
- Settings → Diagnostics shows no crashes.

Note what breaks (screen + what you did) and send screenshots.
