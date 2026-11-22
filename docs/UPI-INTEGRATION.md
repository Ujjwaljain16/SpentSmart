# UPI integration: what is possible without paying anyone

Research notes behind `modules/upi-intent`, `packages/finance/src/upi/*` and `apps/mobile/services/payments/*`.
First written 20 Oct 2026; updated 22 Nov 2026 with a second round of phone tests.

## Question

SpentSmart does not move money. It hands a payment to the user's own UPI app and needs to know whether the
payment happened, without SMS access, bank linking or a server. What is available for free?

## What is free (no registration, no fees)

| Mechanism | Works for | Result back to us? | Notes |
|---|---|---|---|
| `upi://pay?...` link / `Linking.openURL` | any payee | **No** | Android shows a chooser. Fire and forget. |
| Explicit intent to one app (`ACTION_VIEW` + `setPackage`) | any payee | **No** (if started with `startActivity`) | Skips the chooser. |
| Same intent via **`startActivityForResult`** | any payee | **Yes, when the UPI app returns one** | The NPCI linking spec defines the response (`txnId`, `responseCode`, `Status`, `txnRef`, `ApprovalRefNo`). NPCI also requires PSP apps to answer intent calls on the same phone. This is what the app now uses first. |
| Save a QR to the gallery, user imports it with "scan from gallery" | any payee | No | To the UPI app this is an ordinary QR scan, so it is accepted for personal UPI IDs. **This is the main route for personal payees.** |
| Share a QR image to Google Pay (`ACTION_SEND`) | personal payees | No | **Works (Nov 2026):** Google Pay reads the shared image as a scanned QR and opens straight on the payment; the user only enters the PIN. (An October attempt with a JS-rendered QR only opened Google Pay's home screen.) |
| Share a QR image to PhonePe | – | – | **Doesn't work:** PhonePe treats a shared image as a picture to send to a contact. |
| Show a QR for the user to scan | any payee | No | Always available. |

Google's own in-app payments guide documents exactly this pattern for Google Pay: build a `upi://pay` URI,
set the package to `com.google.android.apps.nbu.paisa.user`, call `startActivityForResult`, read the
response. It also tells merchants to confirm `Submitted`/`Success` with their PSP before trusting it.

## What is *not* free or not guaranteed

1. **Server-side confirmation.** Google (and every PSP) says the app response alone is not proof of payment.
   Confirming needs a payment aggregator or bank API, which means a merchant account and a server. SpentSmart
   deliberately has neither, so **the response is treated as a strong hint, and the user confirms.**
2. **Merchant-grade intents.** Signed merchant QR codes (`sign`, `orgid`, `mc`…) are issued to registered
   merchants. We never create them; we only replay a scanned one byte-for-byte.
3. **Personal-VPA payments with a pre-filled amount.** Behaviour is decided by each UPI app and the banks, not
   by us, and varies: some apps accept it, some show "payment declined / risk" or ask the user to re-enter
   the amount. We could not find an official NPCI/Google statement on this, only developer reports. **(verify
   on device, per UPI app)** The app therefore offers **"Retry without amount"** after a reported failure, which
   sends the same payee without `am` and lets the user type the amount in their UPI app.
4. **Response availability.** Some apps return nothing, return only `SUBMITTED`, or a cancelled result with no
   data. All of these map to "unsure" and the user is asked.

## Field test (20 Oct 2026, one Android phone: PhonePe, BHIM, Google Pay)

Paying a **personal** UPI ID by intent with `startActivityForResult`:

* every UPI app opened and showed the payee and amount, **but would not continue** (no UPI PIN screen, "request type
  not supported", PhonePe unresponsive). The apps refuse payments to personal IDs that are started by another app.
* SpentSmart handled it correctly: the app came back and showed "Did this payment go through?" with Retry options.
* Sharing the QR image to Google Pay only opened Google Pay's home screen.
* Saving the QR to the gallery and importing it in PhonePe/BHIM **worked**.

## Field test (22 Nov 2026, Vivo phone)

* **Shop QR (Zepto)** by intent: Google Pay and PhonePe opened on the payment and completed it. Direct intent stays
  the route for merchants.
* **Personal QR → Google Pay share:** works end to end, with only the PIN left to enter.
* **Personal QR → other apps:** "QR saved to gallery", then scan from gallery in PhonePe/Paytm. Works.
* **"Try direct" for personal IDs** failed in every app, so it was removed for personal payees.

Consequences in the app:

* Google Pay is always the default app. Others are one tap away under "Try another UPI app".
* The one-tap QR share is allow-listed to Google Pay only. Checking whether an app *accepts* images isn't enough,
  because PhonePe accepts them but sends them to a chat.
* The QR is drawn natively with ZXing (error correction L, no ECI header, about 600 px) and prepared while the user is
  still typing, so the tap only fires the share intent.

## Design decisions

* **Result first, hint not proof.** `payWithUpi` (Kotlin, `startActivityForResult`) → `interpretLaunchResult`
  → `suggestionFor`. Only a clear `SUCCESS` pre-selects "paid"; `FAILURE`/cancelled pre-selects "didn't go
  through"; everything else is "unsure". The user always has the final say (`AttemptReview`).
* **Fallback ladder** (`services/payments/launcher.ts`, unit-tested):
  1. chosen app, with result →
  2. system chooser, with result (if the chosen app cannot handle the URI) →
  3. plain `Linking.openURL`, no result (if the native module is missing, e.g. Expo Go).
  Beyond that: show a QR code, or pay via the gallery-QR route (which is the default for personal payees).
* **Attempts are persisted before launching** (`payment_attempts`). If Android kills SpentSmart while the UPI
  app is open, the attempt is still there; Home shows a "waiting for confirmation" banner. "Decide later"
  snoozes it (fixes the previous redirect loop).
* **Recording is idempotent** per attempt (`transactions.attempt_id` is unique), so confirming twice cannot
  double-count.
* **Never alter signed QRs; never trust scanned text.** `packages/finance/src/upi/parse.ts` validates VPA, amount and
  currency, keeps the exact raw query, and splits parameters on the *first* `=` (the old parser truncated
  signatures that end in `=`).
* **No network.** The payment QR is drawn on the device. The old implementation sent the payee UPI ID and amount
  to a third-party QR web service; that is gone.
* **Logging payments other apps start.** The opt-in UPI proxy (a disabled-by-default `upi://pay` handler) forwards a
  checkout's request unchanged to Google Pay and records the result. See [CAPTURE.md](CAPTURE.md).

## Device test matrix (to run before a release)

| # | Scenario | Expect |
|---|---|---|
| 1 | Pay a friend's personal VPA with Google Pay selected | Google Pay opens on the payment via the shared QR; PIN only |
| 1b | Same with PhonePe / Paytm selected | QR saved to gallery; scan from gallery works |
| 2 | Same, then tap **Retry without amount** after a decline | Payee prefilled, amount typed in UPI app, review sheet appears on return |
| 3 | Static merchant QR with fixed amount | Amount locked, URI replayed unchanged |
| 4 | Dynamic merchant QR (no amount) | Amount appended only if the QR is unsigned |
| 5 | Press Back in the UPI app | Outcome `cancelled` → "not paid" suggested |
| 6 | Kill SpentSmart while the UPI app is open, then return | Banner on Home, attempt resolvable, no duplicate |
| 7 | Uninstall/disable all UPI apps | "No UPI app found", no phantom attempt |
| 8 | Expo Go / build without the native module | Falls back to `Linking`, asks the user on return |

## Sources

* Google Pay for India, in-app payments (Android): https://developers.google.com/pay/india/api/android/in-app-payments
* NPCI UPI Linking Specification (public mirror of v1.6): https://www.labnol.org/files/linking.pdf
* NPCI circular on non-compliant UPI apps (2017): https://www.npci.org.in/PDF/npci/upi/circular/2017/Circular%20on%20Non-compliance%20of%20UPI%20apps%20to%20Deeplinking%20specs%20Circular%2037-%201.11.2017.pdf
* Expo SQLite (SQLCipher, transactions): https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/
* Expo Modules API (`OnActivityResult`): https://docs.expo.dev/modules/module-api/
