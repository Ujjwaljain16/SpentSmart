# Phone test checklist (preview build)

Install the preview build from the EAS build page (Install button or QR code). It talks to the live server.

## Only a real phone can check these
1. **Voice add.** Quick add → mic → say "200 chai at Tapri yesterday". The amount, payee, category and date should fill in.
2. **Receipt scan.** Quick add → scan → photograph a printed bill. On a fresh install the first scan may wait a minute while Play services downloads the text model. Check the total, merchant and date.
3. **Merchant UPI QR.** Pay → scan a shop's QR → your UPI app opens with the payee filled in. Pay ₹1, come back, and check that the payment is recorded.
   **One-tap personal payments (next build).** Pay a friend's UPI ID → pick Google Pay → slide. GPay should open
   straight on the payment screen; you only enter your PIN. Then try PhonePe, Paytm and any others you have. If an app
   shows "SpentSmart hands … a QR" under the slider, it should open on the payment too. Note which apps do and which
   open something else.
4. **Google sign-in on your phone.** Settings → Sync & backup → Sign in with Google → create the recovery key and **save it**.
5. **Two phones (optional).** Sign in on the emulator or a second phone with the same Google account → "Restore your backup" → enter the key → your data appears.
6. **Background sync.** Add a transaction, close the app for about 20 minutes, then open the other phone: it should be there.

## Quick sanity (2 minutes)
- Home, Activity, Budgets and Insights open without errors.
- Lock the app and reopen it with your fingerprint.
- Settings → Diagnostics shows no crashes.

Note what breaks (screen + what you did) and send screenshots.
