# Production-Grade UPI Implementation Guide

## 1. Merchant vs Personal Detection Algorithm

### Signal-Based Classification

We use **strong merchant signals** to classify QR codes accurately:

#### Strong Merchant Signals (any ONE indicates merchant)
- `mid` - Merchant ID
- `tid` - Terminal ID  
- `tr` - Transaction Reference (from POS)
- `orgid` - Organization ID
- `sign` - Bharat QR signature

#### Additional Merchant Indicators
- `mode=02` - Merchant mode flag
- `purpose=00` - Merchant purpose code

### Classification Logic

```typescript
const strongSignals = ['mid', 'tid', 'tr', 'orgid', 'sign'];
const hasStrongSignal = strongSignals.some(k => params[k]);
const isMerchant = hasStrongSignal || mode === '02' || purpose === '00';
```

### Parameter Handling

**Merchant (P2M)**: Preserve ALL parameters
```
pa, pn, mc, mid, tid, tr, mode, purpose, sign, orgid, am, cu, tn
```

**Personal (P2P)**: Strip merchant parameters
```
Keep: pa, pn, am, cu, tn
Remove: mc, mode, purpose, mid, tid, tr, sign, orgid
```

---

## 2. Bharat QR vs UPI QR Support

### QR Type Detection

| Format | Identifier | Handling |
|--------|-----------|----------|
| UPI QR | `upi://pay?...` | Parse with URL parser |
| Bharat QR | Starts with digits (EMV TLV) | Pass raw to UPI apps |
| Hybrid QR | Contains both | Prefer UPI intent |

### Bharat QR Handling

**❌ Don't:**
- Try to parse EMV TLV format yourself
- Convert Bharat QR to `upi://pay`
- Validate signatures manually

**✅ Do:**
```typescript
if (!qr.startsWith("upi://")) {
  // Pass raw QR to UPI app
  Linking.openURL(qr);
}
```

**Why:** UPI apps have proper EMV parsers with signature validation and CRC checks.

---

## 3. Future-Proof Expense → Payment Pipeline

### Architecture Principle

> **Decouple expense tracking from payment execution**

Payment is a **best-effort external action** - never assume success.

### Data Flow

```
1. Scan QR
   ├─ Detect type (UPI/Bharat)
   ├─ Classify (Personal/Merchant)
   └─ Sanitize params

2. Create Expense (status: PENDING)
   └─ Save BEFORE payment launch

3. Launch UPI App
   └─ No callback assumption

4. Result Handling (multi-layer)
   ├─ Intent callback (if received)
   ├─ User confirmation dialog
   └─ Manual reconciliation
```

### Why This Survives Reality

- ✅ App crashes → Expense saved
- ✅ No callback → User can confirm
- ✅ Payment timeout → Manual mark
- ✅ UPI app blocks → Transaction tracked
- ✅ OS kills app → Data persisted

### Status States

```typescript
PENDING   → Default after scan
SUCCESS   → Callback or user confirmed
FAILED    → Callback or user canceled  
UNKNOWN   → Timeout, needs reconciliation
```

---

## Implementation Status

### ✅ Completed
- Signal-based merchant detection
- Bharat QR format detection
- Personal/Merchant parameter sanitization
- Pending-first transaction save
- Dynamic QR amount preservation

### 🔄 Architecture Benefits
- Loosely coupled payment flow
- Resilient to UPI app behavior
- User-confirmable transactions
- Manual reconciliation support

---

## 4. Handling Strict Banks (The "Copy Fallback")

### The Problem
Some banks (e.g., Axis `@axl`, SBI) and PSPs treat external P2P intents as high-risk and block them, even if technically correct.

- **Symptom:** "Security Decline" or "Risk Rejected"
- **Cause:** Bank policy against unsigned external intents
- **Solution:** You cannot code around this. You must fallback to manual payment.

### The Solution: "Scan-and-Copy" UI

If a deep link fails or is known to be strict:

1.  **Don't Fail Silently:** Show a "Secure Payment Mode" UI.
2.  **Provide Data:**
    *   **VPA:** Copy Button
    *   **Amount:** Copy Button
3.  **Launch App Generic:** Just open PhonePe/GPay (no params).
4.  **User Flow:** User copies VPA -> Opens App -> Pastes -> Pays.

**This is 100% reliable and spec-compliant for utility apps.**

---

---

## 5. Industry Context & Strategic Pivot (The "Why")

### The "Deep Link" Dilemma
Research confirms that **pure payer-side deep links** (like ours) face inherent limitations compared to Merchant/PSP integrations:

1.  **Risk Policy Blocks:** Banks (Axis, SBI) reject unsigned external P2P intents to prevent "collect request fraud".
2.  **Missing Signatures:** We cannot generate the `sign` or `orgid` required for "verified" merchant transactions.
3.  **No Server Confirmation:** Unlike PSPs (Razorpay/PayTM) that provide webhooks, we rely on client-side state.

### Strategic Decision: The "Hybrid Client-Only" Model

Since this is a **Personal Expense Tracker** (Serverless / Local-First), we cannot implement a full PSP backend (Option A). Therefore, we adopt the **Option B/C Robust Fallback Strategy**:

| Scenario | Strategy | Reliability |
| :--- | :--- | :--- |
| **Merchant QR (Signed)** | **Exact Replay:** Pass raw query string byte-for-byte. Preserves `sign`. | High |
| **Targeted PSP (GPay/PhonePe)** | **Scheme Deep Link:** Use `tez://`, `phonepe://` etc. Bypasses generic intent filters. | **Very High** |
| **Personal QR (Simple)** | **Stripped Intent:** Remove all merchant params to avoid "Invalid Mode" errors. | Medium |
| **Strict/Blocked Banks** | **Manual Fallback:** "Scan-and-Copy" UI. 100% success rate via manual entry. | **100% (Guaranteed)** |

**Verdict:** The combination of **PSP Schemes** (primary) and **Manual Fallback** (safety net) solves the reliability crisis for Expo apps.

---

## Key Takeaways

1.  **Never guess** - Use strong signals for classification
2.  **Don't parse EMV** - Let UPI apps handle Bharat QR
3.  **Save first** - Decouple expenses from payment success
4.  **Fallback gracefully** - Use Copy-Paste for strict banks
5.  **Multi-layer validation** - Don't rely on callbacks alone

This matches how production finance apps (GPay, Paytm, PhonePe) handle UPI internally.
