package expo.modules.upiintent

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

private const val REQUEST_UPI_PAY = 7421
private const val SHARE_DIR = "qr_share"
private const val SHARE_MAX_AGE_MS = 60L * 60L * 1000L
private const val MAX_IMAGE_BYTES = 4 * 1024 * 1024

/**
 * Android-only bridge to UPI apps.
 *
 *  - getUpiApps():       apps able to handle `upi://pay` (excluding this app)
 *  - payWithUpi():       launch a UPI payment with startActivityForResult and resolve with the app's response
 *  - launchApp():        open an app's launcher screen (last-resort fallback)
 *  - shareImage():       hand a PNG (base64) to a specific app via a private, short-lived FileProvider URI
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

    // Share a PNG to one specific app. The image is written to a private cache folder that the FileProvider
    // exposes (and nothing else), and old images are deleted on every call.
    AsyncFunction("shareImage") { packageName: String, base64Data: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val payload = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
        val bytes = Base64.decode(payload, Base64.DEFAULT)
        if (bytes.isEmpty() || bytes.size > MAX_IMAGE_BYTES) return@AsyncFunction false

        val dir = File(context.cacheDir, SHARE_DIR).apply { mkdirs() }
        val now = System.currentTimeMillis()
        dir.listFiles()?.forEach { if (now - it.lastModified() > SHARE_MAX_AGE_MS) it.delete() }

        val file = File(dir, "qr_${UUID.randomUUID()}.png")
        file.writeBytes(bytes)

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
          type = "image/png"
          putExtra(Intent.EXTRA_STREAM, uri)
          setPackage(packageName)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return@AsyncFunction true
      } catch (e: ActivityNotFoundException) {
        return@AsyncFunction false
      } catch (e: IllegalArgumentException) {
        return@AsyncFunction false
      }
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
