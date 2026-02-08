# UPI Tracker

UPI Tracker is a privacy-first Android app I built to solve a very specific personal problem: <br>Tracking my UPI expenses without giving any third-party app access to my bank data, SMS, or identity.

## Why I Built This

Almost all my day-to-day spending happens via UPI, mostly through Google Pay.  
**The problem**: once payments are done, it becomes painful to see where the money actually went - by category, by month, or by purpose. Existing expense tracking apps either:
- Force KYC and bank integrations  
- Scrape SMS and transaction data  
- Push cloud sync and analytics  

I did not want to hand over my financial footprint to someone else just to see basic stats.  
So the requirement was clear: track UPI expenses **without**:
- KYC  
- Bank login  
- SMS scraping  
- Cloud storage  

Only QR-based UPI flows and local storage on my device.

## From Idea to Plan

Before writing any code, I documented the app as an actual product, not a vibe-driven prototype.  
The architecture came first, then implementation.

Key decisions:
- Android-first, self-consumption app  
- React Native + Expo for fast iteration and good DX
- AsyncStorage for local-only persistence, no backend at all
- Clear separation between:
  - UI screens (Home, Scanner, Payment, History, Settings)
  - Service layer for storage, UPI parsing/launching, categories, PDF export

Cursor IDE + Perplexity AI were used in multi-turn loops to:
- Shape the architecture (service layer, repository-style access, data models)
- Design flows (QR scan → parse → confirm → launch UPI → track)
- Validate trade-offs (privacy vs features, local-only vs sync, performance on large histories)

This was not “generate a full app from one prompt”. It was iterative: write docs, refine flows, then code against that plan.

## What the App Does

**Core problem it solves:**  
When I pay via UPI using QR codes, I want to immediately attach meaning to that payment and see it later in a structured way - by month, by category, and with indexable metadata - without any third party involved.

Main capabilities:
- Scan any UPI QR code using the camera and extract UPI ID, payee name, and amount.
- Add minimal metadata:
  - Category (Food, Utility, College, Rent, Other)
  - Reason (short text)  
  - Optional description for context  
- Launch the UPI app via deeplink/intent with pre-filled payment details.
- Assume success (for privacy and simplicity) and:
  - Save the transaction locally with timestamp, month grouping, and category.
- Manage data:
  - Monthly summaries and category breakdowns with charts
  - Full history with search across payee, UPI ID, category, and reason
  - Manual delete per transaction  
  - “Clear all data” in Settings for a full reset
- Export professional-looking PDF reports with:
  - Monthly totals  
  - Category breakdown  
  - Transaction list and charts, sharable via native share sheet.

All data lives entirely on-device using AsyncStorage with a simple, explicit schema.
No network, no accounts, no external APIs required for core features.

## Architecture in Practice

The app follows a clean, service-driven architecture so the UI stays thin and focused.

- **Services layer**:
  - `storage` service: CRUD for transactions, monthly stats, search, delete, clear-all.
  - `upi-parser` service: parse UPI QR URLs, validate UPI IDs, extract payee and amount.
  - `upi-launcher` service: check if any UPI apps exist, construct deeplink, launch intent safely.
  - `category-storage` service: manage categories and their labels/icons/colors.
  - `pdf-export` service: generate HTML + charts → print to PDF → save/share.

- **UI layer**:
  - Home: monthly stats + recent transactions.
  - Scanner: full-screen camera for QR scanning with validation.
  - Payment: confirm parsed data, set category and metadata, trigger UPI launch.
  - History: list with search, per-transaction delete.
  - Settings: data export, clear-all, theme management.

Theme is dark-first, clean, and minimal with a consistent teal accent and reusable components like `TransactionCard`, `CategoryPicker`, and `CategoryPieChart`.

## How I Used AI and Tools

The stack around me was:
- Cursor IDE for navigable, incremental edits and refactors  
- Perplexity AI for:
  - Checking UPI deeplink behaviors and constraints  
  - Refining architecture and data models  
  - Validating security/privacy decisions  
- Architecture and codebase analysis docs generated and refined iteratively, not after the fact.

The process was:
1. Define the real problem (UPI-heavy life, distrust of bank-integrated trackers).  
2. Draft architecture and flows in markdown.  
3. Iterate with AI on edge cases (UPI limits, callbacks, privacy trade-offs).  
4. Implement in small, testable pieces following the written plan.  
5. Generate and refine architecture/codebase docs to match the actual implementation.

UPI Tracker is the output of that loop: a focused, opinionated tool for my own UPI life, built with deliberate design rather than a single-shot prompt.