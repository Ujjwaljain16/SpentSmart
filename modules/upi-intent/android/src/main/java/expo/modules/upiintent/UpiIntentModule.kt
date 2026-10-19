package expo.modules.upiintent

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQUEST_UPI_PAY = 7421

/**
 * Android-only bridge to UPI apps.
 *
 *  - getUpiApps():       apps able to handle `upi://pay` (excluding this app)
 *  - payWithUpi():       launch a UPI payment with startActivityForResult and resolve with the app's response
 *  - launchApp():        open an app's launcher screen (last-resort fallback)
 */
class UpiIntentModule : Module() {
  private var pendingPayment: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("UpiIntent")

    AsyncFunction("getUpiApps") {
      val context = appContext.reactContext ?: throw IllegalStateException("React context unavailable")
      val pm = context.packageManager
      val probe = Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay?pa=probe@upi&pn=probe&cu=INR"))
      val seen = HashSet<String>()
      val apps = ArrayList<Map<String, String>>()
      for (info in pm.queryIntentActivities(probe, PackageManager.MATCH_DEFAULT_ONLY)) {
        val pkg = info.activityInfo.packageName
        if (pkg == context.packageName || !seen.add(pkg)) continue
        apps.add(mapOf("packageName" to pkg, "name" to info.loadLabel(pm).toString()))
      }
      return@AsyncFunction apps
    }

    // Resolves with { resultCode: Int, response: String? }. Rejects with ERR_NO_UPI_APP when nothing can handle the URI.
    AsyncFunction("payWithUpi") { uri: String, packageName: String?, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "No foreground activity available", null)
        return@AsyncFunction
      }
      if (!uri.startsWith("upi://pay?", ignoreCase = true)) {
        promise.reject("ERR_INVALID_URI", "Only upi://pay URIs are accepted", null)
        return@AsyncFunction
      }
      if (pendingPayment != null) {
        promise.reject("ERR_BUSY", "A payment is already in progress", null)
        return@AsyncFunction
      }

      val base = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
      val intent = if (packageName.isNullOrEmpty()) {
        Intent.createChooser(base, "Pay with")
      } else {
        base.setPackage(packageName)
      }

      pendingPayment = promise
      try {
        activity.startActivityForResult(intent, REQUEST_UPI_PAY)
      } catch (e: ActivityNotFoundException) {
        pendingPayment = null
        promise.reject("ERR_NO_UPI_APP", "No app can handle this UPI payment", e)
      } catch (e: SecurityException) {
        pendingPayment = null
        promise.reject("ERR_LAUNCH_DENIED", "The UPI app refused to start", e)
      }
    }

    AsyncFunction("launchApp") { packageName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val launch = context.packageManager.getLaunchIntentForPackage(packageName) ?: return@AsyncFunction false
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(launch)
      return@AsyncFunction true
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_UPI_PAY) return@OnActivityResult
      val promise = pendingPayment ?: return@OnActivityResult
      pendingPayment = null
      promise.resolve(
        mapOf(
          "resultCode" to payload.resultCode,
          "response" to extractResponse(payload.data)
        )
      )
    }
  }

  /**
   * UPI apps answer either with a single "response" extra (`txnId=..&responseCode=..&Status=..&txnRef=..`)
   * or with the individual fields as separate extras. Normalise both to the first form.
   */
  private fun extractResponse(data: Intent?): String? {
    val extras: Bundle = data?.extras ?: return null
    extras.getString("response")?.takeIf { it.isNotBlank() }?.let { return it }

    val keys = listOf("txnId", "responseCode", "Status", "txnRef", "ApprovalRefNo")
    val parts = keys.mapNotNull { key ->
      val value = (extras.get(key) as? String)?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
      "$key=${Uri.encode(value)}"
    }
    return if (parts.isEmpty()) null else parts.joinToString("&")
  }
}
