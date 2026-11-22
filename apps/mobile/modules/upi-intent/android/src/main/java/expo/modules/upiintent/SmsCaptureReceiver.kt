package expo.modules.upiintent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import org.json.JSONObject

/** Source name for payments read straight from incoming SMS (as opposed to an app's notification). */
internal const val SMS_SOURCE = "sms"

private val MONEY = Regex("""(₹|\brs\.?|\binr)\s*[\d,]+|debited by\s*[\d,]+""", RegexOption.IGNORE_CASE)
private val PAYMENT_WORD = Regex("""\b(debited|credited|spent|paid|sent|received|withdrawn|deducted|refund)""", RegexOption.IGNORE_CASE)
private val SECRET = Regex("""\b(otp|one[\s-]?time|verification code|passcode|do not share|don'?t share|never share|cvv|upi pin)\b""", RegexOption.IGNORE_CASE)

/** The cheap first pass shared by every capture path: amount + payment word, and never anything carrying a code. */
internal fun looksLikePayment(text: String): Boolean =
  text.length <= 1000 && MONEY.containsMatchIn(text) && PAYMENT_WORD.containsMatchIn(text) && !SECRET.containsMatchIn(text)

/**
 * New incoming SMS, for phones where Android hides SMS text from notification listeners (Android 15+ marks them
 * sensitive). Only in builds made with SPENTSMART_SMS_CAPTURE=1, which add the RECEIVE_SMS permission and declare this
 * receiver; it never reads the SMS inbox. Same rules as the notification listener: off unless Capture payments is on,
 * payment-looking messages only, codes dropped before anything is written.
 */
class SmsCaptureReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_CAPTURE_ENABLED, false)) return
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    // A long SMS arrives in parts; join them per sender.
    messages.groupBy { it.originatingAddress.orEmpty() }.forEach { (sender, parts) ->
      val text = "$sender\n${parts.joinToString("") { it.messageBody.orEmpty() }}".trim()
      if (!looksLikePayment(text)) return@forEach
      CaptureStore.append(
        context,
        NOTIFICATION_QUEUE,
        JSONObject().put("app", SMS_SOURCE).put("text", text).put("at", parts.first().timestampMillis),
      )
    }
  }
}
