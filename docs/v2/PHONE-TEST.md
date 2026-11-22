# Phone test checklist

For the build of 22 Nov 2026 (`SpentSmart-2026-11-22.apk`, built locally from `e4c98df`, signed with the EAS key,
talks to the live server). It installs over the previous preview build as an update; your data stays.

## Already confirmed on a phone
- Voice add (falls back to the online recogniser when the phone has no offline English pack).
- Receipt scan.
- Shop QR paid directly; friend QR through Google Pay's one-tap share.
- Google sign-in shows the account picker.

## 1. The big question: does your phone hide payment text from capture?
Settings → **Automatic logging** → **Capture payments** → Continue → allow SpentSmart in Android's notification
access screen. Then:

1. Pay ₹1 to a friend with Google Pay. Open SpentSmart: does Home show **"1 new payment to add"**?
2. When your bank's SMS for that payment arrives, it must **not** add a second item (they merge).
3. Note which of these produce an item: Google Pay notification, PhonePe notification, bank SMS.
   If bank SMS never show up, your phone hides SMS text from apps (Android 15+); the fix is the SMS-capture build.
4. An OTP SMS must never appear.

## 2. Inbox
5. Change a category, **Add** one, **Ignore** one, **Add all**. Added ones appear on Home and Activity; ignored ones
   don't come back when new SMS arrive.

## 3. Payments
6. Friend's QR → it opens on Google Pay → slide → GPay opens on the payment → PIN → back in SpentSmart, record it.
7. **Try another UPI app** → PhonePe → "QR saved to gallery" → scan from gallery in PhonePe.
8. Amounts show commas while typing (1,50,000), and backspace works through the commas.

## 4. Log payments from other apps (beta)
9. Turn it on. In Zomato, Zepto or a website checkout, choose UPI: is **SpentSmart** listed? If yes, pick it →
   Google Pay opens on the payment → pay → the checkout shows success, and SpentSmart has logged the payment with no
   inbox step. Note which checkouts list it.

## 5. Shortcuts
10. Quick Settings → edit → add **Add expense** → tap it: quick add opens.
11. Home screen → widgets → **SpentSmart quick add** → Add, Speak (mic starts) and Scan & pay.

## 6. Sync
12. Recovery key → **Download as a file** → Android's Save screen opens in Downloads → Save → open the file.
13. Add a transaction, close the app for about 20 minutes, reopen: "Last synced" has moved.

## Quick sanity (2 minutes)
- Every tab in light and dark mode, with gesture or 3-button navigation: nothing see-through or cut off.
- Lock the app and reopen it with your fingerprint.
- Settings → Privacy policy reads correctly.
- Settings → Diagnostics shows no crashes.

Note what breaks (screen + what you did) and send screenshots.
