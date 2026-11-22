package expo.modules.upiintent

import android.content.Intent
import android.net.Uri
import android.os.Bundle

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
