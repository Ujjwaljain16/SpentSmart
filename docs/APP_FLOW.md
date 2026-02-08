# 🔄 SpentSmart Ecosystem: Complete Flow Guide

**SpentSmart** is a "Privacy-First, Local-First" expense tracker that uses a **3-Layer Hybrid Automation Stack** to provide seamless tracking without compromising user data.

---

## 🏛️ Core Architecture: "The Smart-Scan System"

The app prioritizes intentional tracking with automated verification.

### **Layer 1: Native Intent Module (The Bridge)** 🌉
*   **What it does:** Directly interfaces with installed UPI apps (GPay, PhonePe, Paytm).
*   **How it works:** Uses `modules/upi-intent` to discover package names and launch specific payment activities, bypassing the slow Android system chooser.
*   **Status:** Active during "Pay" actions.

### **Layer 2: Smart Pending Verification (The Safety Net)** ✅
*   **What it does:** Verifies if a payment actually happened without reading SMS.
*   **How it works:**
    1.  **Intent:** App records "Attempting ₹500 to Swiggy" before launch.
    2.  **Detection:** When you return to the app, `PendingManager` checks the time delta.
    3.  **Prompt:** A non-intrusive modal asks "Did this go through?".
    4.  **Action:** One-tap confirm saves it; swipe away discards it.
*   **Status:** Active on App Resume.

---

## 🗺️ Detailed User Flows

### 1. The "Scan & Pay" Flow (Manual Scan)
*   **User Action:** Taps "Scan QR" on Home.
*   **System:**
    1.  Scans QR Code (captures `pa`, `pn`, `am`).
    2.  **Smart Derivation:** Extracts "Nandini Milk" from VPA if name is generic.
    3.  User enters/confirms amount.
    4.  **Launch:** App opens GPay/PhonePe directly.
    5.  **Return:** User pays -> Returns to App.
    6.  **Verify:** "Pending Transaction" modal appears.
    7.  **Result:** Transaction Saved.

### 2. The "Quick Pay" Flow (Presets)
*   **User Action:** Opens "Quick Pay" -> Taps "Swiggy ₹150".
*   **System:**
    1.  `LocalUpiTracker` generates a unique ID (`tr`).
    2.  Launches UPI App directly.
    3.  User pays -> Returns.
    4.  **Auto-Check:** If app supports callback, auto-saves.
    5.  **Fallback:** If no callback, triggers "Pending Verification" modal.

### 3. The "Receiving" Flow (Money In)
*   **User Action:** Taps "Receive Money".
*   **System:** Generates a custom QR code with specific amount/note.
*   **Action:** Friend scans & pays.
*   **Result:** User manually records the incoming transaction (since we don't read SMS).

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
