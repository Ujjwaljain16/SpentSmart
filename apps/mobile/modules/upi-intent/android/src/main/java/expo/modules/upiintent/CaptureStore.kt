package expo.modules.upiintent

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import org.json.JSONObject
import java.io.File

internal const val PREFS = "spentsmart_capture"
internal const val KEY_CAPTURE_ENABLED = "capture_enabled"
internal const val KEY_PROXY_TARGET = "proxy_target"
internal const val NOTIFICATION_QUEUE = "capture_queue.jsonl"
internal const val PROXY_QUEUE = "proxy_queue.jsonl"
private const val MAX_QUEUED = 300

/**
 * A tiny append-only queue in the app's private files. Native code runs when the app's JavaScript isn't, so captured
 * payments wait here until the app next opens and drains them. Nothing here is ever sent anywhere.
 */
internal object CaptureStore {
  @Synchronized
  fun append(context: Context, name: String, entry: JSONObject) {
    val file = File(context.filesDir, name)
    val lines = if (file.exists()) file.readLines().filter { it.isNotBlank() } else emptyList()
    val kept = (lines + entry.toString()).takeLast(MAX_QUEUED)
    file.writeText(kept.joinToString("\n") + "\n")
  }

  @Synchronized
  fun drain(context: Context, name: String): List<Map<String, Any?>> {
    val file = File(context.filesDir, name)
    if (!file.exists()) return emptyList()
    val out = file.readLines().filter { it.isNotBlank() }.mapNotNull { line ->
      try {
        val json = JSONObject(line)
        json.keys().asSequence().associateWith { key -> json.opt(key).takeUnless { it == JSONObject.NULL } }
      } catch (e: Exception) {
        null
      }
    }
    file.delete()
    return out
  }
}

/**
 * UPI apps answer either with a single "response" extra (`txnId=..&responseCode=..&Status=..&txnRef=..`)
 * or with the individual fields as separate extras. Normalise both to the first form.
 */
internal fun upiResponseFrom(data: Intent?): String? {
  val extras: Bundle = data?.extras ?: return null
  extras.getString("response")?.takeIf { it.isNotBlank() }?.let { return it }

  val keys = listOf("txnId", "responseCode", "Status", "txnRef", "ApprovalRefNo")
  val parts = keys.mapNotNull { key ->
    @Suppress("DEPRECATION")
    val value = (extras.get(key) as? String)?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
    "$key=${Uri.encode(value)}"
  }
  return if (parts.isEmpty()) null else parts.joinToString("&")
}
