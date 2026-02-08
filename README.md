# 💰 ExpenseTracker - Privacy-First UPI Expense Manager

> **Track your expenses automatically via UPI QR codes. No SMS snooping. No bank linking. Your data, your device.**

[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Privacy First](https://img.shields.io/badge/Privacy-First-00C853)]()

## 🎯 What Makes This Different

**ExpenseTracker** is an expense tracking app built for **privacy-conscious Indians**. Unlike other apps that read your SMS or link your bank accounts, we do things differently:

- ✅ **QR Code Scanning** - Capture payment details instantly
- ✅ **100% Local Storage** - All data stays on your device
- ✅ **Zero Permissions** - No SMS, contacts, or location access
- ✅ **Smart Verification** - Privacy-safe payment confirmation
- ✅ **Transaction Editing** - Fix mistakes without deleting
- ✅ **Privacy Dashboard** - Full transparency on what we store

## 📱 Features

### Core Functionality
- 🔍 **QR Code Scanner** - Scan UPI QR codes to pre-fill payment details
- 💸 **Manual Entry** - Quick cash/UPI entry with category selection
- ✏️ **Transaction Editing** - Edit amount, category, and notes
- 📊 **Monthly Statistics** - Category breakdown and spending trends
- 🔐 **Payment Verification** - Smart pending system (no SMS reading!)

### Privacy Features
- 🛡️ **Privacy Dashboard** - See exactly what data is stored
- 📊 **Data Inventory** - Transaction count, storage usage, data age
- 🗑️ **Delete All Data** - Clear everything with one tap
- 🔒 **Full Transparency** - No hidden data collection
- 📍 **Minimal Permissions** - Only camera for QR scanning

### Smart Features
- 📁 **Custom Categories** - Create unlimited expense categories
- 🔎 **Transaction Search** - Find transactions by amount, payee, or note
- 📅 **Monthly Reports** - Track spending patterns over time
- 🌙 **Dark Mode** - Easy on the eyes

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- npm or pnpm
- Expo CLI (installed automatically)
- Android Studio (for Android) or Xcode (for iOS)

### Installation

```bash
# Clone the repository
git clone https://github.com/Ujjwaljain16/ExpenseTracker.git
cd ExpenseTracker/upi-tracker-react-native

# Install dependencies
pnpm install

# Start development server
pnpm start
```

### Running on Device

#### Android
```bash
# Development build (recommended for testing UPI payments)
pnpm android

# Or scan QR code in Expo Go (payments won't work in dev mode)
```

#### iOS
```bash
pnpm ios
```

## ⚠️ Important Note About UPI Payments

**Payments will be declined in development mode** (Expo Go) because UPI apps block test environments for security. This is expected!

To test actual payments:
1. Build a production APK: `eas build --platform android --profile preview`
2. Install APK on your phone
3. Payments will work normally ✅

**For development**, use **Manual Entry** mode - no payment needed to track expenses!

## 🏗️ Tech Stack

- **Framework**: React Native 0.81 + Expo 54
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing)
- **Storage**: AsyncStorage (local-only)
- **UI**: Custom theme system (dark/light mode)
- **QR Scanning**: expo-camera
- **Charts**: react-native-chart-kit

## 📂 Project Structure

```
upi-tracker-react-native/
├── app/                        # Expo Router screens
│   ├── (tabs)/                # Tab navigation screens
│   │   ├── index.tsx          # Home screen
│   │   ├── history.tsx        # Transaction history
│   │   └── settings.tsx       # Settings screen
│   ├── scanner.tsx            # QR code scanner
│   ├── payment.tsx            # Payment confirmation
│   ├── edit-transaction.tsx   # Transaction editor
│   ├── pending-transactions.tsx # Payment verification
│   └── privacy-dashboard.tsx  # Privacy transparency
├── components/                # Reusable components
│   ├── transactions/          # Transaction cards, filters
│   └── payment/               # Payment confirmation dialog
├── services/                  # Business logic
│   ├── storage.ts             # Transaction CRUD
│   ├── payment-verification.ts # Smart verification
│   ├── category-storage.ts    # Category management
│   └── privacy-stats.ts       # Privacy dashboard data
├── constants/                 # Theme, categories, config
├── types/                     # TypeScript interfaces
└── hooks/                     # Custom React hooks
```

## 🛡️ Privacy Commitments

### What We Store (All Local)
- ✅ Transaction records (amount, payee, category, date)
- ✅ Custom categories you create
- ✅ Theme preference (dark/light mode)

### What We NEVER Access
- ❌ SMS messages or inbox
- ❌ Bank accounts or statements
- ❌ Notifications from other apps
- ❌ Contacts or call logs
- ❌ Location or GPS data
- ❌ Cloud servers or analytics

### Data Control
- 🗑️ **Delete All Data** - Removes everything permanently
- 📤 **Export** - Coming soon (JSON/CSV)
- 📥 **Import** - Coming soon (restore from backup)
- 🔒 **No Cloud Sync** - Your device only

## 🤝 Contributing

Contributions are welcome! This project prioritizes:
1. **Privacy-first design** - No compromises
2. **Offline-first** - Works without internet
3. **User control** - Users own their data
4. **Transparency** - Open source and auditable

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add your feature"

# Push and create PR
git push origin feature/your-feature-name
```

## 📋 Roadmap

- [x] Core expense tracking
- [x] QR code scanning
- [x] Transaction editing
- [x] Privacy dashboard
- [x] Payment verification (smart pending)
- [ ] Vernacular support (Hindi)
- [ ] Cash fast-track entry
- [ ] Data export/import (JSON + CSV)
- [ ] Budget limits and alerts
- [ ] Recurring expense tracking
- [ ] Optional encrypted cloud backup

## 🙏 Acknowledgments

Built with a focus on **privacy, transparency, and user control**. Inspired by the need for a truly private expense tracker in India.

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

## 📧 Contact

- **Author**: Ujjwal Jain
- **GitHub**: [@Ujjwaljain16](https://github.com/Ujjwaljain16)
- **Project**: [ExpenseTracker](https://github.com/Ujjwaljain16/ExpenseTracker)

---

**Made with ❤️ for privacy-conscious Indians**