# 🔄 SpentSmart - Complete Application Flow

This document visualizes the complete user journey and system logic for **SpentSmart**. It covers every feature from authentication to payment processing and data management.

## 🗺️ High-Level User Journey

```mermaid
stateDiagram-v2
    [*] --> AppLaunch
    
    state "Authentication" as Auth {
        AppLaunch --> BiometricCheck
        BiometricCheck --> Unlock: Success
        BiometricCheck --> Locked: Fail
        Locked --> BiometricCheck: Retry
    }

    state "Dashboard (Home)" as Home {
        Unlock --> HomeScreen
        HomeScreen --> MonthlyStats
        HomeScreen --> RecentTransactions
    }

    state "Core Actions" as Actions {
        HomeScreen --> Scanner: Tap "Scan QR"
        HomeScreen --> ManualEntry: Tap "+" FAB
        HomeScreen --> History: Tap "See All"
        HomeScreen --> Settings: Tap "Gear Icon"
    }

    state "Payment Flow" as Payment {
        Scanner --> ParseData: QR Detected
        ParseData --> PaymentConfirm: Valid UPI
        PaymentConfirm --> NativeIntent: Tap "Pay"
        NativeIntent --> UPI_App: Launch (PhonePe/GPay)
        UPI_App --> AppResume: Return to SpentSmart
        AppResume --> PendingState: Auto-add "Pending"
    }

    state "Verification" as Verify {
        PendingState --> ConfirmDialog
        ConfirmDialog --> History: Mark "Paid"
        ConfirmDialog --> Delete: Mark "Failed"
    }

    ManualEntry --> History: Save
    Payment --> Verify
```

---

## 📸 1. The "Scan & Pay" Lifecycle
**The core feature of SpentSmart.** This flow handles the complex interaction between the Camera, Native Android Intents, and App State management.

```mermaid
sequenceDiagram
    participant User
    participant Camera
    participant Parser
    participant UI_Dialog
    participant Native_Module
    participant External_UPI
    participant Background_Service
    participant Storage

    User->>Camera: Opens Scanner
    Camera->>Parser: Detects Barcode
    Parser->>Parser: Validates `upi://` scheme
    
    alt Invalid QR
        Parser-->>User: Show "Invalid Code" Error
    else Valid QR
        Parser->>UI_Dialog: Pre-fill Amount & Payee
        
        User->>UI_Dialog: Taps "Pay Now"
        UI_Dialog->>Native_Module: `UpiIntent.launchApp(uri)`
        Native_Module->>External_UPI: Deep Link (PhonePe/GPay)
        
        Note over User, External_UPI: User completes payment in banking app...
        
        External_UPI->>User: Returns User to SpentSmart
        
        Background_Service->>Storage: App Resume Detected?
        Storage->>Storage: Save Transaction as "PENDING"
        Storage->>UI_Dialog: Show "Verification" Modal
        
        User->>UI_Dialog: Confirms "Success"
        UI_Dialog->>Storage: Update Status: PENDING -> COMPLETED
    end
```

---

## 📝 2. Manual Entry & Contact Picking
**For cash transactions or payments not made via QR.** (e.g., sending money to a friend's number).

```mermaid
graph TD
    Start[Tap + Button] --> Choice{Entry Type?}
    
    Choice -->|Cash| Form[Manual Form]
    Choice -->|UPI| Form
    
    subgraph "Contact Integration"
        Form -->|Tap Contact Icon| Permission{Permission?}
        Permission -->|Denied| Error[Show Settings Link]
        Permission -->|Granted| Contacts[System Contact Picker]
        Contacts -->|Select Friend| Fill[Auto-fill Name]
    end
    
    Fill --> Category[Select Category]
    Category -->|Food/Travel/etc.| Note[Add Note]
    Note --> Save[Save Transaction]
    Save --> Storage[(AsyncStorage)]
```

---

## 🛡️ 3. Security & Privacy Mode
**How SpentSmart protects data visibility.**

```mermaid
stateDiagram-v2
    state "Privacy Settings" as PS {
        Toggle --> SavePref: User Toggles "Privacy Mode"
        SavePref --> Context: Update SecurityContext
        Context --> Broadcast: Emit Event
    }

    state "UI Layer (Re-render)" as UI {
        Broadcast --> ComponentCheck
        
        state "ThemedText Component" as Text {
             ComponentCheck --> IsCurrency?
             IsCurrency? --> IsPrivacyOn?
             
             IsPrivacyOn? --> Blurred: True (filter: blur)
             IsPrivacyOn? --> Clear: False
        }
    }
```

---

## 📊 4. Data Flow & Analytics
**How data moves from raw storage to visual insights.**

```mermaid
flowchart LR
    subgraph "Raw Data"
        Store[(AsyncStorage)]
        JSON[transactions.json]
    end

    subgraph "Processing Layer"
        Filter[Date Filter]
        Grouper[Category Grouper]
        Summer[Sum Calculator]
    end

    subgraph "Visualization"
        Pie[Pie Chart]
        Bar[Budget Bar]
        List[History List]
    end

    Store --> JSON
    JSON --> Filter
    Filter -->|Show Month| Grouper
    Grouper -->|Category Totals| Pie
    Grouper -->|Total Spent| Summer
    Summer --> Bar
```

---

## ⚙️ 5. App State & Locking Logic
**Ensuring the app locks immediately when minimized.**

```mermaid
sequenceDiagram
    participant User
    participant AppState_Listener
    participant Security_Service
    participant Lock_Screen

    User->>User: Minimizes App (Home Button)
    AppState_Listener->>Security_Service: Log `background` event
    Security_Service->>Security_Service: Set `isLocked = true`
    
    Note right of User: User returns after 1 hour...
    
    User->>User: Opens App
    AppState_Listener->>Security_Service: Log `active` event
    Security_Service->>Lock_Screen: Check `isLocked`?
    Lock_Screen->>User: SHOW BIOMETRIC PROMPT
    
    User->>Lock_Screen: FaceID / Fingerprint
    Lock_Screen->>Security_Service: Auth Success
    Security_Service->>User: Reveal App Content
```
