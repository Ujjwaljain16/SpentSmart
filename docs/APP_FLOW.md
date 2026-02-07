# 🔄 SpentSmart Ecosystem: Complete Flow Guide

**SpentSmart** is a "Privacy-First, Local-First" expense tracker that uses a **3-Layer Hybrid Automation Stack** to provide seamless tracking without compromising user data.

---

## 🏛️ Core Architecture: "The Automation Pyramid"

The app automates tracking through three fallback layers, ensuring 100% coverage.

### **Layer 1: Notification Listener (The Brain)** 🧠
*   **What it does:** Reads incoming UPI/Bank SMS & Push Notifications in the background.
*   **How it works:** A bespoke Native Android Service (`NotificationListenerService.kt`) intercepts notifications, filters for apps like GPay/PhonePe, extracts `amount` and `payee` using Regex, and auto-saves the transaction.
*   **Status:** Always running (Background).

### **Layer 2: LocalSetu / Intent Monitor (The Handler)** ⚡
*   **What it does:** Acts as a self-hosted "Payment Gateway".
*   **How it works:**
    1.  **Direct Links:** When you tap a "Quick Pay" preset, the app generates a tracked UPI link (`upi://pay?tr=UNIQUE_ID...`).
    2.  **Callback Loop:** When the payment app returns, `IntentMonitor` captures the success/failure token.
    3.  **Auto-Confirm:** If successful, it instantly records the expense.
*   **Status:** Active during "Initiated" payments.

### **Layer 3: Voice Commander (The Fallback)** 🎙️
*   **What it does:** Handles unstructured "Cash" or "Forgot to scan" entries.
*   **How it works:**
    *   **"Paid 150 Swiggy"**: Parses NLP -> Records Past Expense.
    *   **"Pay Swiggy 150"**: Parses NLP -> Launches UPI App (triggers Layer 2).
*   **Status:** On-demand (FAB).

---

## 🗺️ Detailed User Flows

### 1. The "Scan & Pay" Flow (Manual Scan)
*   **User Action:** Taps "Scan QR" on Home.
*   **System:**
    1.  Scans QR Code (captures `pa`, `pn`, `am` params).
    2.  **Smart Derivation:** If name is "Google Merchant", extracts "Nandini Milk" from VPA.
    3.  User confirms amount.
    4.  App launches External UPI App.
    5.  User pays -> Returns to App.
    6.  App prompts: "Did this go through?" (Verification).
    7.  **Result:** Transaction Saved.

### 2. The "Quick Pay" Flow (Presets)
*   **User Action:** Opens "Quick Pay" -> Taps "Swiggy ₹150".
*   **System:**
    1.  `LocalUpiTracker` generates a unique ID.
    2.  Launches UPI App directly.
    3.  User pays -> Returns.
    4.  `IntentMonitor` detects success -> **Auto-Saves**.
    5.  **Result:** Zero-click confirmation.

### 3. The "Voice Command" Flow
*   **User Action:** Taps Mic Button (`🎙️`).
*   **Scenario A (Record Past):** "Paid 200 for Pizza".
    *   **System:** Parses Amount (200), Payee (Pizza), Category (Food). **Saves instantly.**
*   **Scenario B (Initiate New):** "Pay Landlord 15000".
    *   **System:** Detects intent "Pay" -> Launches UPI with tracked ID.

### 4. The "Passive" Flow (Notifications)
*   **User Action:** Pays via GPay (outside the app) OR receives money.
*   **System:**
    1.  Native Android Service wakes up.
    2.  Extracts "Paid ₹50 to Uber".
    3.  Checks for duplicates (deduplication logic).
    4.  **Saves to Storage.**
    5.  Updates UI if open.

### 5. The "Receiving" Flow (Money In)
*   **User Action:** Taps "Receive Money".
*   **System:** Show Personal QR.
*   **User Action:** Friend pays -> User receives Notification.
*   **System:** Layer 1 detects "Received ₹500" -> Records as **Income**.

---

## 🔐 Security & Privacy Flow

### **App Lock (Biometric)**
1.  **Backgrounding:** When app is minimized, `AppState` starts a timer.
2.  **Grace Period:** If returned within 2 mins, no lock.
3.  **Locking:** After 2 mins, `SecurityContext` enforces Biometric Auth.
4.  **Privacy Mode:** Toggling "Eye" icon applies a `BlurView` filter to all currency text components globally.

---

## 💾 Data Architecture
*   **Storage:** `AsyncStorage` (Local JSON).
*   **Sync:** None (100% Local).
*   **Backup:** (Planned) Encrypted JSON export.
*   **State:** React Context (`StatsContext`) hydrates from Storage on launch and updates via `DeviceEventEmitter`.

---

This architecture ensures **Maximum Convenience** (Automation) with **Maximum Privacy** (No Servers).
