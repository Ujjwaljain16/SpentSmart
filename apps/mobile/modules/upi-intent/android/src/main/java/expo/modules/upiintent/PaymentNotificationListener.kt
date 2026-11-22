package expo.modules.upiintent

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/**
 * Notifications from UPI apps, bank apps and SMS apps only; everything else is ignored without being read. Within
 * those, only text that looks like a completed payment is kept, and anything carrying a code is dropped here, before
 * it is ever written down. The app parses what's left the next time it opens.
 */
class PaymentNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    sbn ?: return
    if (sbn.packageName !in WATCHED_PACKAGES) return
    val prefs = applicationContext.getSharedPreferences(PREFS, MODE_PRIVATE)
    if (!prefs.getBoolean(KEY_CAPTURE_ENABLED, false)) return

    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
    val text = "$title\n$body".trim()
    if (text.length > 1000 || !MONEY.containsMatchIn(text) || !PAYMENT_WORD.containsMatchIn(text) || SECRET.containsMatchIn(text)) return

    CaptureStore.append(
      applicationContext,
      NOTIFICATION_QUEUE,
      JSONObject().put("app", sbn.packageName).put("text", text).put("at", sbn.postTime).put("key", sbn.key),
    )
  }

  companion object {
    private val MONEY = Regex("""(₹|\brs\.?|\binr)\s*[\d,]+|debited by\s*[\d,]+""", RegexOption.IGNORE_CASE)
    private val PAYMENT_WORD = Regex("""\b(debited|credited|spent|paid|sent|received|withdrawn|deducted|refund)""", RegexOption.IGNORE_CASE)
    private val SECRET = Regex("""\b(otp|one[\s-]?time|verification code|passcode|do not share|don'?t share|never share|cvv|upi pin)\b""", RegexOption.IGNORE_CASE)

    val WATCHED_PACKAGES = setOf(
      // UPI apps
      "com.google.android.apps.nbu.paisa.user", "com.phonepe.app", "net.one97.paytm", "in.org.npci.upiapp",
      "com.dreamplug.androidapp", "com.naviapp", "money.jupiter", "indwin.c3.shareapp", "com.mobikwik_new",
      "in.amazon.mShop.android.shopping",
      // Bank apps
      "com.snapwork.hdfc", "com.csam.icici.bank.imobile", "com.sbi.lotusintouch", "com.axis.mobile", "com.msf.kbank.mobile",
      "com.upi.axispay", "com.sbi.upi", "com.olive.kotak.upi",
      // SMS apps, where bank alerts arrive
      "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms", "com.oneplus.mms",
      "com.coloros.mms", "com.truecaller",
    )
  }
}
