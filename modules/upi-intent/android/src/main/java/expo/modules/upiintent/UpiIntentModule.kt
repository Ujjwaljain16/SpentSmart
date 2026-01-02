package expo.modules.upiintent

import android.content.Intent
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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
