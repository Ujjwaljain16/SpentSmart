# 🧪 SpentSmart Testing Guide

## 📱 Building the APK

### Prerequisites
```bash
# Install EAS CLI globally (if not already installed)
npm install -g eas-cli

# Login to Expo account
eas login
```

### Build Commands

**Option 1: Development Build (Recommended for testing)**
```bash
cd upi-tracker-react-native
eas build --platform android --profile release-apk
```

**Option 2: Production Build**
```bash
eas build --platform android --profile production
```

### What to Expect
- ⏱️ **Build time**: 10-15 minutes
- 📦 **Output**: Download link for APK
- 📱 **Install**: Transfer APK to phone and install

---

## ✅ Complete Feature Testing Checklist

### 1. QR Code Scanning & UPI Payments ⭐ CRITICAL

**Test Cases:**
- [ ] **Scan Valid UPI QR Code**
  - Open scanner from home screen
  - Scan a real merchant QR code
  - Verify payee name, UPI ID parsed correctly
  - Verify amount pre-filled (if in QR)
  
- [ ] **Complete Payment Flow**
  - Select category (Food, Transport, etc.)
  - Add optional note/reason
  - Tap "Pay" button
  - **UPI app should launch** (PhonePe/GPay/Paytm)
  - **Payment should NOT be declined** ✅
  - Complete payment in UPI app
  - Return to ExpenseTracker
  - Transaction saved as "pending"

- [ ] **Verify Pending Transaction**
  - Go to Settings → Pending Payments
  - See the transaction listed
  - Tap "Paid" to confirm
  - Transaction moved to history

**Expected Result**: UPI payments work without "security decline" error!

---

### 2. Manual Entry 💰

**Test Cases:**
- [ ] **Cash Entry**
  - Tap "+" button on home
  - Select "Manual Entry"
  - Enter amount (e.g., ₹50)
  - Enter payee name (e.g., "Auto Driver")
  - Select category (Transport)
  - Add note
  - Save transaction
  
- [ ] **Verify Transaction Saved**
  - Check Home screen recent transactions
  - Verify amount, payee, category correct
  - Check History screen

**Expected Result**: Manual entries work without needing payment!

---

### 3. Transaction Editing ✏️

**Test Cases:**
- [ ] **Edit from Home Screen**
  - Find recent transaction
  - Tap pencil/edit icon
  - Change amount (e.g., ₹50 → ₹55)
  - Change category
  - Update note
  - Save changes
  
- [ ] **Edit from History Screen**
  - Go to History tab
  - Find any transaction
  - Tap edit icon
  - Make changes
  - Verify changes saved

- [ ] **Edit Validation**
  - Try saving with empty amount (should fail)
  - Try editing old transaction (should work)

**Expected Result**: All edits save correctly, timestamp preserved!

---

### 4. Privacy Dashboard 🛡️

**Test Cases:**
- [ ] **View Privacy Stats**
  - Go to Settings → Privacy Dashboard
  - Verify transaction count correct
  - Check storage usage displayed
  - Verify "oldest transaction" date

- [ ] **Data Inventory**
  - Verify categories listed
  - Check "What We Store" section
  - Verify "What We Never Access" section

- [ ] **Delete All Data**
  - Tap "Delete All Data"
  - Confirm deletion
  - Verify all transactions removed
  - Check history is empty
  - Verify home shows 0 transactions

**Expected Result**: Complete transparency, deletion works!

---

### 5. Search & Filtering 🔍

**Test Cases:**
- [ ] **Search by Amount**
  - Go to History
  - Search for specific amount (e.g., "50")
  - Verify matching transactions shown

- [ ] **Search by Payee**
  - Search for payee name
  - Verify correct results

- [ ] **Search by Note**
  - Search for words in transaction notes
  - Verify results

**Expected Result**: Real-time search works smoothly!

---

### 6. Categories & Statistics 📊

**Test Cases:**
- [ ] **View Monthly Stats**
  - Check home screen monthly total
  - Verify category breakdown (pie chart)
  - Verify percentages add to 100%

- [ ] **Category Management**
  - Go to Settings → Manage Categories
  - Create new category (e.g., "Entertainment")
  - Edit category name/icon
  - Delete custom category
  - Reset to defaults

- [ ] **Use Custom Category**
  - Create transaction with custom category
  - Verify it appears in stats

**Expected Result**: Stats accurate, custom categories work!

---

### 7. Payment Verification System 🎯

**Test Cases:**
- [ ] **Pending Transactions List**
  - Make 2-3 UPI payments
  - Go to Settings → Pending Payments
  - Verify all pending payments listed
  - Check confidence scores displayed

- [ ] **Individual Verification**
  - Tap "Paid" on successful payment
  - Tap "Failed" on cancelled payment
  - Verify transaction status updated

- [ ] **Bulk Confirmation**
  - Have 3+ pending transactions
  - Tap "Confirm All as Paid"
  - Verify all moved to confirmed

- [ ] **Confidence Scoring**
  - Quick cancel (< 5s) should show low confidence
  - Normal payment (10-20s) should show high confidence
  - Check confidence badge colors

**Expected Result**: Smart verification reduces friction!

---

### 8. Dark Mode & Themes 🌙

**Test Cases:**
- [ ] **Toggle Dark Mode**
  - Go to Settings
  - Toggle dark mode switch
  - Verify entire app changes theme
  - Check all screens (Home, History, Settings)

- [ ] **Theme Consistency**
  - Verify colors consistent across screens
  - Check modals/dialogs use theme
  - Verify charts/graphs themed

**Expected Result**: Seamless dark mode throughout!

---

### 9. Transaction Deletion 🗑️

**Test Cases:**
- [ ] **Delete from Home**
  - Tap trash icon on recent transaction
  - Confirm deletion
  - Verify removed from list

- [ ] **Delete from History**
  - Delete transaction from history
  - Verify removed
  - Check stats updated

**Expected Result**: Deletions instant and permanent!

---

### 10. Edge Cases & Error Handling ⚠️

**Test Cases:**
- [ ] **No UPI App Installed**
  - (If possible) Uninstall all UPI apps
  - Try scanning QR
  - Should show "No UPI App Found" error

- [ ] **Invalid QR Code**
  - Scan non-UPI QR code
  - Should show "Invalid QR Code" error

- [ ] **Empty States**
  - Delete all data
  - Check home shows "No transactions" message
  - Check history shows empty state
  - Check pending payments empty

- [ ] **Large Amounts**
  - Enter ₹99,999
  - Verify formatting correct (₹99,999)
  - Verify saves and displays correctly

**Expected Result**: Graceful error handling!

---

## 🎯 Priority Test Flow (Quick Verification)

**If short on time, test this flow:**

1. ✅ Scan real merchant QR code
2. ✅ Complete UPI payment (should work!)
3. ✅ Verify pending transaction
4. ✅ Confirm payment
5. ✅ Edit transaction
6. ✅ Check privacy dashboard
7. ✅ Delete all data

**Time**: ~5 minutes  
**Coverage**: All critical features

---

## 📊 Success Criteria

**Before considering app production-ready:**

| Feature | Status | Notes |
|---------|--------|-------|
| QR Scanning | ⬜ | Must work reliably |
| UPI Payments | ⬜ | No security declines in APK |
| Payment Verification | ⬜ | Pending system works |
| Transaction Editing | ⬜ | All edits save correctly |
| Privacy Dashboard | ⬜ | Stats accurate |
| Delete All Data | ⬜ | Complete cleanup |
| Search | ⬜ | Real-time, accurate |
| Dark Mode | ⬜ | No visual bugs |

**Target**: All ✅ before shipping!

---

## 🐛 Known Issues to Watch For

1. **UPI Payment Decline** - Should be fixed in APK (not Expo Go)
2. **Camera Permission** - Should auto-request on first scan
3. **Storage Permission** - Not needed (AsyncStorage only)
4. **Network Permission** - Not needed (100% offline)

---

## 📝 Reporting Issues

If you find bugs during testing:

```markdown
**Bug**: [Short description]
**Steps to Reproduce**:
1. 
2. 
3. 

**Expected**: [What should happen]
**Actual**: [What actually happens]
**Screenshot**: [If visual bug]
```

---

## 🚀 Next Steps After Testing

Once all tests pass:

1. ✅ Build production APK
2. ✅ Test on multiple devices
3. ✅ Prepare Play Store listing
4. ✅ Create app screenshots
5. ✅ Write privacy policy
6. ✅ Submit for review

---

**Happy Testing! 🎉**
