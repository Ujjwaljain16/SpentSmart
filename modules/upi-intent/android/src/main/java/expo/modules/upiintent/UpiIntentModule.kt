package expo.modules.upiintent

import android.content.Intent
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

class UpiIntentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UpiIntent")

    // Launch UPI app by package name (like tapping app icon)
    AsyncFunction("launchAppByPackage") { packageName: String ->
      val activity = appContext.currentActivity 
        ?: throw Exception("No current activity available")
      
      val packageManager: PackageManager = activity.packageManager
      val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
      
      if (launchIntent != null) {
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(launchIntent)
        return@AsyncFunction true
      } else {
        throw Exception("App not installed: $packageName")
      }
    }

    // Share image to app (Robust Deep Link / Scan & Pay)
    AsyncFunction("shareTo") { packageName: String, uri: String ->
      val context = appContext.reactContext
      if (context == null) {
        return@AsyncFunction false
      }
      val applicationContext = context.applicationContext

      // Parse the URI
      val parsedUri = Uri.parse(uri)
      val finalUri: Uri = when {
        parsedUri.scheme == "file" -> {
          try {
            val file = File(parsedUri.path ?: return@AsyncFunction false)
            if (!file.exists()) {
              return@AsyncFunction false
            }
            
            val authority = "${applicationContext.packageName}.fileprovider"
            FileProvider.getUriForFile(applicationContext, authority, file)
          } catch (e: Exception) {
            parsedUri
          }
        }
        else -> parsedUri
      }

      val intent = Intent(Intent.ACTION_SEND).apply {
        type = "image/*"
        putExtra(Intent.EXTRA_STREAM, finalUri)
        setPackage(packageName)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      
      try {
        context.startActivity(intent)
        return@AsyncFunction true
      } catch (e: ActivityNotFoundException) {
        return@AsyncFunction false
      }
    }

    // Share base64 image to app
    AsyncFunction("shareBase64") { packageName: String, base64Data: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val applicationContext = context.applicationContext

      try {
        // 1. Decode base64
        val cleanBase64 = if (base64Data.contains(",")) base64Data.split(",")[1] else base64Data
        val decodedBytes = android.util.Base64.decode(cleanBase64, android.util.Base64.DEFAULT)

        // 2. Save to temp file
        val cacheDir = applicationContext.cacheDir
        val file = File(cacheDir, "payment_qr.png")
        java.io.FileOutputStream(file).use { stream ->
          stream.write(decodedBytes)
        }

        // 3. Get content URI
        val authority = "${applicationContext.packageName}.fileprovider"
        val contentUri = FileProvider.getUriForFile(applicationContext, authority, file)

        // 4. Share intent
        val intent = Intent(Intent.ACTION_SEND).apply {
          type = "image/png"
          putExtra(Intent.EXTRA_STREAM, contentUri)
          setPackage(packageName)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        context.startActivity(intent)
        return@AsyncFunction true
      } catch (e: Exception) {
        e.printStackTrace()
        return@AsyncFunction false
      }
    }

    // Launch UPI intent directly to a specific package (Gold Standard for GPay)
    AsyncFunction("launchUpiDirect") { uri: String, packageName: String ->
      val activity = appContext.currentActivity 
        ?: throw Exception("No current activity available")
      
      try {
        val intent = Intent(Intent.ACTION_VIEW).apply {
          data = Uri.parse(uri)
          setPackage(packageName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
        return@AsyncFunction true
      } catch (e: Exception) {
        return@AsyncFunction false
      }
    }

    // Get all installed apps that support UPI
    AsyncFunction("getUPIApps") {
      val activity = appContext.currentActivity 
        ?: throw Exception("No current activity available")
      
      val packageManager: PackageManager = activity.packageManager
      val intent = Intent(Intent.ACTION_VIEW).apply {
        data = android.net.Uri.parse("upi://pay")
      }
      
      // Query for apps that can handle the UPI intent
      val activities = packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
      
      return@AsyncFunction activities.map { resolveInfo ->
        mapOf(
          "packageName" to resolveInfo.activityInfo.packageName,
          "name" to resolveInfo.loadLabel(packageManager).toString()
        )
      }
    }

    // Show system UPI app chooser
    AsyncFunction("launchUPI") { upiUrl: String ->
      val activity = appContext.currentActivity 
        ?: throw Exception("No current activity available")
      
      val intent = Intent(Intent.ACTION_VIEW).apply {
        data = android.net.Uri.parse(upiUrl)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      
      val chooser = Intent.createChooser(intent, "Pay with")
      activity.startActivity(chooser)
      return@AsyncFunction true
    }
  }
}
