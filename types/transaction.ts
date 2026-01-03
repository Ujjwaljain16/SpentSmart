// CategoryType is now a string to support dynamic user-created categories
export type CategoryType = string;
export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'upi' | 'cash' | 'bank' | 'other';

export interface Transaction {
  id: string;
  amount: number;
  upiId: string;
  payeeName: string;
  category: CategoryType;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  reason?: string;
  timestamp: number;
  monthKey: string; // 'YYYY-MM' format for quick filtering

  // Payment Verification Fields
  status: 'pending' | 'confirmed' | 'failed' | 'unknown';
  confidence: number; // 0-100 score
  verifiedAt?: number; // Timestamp when verified
  verifiedBy: 'user' | 'intent' | 'auto' | 'manual';
  upiTransactionId?: string; // If available from UPI intent
  verificationNotes?: string; // Optional user notes

  // Payment Flow Tracking (for confidence scoring)
  paymentAttemptId?: string; // Unique ID for this payment attempt
  launchedAt?: number; // When UPI app was launched
  returnedAt?: number; // When app resumed from UPI
  rawQr?: string; // Original scanned QR (for debugging/disputes)
  sanitizedUpiUri?: string; // Final URI sent to UPI app
  externalRef?: string; // External transaction reference (e.g. UPI 'tr' parameter)
}

export interface UPIPaymentData {
  upiId: string;
  payeeName: string;
  amount?: number;
  transactionNote?: string;
  // Store ALL original QR parameters for merchant verification
  rawParams?: Record<string, string>;
  rawQuery?: string; // Exact original query string for signature preservation
  rawQr?: string; // Original scanned QR data
}

export interface MonthlyStats {
  monthKey: string;
  totalIncome: number;
  totalExpense: number;
  categoryBreakdown: Record<CategoryType, number>;
  transactionCount: number;
}

export interface CategoryInfo {
  key: string;
  label: string;
  icon: string;
  color: string;
}

