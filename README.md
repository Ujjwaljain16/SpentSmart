# 🛡️ SpentSmart - Privacy-First UPI Expense Manager

> **Smart. Secure. Private. Track expenses via UPI QR codes without compromising your data.**

[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo)](https://expo.dev/)
[![Privacy First](https://img.shields.io/badge/Privacy-First-00C853)]()
[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-blue)]()

## 🎯 Why SpentSmart?

**SpentSmart** is built for the **privacy-conscious Indian user**. Most expense trackers read your SMS, link your bank accounts, or upload data to the cloud. We don't.

- 🔒 **Biometric Security** - FaceID/Fingerprint lock for app access
- 👁️ **Privacy Mode** - Blur sensitive amounts with a single tap
- ⚡ **QR Code Scanning** - Instant payment details from UPI QRs
- 📱 **Contacts Integration** - Easily pick payees for manual entry
- 🏠 **100% Local Storage** - Your financial data never leaves your phone

## 📱 Key Features

### 🛡️ Security & Privacy
- **App Lock**: Secure the entire app with your device's biometrics.
- **Privacy Dashboard**: Transparent view of exactly what data is stored.
- **Zero Permissions**: No SMS, Location, or Storage access required.

### 💰 Smart Tracking
- **Scanner**: Scan any UPI QR to log expenses instantly.
- **Budgeting**: Set monthly limits and track progress with visual bars.
- **Analytics**: Beautiful charts for daily, weekly, and monthly spending.
- **Insights**: Category-wise breakdown to spot spending habits.

### ⚡ Seamless Experience
- **Manual Entry**: Fast entry with integrated Contact Picking.
- **Dark/Light Mode**: Automatic theme switching.
- **Transaction History**: Search, filter, and edit past transactions.

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- pnpm

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

## 🏗️ Tech Stack

- **Framework**: React Native 0.81 + Expo 54
- **Language**: TypeScript
- **Navigation**: Expo Router (File-based routing)
- **State/Storage**: React Context + AsyncStorage
- **Security**: `expo-local-authentication` (Biometrics)
- **Integration**: `expo-contacts`, `expo-camera`
- **Charting**: Custom optimized SVG charts

## 📂 Documentation

We maintain detailed documentation for developers:
- [📖 Architecture Overview](docs/ARCHITECTURE.md)
- [🚀 Publishing Guide](docs/PUBLISHING_GUIDE.md)
- [🧪 Testing Guide](docs/TESTING_GUIDE.md)

## 🤝 Contributing

Contributions are welcome! This project prioritizes:
1.  **Privacy-first design** - No compromises
2.  **Offline-first** - Works without internet
3.  **User control** - Users own their data

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

---

**Made with ❤️ for privacy-conscious Indians**
