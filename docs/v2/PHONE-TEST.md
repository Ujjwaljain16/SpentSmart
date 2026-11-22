# Phone test checklist (preview build)

Install the preview build from the EAS build page (Install button or QR code). It talks to the live server.

## Already confirmed on a phone
- Voice add (falls back to the online recogniser when the phone has no offline English pack).
- Receipt scan.
- Shop QR paid directly; friend QR through Google Pay's one-tap share.
- Google sign-in shows the account picker.

## Payments
1. **Friend's QR.** It opens on Google Pay. Slide → GPay opens on the payment; enter the PIN. Pay ₹1, come back, record it.
2. **Try another UPI app** → PhonePe or Paytm → "QR saved to gallery" → in that app, Scan → gallery → newest image.
3. **Amounts** show commas while typing (1,50,000) on the payment, budget, goal and transfer screens.

## Automatic logging (Settings → Automatic logging)
4. **Capture payments** → Continue → allow SpentSmart in Android's notification access screen.
5. Pay ₹1 with GPay. Open SpentSmart: Home shows "1 new payment to add". The GPay notification and the bank SMS
   for the same payment must show as **one** item.
6. In the inbox: change the category, Add one, Ignore one, Add all. Added ones appear on Home and Activity.
7. An OTP SMS must never appear in the inbox.
8. **Log payments from other apps (beta)** → Turn on. In Zomato, Zepto or a website checkout, choose UPI: is
   SpentSmart listed? If yes, pick it → GPay opens on the payment → pay → back in the checkout, the order succeeds,
   and the payment is in SpentSmart without the inbox. Note which checkouts list it.

## Shortcuts
9. Pull down Quick Settings → edit tiles → add **Add expense** → tap it: quick add opens.
10. Home screen → widgets → **SpentSmart quick add** → place it. Tap Add, Speak (mic starts listening) and Scan & pay.

## Sync
11. Create the recovery key → **Download as a file** → pick Downloads or Drive → open the file and check the key.
12. Add a transaction, close the app for about 20 minutes, reopen: "Last synced" has moved.

## Quick sanity (2 minutes)
- Home, Activity, Budgets and Insights open without errors, in light and dark mode.
- Lock the app and reopen it with your fingerprint.
- Settings → Privacy policy opens and reads correctly.
- Settings → Diagnostics shows no crashes.

Note what breaks (screen + what you did) and send screenshots.
