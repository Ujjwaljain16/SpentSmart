package expo.modules.upiintent

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

private const val REQUEST_UPI_PAY = 7421
private const val SHARE_DIR = "qr_share"
private const val SHARE_MAX_AGE_MS = 60L * 60L * 1000L
private const val QR_TARGET_PX = 600
private const val REQUEST_SAVE_FILE = 7423

/**
 * Android-only bridge to UPI apps.
 *
 *  - getUpiApps():       apps able to handle `upi://pay` (excluding this app)
 *  - payWithUpi():       launch a UPI payment with startActivityForResult and resolve with the app's response
 *  - launchApp():        open an app's launcher screen (last-resort fallback)
 *  - shareQr()/prepareQr()/qrPng(): draw a payment QR natively and hand it to one app or the gallery
 *  - saveTextFile():     Android's "Save as" screen; setSystemBarsDark(): navigation bar follows the theme
 */
class UpiIntentModule : Module() {
  private var pendingPayment: Promise? = null
  private var pendingSave: Pair<Promise, String>? = null

  override fun definition() = ModuleDefinition {
    Name("UpiIntent")

    // Match the system navigation bar to the app's theme. Without this Android keeps a light strip behind the
    // back/home buttons even when the app is dark.
    AsyncFunction("setSystemBarsDark") { dark: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      activity.runOnUiThread {
        WindowCompat.getInsetsController(activity.window, activity.window.decorView).isAppearanceLightNavigationBars = !dark
      }
      true
    }

    // Android's "Save as" screen (usually opening in Downloads). Resolves true once written, false if cancelled.
    AsyncFunction("saveTextFile") { fileName: String, content: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || pendingSave != null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "text/plain"
        putExtra(Intent.EXTRA_TITLE, fileName)
      }
      pendingSave = promise to content
      try {
        activity.startActivityForResult(intent, REQUEST_SAVE_FILE)
      } catch (e: ActivityNotFoundException) {
        pendingSave = null
        promise.resolve(false)
      }
    }

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
      // An empty system chooser gives no result and no error; report "no app" so the UI can say so.
      val handlers = activity.packageManager.queryIntentActivities(base, PackageManager.MATCH_DEFAULT_ONLY)
        .filter { it.activityInfo.packageName != activity.packageName }
      if (handlers.isEmpty() || (!packageName.isNullOrEmpty() && handlers.none { it.activityInfo.packageName == packageName })) {
        promise.reject("ERR_NO_UPI_APP", "No app can handle this UPI payment", null)
        return@AsyncFunction
      }
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

    // Draw the QR ahead of the tap (while the user is still typing), so sharing only has to fire the intent.
    AsyncFunction("prepareQr") { upiUri: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      return@AsyncFunction qrFileFor(context, upiUri) != null
    }

    // Draw (or reuse) the QR natively and hand it to one app, which reads it like a scanned code.
    AsyncFunction("shareQr") { packageName: String, upiUri: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val file = qrFileFor(context, upiUri) ?: return@AsyncFunction false
      try {
        context.startActivity(shareIntent(context, file, packageName))
        return@AsyncFunction true
      } catch (e: ActivityNotFoundException) {
        return@AsyncFunction false
      } catch (e: IllegalArgumentException) {
        return@AsyncFunction false
      }
    }

    // The QR as base64 PNG, for saving to the gallery.
    AsyncFunction("qrPng") { upiUri: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      val file = qrFileFor(context, upiUri) ?: return@AsyncFunction null
      return@AsyncFunction Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
    }

    // Which of these apps accept a shared image, i.e. can take the QR in one tap instead of via the gallery.
    AsyncFunction("qrShareTargets") { packageNames: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<String>()
      val pm = context.packageManager
      return@AsyncFunction packageNames.filter { pkg ->
        val probe = Intent(Intent.ACTION_SEND).apply { type = "image/png"; setPackage(pkg) }
        pm.queryIntentActivities(probe, PackageManager.MATCH_DEFAULT_ONLY).isNotEmpty()
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == REQUEST_SAVE_FILE) {
        val (promise, content) = pendingSave ?: return@OnActivityResult
        pendingSave = null
        val uri = payload.data?.data
        if (payload.resultCode != Activity.RESULT_OK || uri == null) {
          promise.resolve(false)
          return@OnActivityResult
        }
        try {
          appContext.reactContext?.contentResolver?.openOutputStream(uri, "wt")?.use { it.write(content.toByteArray()) }
            ?: throw IllegalStateException("Could not open the file")
          promise.resolve(true)
        } catch (e: Exception) {
          promise.reject("ERR_SAVE", "Could not write the file", e)
        }
        return@OnActivityResult
      }
      if (payload.requestCode != REQUEST_UPI_PAY) return@OnActivityResult
      val promise = pendingPayment ?: return@OnActivityResult
      pendingPayment = null
      promise.resolve(
        mapOf(
          "resultCode" to payload.resultCode,
          "response" to upiResponseFrom(payload.data)
        )
      )
    }
  }

  @Volatile private var preparedUri: String? = null
  @Volatile private var preparedFile: File? = null

  @Synchronized
  private fun qrFileFor(context: Context, upiUri: String): File? {
    if (!upiUri.startsWith("upi://pay?", ignoreCase = true)) return null
    val cached = preparedFile
    if (preparedUri == upiUri && cached != null && cached.exists()) return cached
    return try {
      val dir = File(context.cacheDir, SHARE_DIR).apply { mkdirs() }
      val now = System.currentTimeMillis()
      dir.listFiles()?.forEach { if (now - it.lastModified() > SHARE_MAX_AGE_MS) it.delete() }
      val file = File(dir, "qr_${UUID.randomUUID()}.png")
      FileOutputStream(file).use { encodeQr(upiUri).compress(Bitmap.CompressFormat.PNG, 100, it) }
      preparedUri = upiUri
      preparedFile = file
      file
    } catch (e: Exception) {
      null
    }
  }

  // Low error correction keeps the code small (fewer modules), which UPI apps decode fastest from a clean image.
  // No character-set hint: UPI URIs are percent-encoded ASCII, and the hint would add an ECI header some scanners
  // handle badly.
  private fun encodeQr(text: String): Bitmap {
    val hints = mapOf(
      EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.L,
      EncodeHintType.MARGIN to 4,
    )
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints)
    val scale = maxOf(1, QR_TARGET_PX / matrix.width)
    val size = matrix.width * scale
    val pixels = IntArray(size * size)
    for (y in 0 until size) {
      val row = y * size
      for (x in 0 until size) {
        pixels[row + x] = if (matrix.get(x / scale, y / scale)) Color.BLACK else Color.WHITE
      }
    }
    return Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888)
  }

  private fun shareIntent(context: Context, file: File, packageName: String): Intent {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    return Intent(Intent.ACTION_SEND).apply {
      type = "image/png"
      putExtra(Intent.EXTRA_STREAM, uri)
      setPackage(packageName)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }

}
