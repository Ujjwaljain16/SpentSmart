package expo.modules.upiintent

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.os.Parcelable
import org.json.JSONObject

private const val REQUEST_FORWARD = 7422

/**
 * Sits between a checkout (Zomato, Zepto, a website) and the real UPI app. It hands the payment request on unchanged,
 * passes the UPI app's answer back to the checkout, and notes both so SpentSmart can log the payment. It never touches
 * money: the user pays in their own UPI app with their own PIN. Off unless the user turns it on in Settings.
 */
class UpiProxyActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // After a configuration change we're already waiting for the UPI app's answer.
    if (savedInstanceState != null) return

    val data = intent?.data
    if (data == null || !data.toString().startsWith("upi://pay", ignoreCase = true)) {
      setResult(RESULT_CANCELED)
      finish()
      return
    }

    val forward = Intent(Intent.ACTION_VIEW, data)
    val handlers = packageManager.queryIntentActivities(forward, 0).filter { it.activityInfo.packageName != packageName }
    if (handlers.isEmpty()) {
      setResult(RESULT_CANCELED)
      finish()
      return
    }

    val target = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_PROXY_TARGET, null)
    val launch = if (target != null && handlers.any { it.activityInfo.packageName == target }) {
      forward.setPackage(target)
    } else {
      // Without a chosen app, let the user pick, but never offer SpentSmart itself again.
      Intent.createChooser(forward, "Pay with").putExtra(
        Intent.EXTRA_EXCLUDE_COMPONENTS,
        arrayOf<Parcelable>(ComponentName(this, UpiProxyActivity::class.java)),
      )
    }

    try {
      startActivityForResult(launch, REQUEST_FORWARD)
    } catch (e: Exception) {
      setResult(RESULT_CANCELED)
      finish()
    }
  }

  @Deprecated("Activity result API is not available on a plain Activity")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    @Suppress("DEPRECATION")
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQUEST_FORWARD) return
    CaptureStore.append(
      applicationContext,
      PROXY_QUEUE,
      JSONObject()
        .put("uri", intent?.data?.toString())
        .put("resultCode", resultCode)
        .put("response", upiResponseFrom(data))
        .put("caller", callingPackage)
        .put("at", System.currentTimeMillis()),
    )
    setResult(resultCode, data)
    finish()
  }
}
