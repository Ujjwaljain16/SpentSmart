package expo.modules.upiintent

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.TileService
import android.widget.RemoteViews

private fun openLink(context: Context, link: String): Intent =
  Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

private fun pending(context: Context, requestCode: Int, link: String): PendingIntent =
  PendingIntent.getActivity(context, requestCode, openLink(context, link), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

/** "Add expense" in the pull-down Quick Settings panel: opens quick add with the keyboard up. */
class QuickAddTileService : TileService() {
  override fun onClick() {
    super.onClick()
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(pending(this, 0, "spentsmart://quick-add"))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(openLink(this, "spentsmart://quick-add"))
    }
  }
}

/** Home-screen widget: type, speak, or scan a QR to pay. */
class QuickAddWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = RemoteViews(context.packageName, R.layout.spentsmart_widget).apply {
      setOnClickPendingIntent(R.id.spentsmart_widget_add, pending(context, 1, "spentsmart://quick-add"))
      setOnClickPendingIntent(R.id.spentsmart_widget_voice, pending(context, 2, "spentsmart://quick-add?voice=1"))
      setOnClickPendingIntent(R.id.spentsmart_widget_scan, pending(context, 3, "spentsmart://scanner"))
    }
    ids.forEach { manager.updateAppWidget(it, views) }
  }
}
