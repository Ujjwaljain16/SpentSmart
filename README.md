<p align="center">
  <img src="assets/images/icon.png" alt="SpentSmart Logo" width="120" height="120" />
</p>

<h1 align="center">SpentSmart</h1>
<p align="center"><strong>Privacy-First UPI Expense Tracker for India</strong></p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react" alt="React Native" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Expo-54-000020?logo=expo" alt="Expo" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Privacy-First-00C853" alt="Privacy First" /></a>
</p>

---

## 📖 What is SpentSmart?

**SpentSmart** is a mobile expense tracking app designed specifically for the Indian UPI ecosystem. Scan any UPI QR code, track your spending, and get insights — all while keeping your data **100% local** on your device.

No cloud. No SMS access. No bank linking. Just pure, private expense tracking.

---

## 🤔 Why SpentSmart?

Most expense apps in India require invasive permissions:
- ❌ Reading your SMS for transaction alerts
- ❌ Linking your bank accounts via Account Aggregators
- ❌ Uploading your financial data to cloud servers

**SpentSmart takes a different approach:**

| Feature | SpentSmart | Other Apps |
|---------|------------|------------|
| Data Storage | 📱 100% Local | ☁️ Cloud |
| SMS Access | ❌ Not Required | ✅ Required |
| Bank Linking | ❌ Never | ✅ Often Required |
| Works Offline | ✅ Yes | ❌ Usually No |
| Open Source | ✅ Yes | ❌ Rarely |

---

## ✨ Features

### 🔒 Security & Privacy
- **Biometric Lock** — FaceID/Fingerprint to unlock the app
- **Privacy Mode** — Blur amounts with one tap
- **Privacy Dashboard** — See exactly what data is stored
- **Zero Cloud** — All data stays on your phone

### 📸 Smart Expense Tracking
- **QR Scanner** — Scan any UPI QR code to log payments instantly
- **Manual Entry** — Quick entry with contact picker integration
- **Categories** — Auto-categorize or customize your own
- **Edit & Delete** — Full control over your transaction history

### 📊 Insights & Analytics
- **Daily/Weekly/Monthly** trends
- **Category breakdown** with visual charts
- **Budget tracking** with progress bars
- **Spending patterns** to spot habits

### ⚡ User Experience
- **Dark/Light Mode** — Automatic theme switching
- **OTA Updates** — Get new features without app store updates
- **Crash Protection** — Global error boundary for stability
- **Optimized Lists** — Smooth scrolling even with 1000+ transactions

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/Ujjwaljain16/ExpenseTracker.git
cd ExpenseTracker/upi-tracker-react-native

# Install dependencies
npm install

# Start development server
npx expo start
```

### Building for Production

```bash
# Configure EAS (one-time)
eas build:configure

# Build Android APK
eas build --platform android --profile preview

# Push OTA update (no build needed)
eas update --branch preview --message "Your update message"
```

---

## 🏗️ Architecture

```
upi-tracker-react-native/
├── app/                    # Screens (Expo Router file-based routing)
│   ├── (tabs)/             # Tab navigation screens
│   ├── onboarding/         # First-time user flow
│   └── *.tsx               # Individual screens
├── components/             # Reusable UI components
│   ├── home/               # Home screen components
│   ├── payment/            # Payment flow components
│   └── ui/                 # Generic UI elements
├── services/               # Business logic layer
│   ├── storage.ts          # Transaction CRUD operations
│   ├── analytics.ts        # Insights calculations
│   └── upi-app-launcher.ts # UPI intent handling
├── contexts/               # React Context providers
│   └── security-context.tsx
├── hooks/                  # Custom React hooks
├── constants/              # Theme, categories, UPI config
└── types/                  # TypeScript interfaces
```

### Key Principles
- **Separation of Concerns**: Services handle data, contexts handle state, components handle UI
- **Privacy by Design**: No network calls for user data
- **Offline First**: Works without internet
- **Type Safety**: Full TypeScript coverage

---

## 🛡️ Permissions

SpentSmart requires minimal permissions:

| Permission | Purpose | When Asked |
|------------|---------|------------|
| Camera | Scan UPI QR codes | When you open Scanner |
| Biometrics | Secure app access | When you enable App Lock |
| Contacts | Pick payees for manual entry | When you tap "Pick Contact" |

**What we DON'T access:** SMS, Location, Storage, Internet (for user data)

---

## 📄 Privacy Policy

See [PRIVACY.md](PRIVACY.md) for our complete privacy policy.

**TL;DR**: Your data never leaves your device. We can't see it, we don't want it, we don't collect it.

---

## 🤝 Contributing

Contributions are welcome! Please ensure:
1. **Privacy First** — No changes that send user data externally
2. **Offline First** — Features must work without internet
3. **Type Safe** — All code must be TypeScript

---

## 📄 License

MIT License — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Made with ❤️ for privacy-conscious Indians</strong><br/>
  <sub>Your money. Your data. Your control.</sub>
</p>
