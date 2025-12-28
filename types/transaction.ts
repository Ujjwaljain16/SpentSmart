// CategoryType is now a string to support dynamic user-created categories
export type CategoryType = string;

export interface Transaction {
  id: string;
  amount: number;
  upiId: string;
  payeeName: string;
  category: CategoryType;
  reason?: string;
  timestamp: number;
  monthKey: string; // 'YYYY-MM' format for quick filtering
}

export interface UPIPaymentData {
  upiId: string;
  payeeName: string;
  amount?: number;
  transactionNote?: string;
}

export interface MonthlyStats {
  monthKey: string;
  total: number;
  categoryBreakdown: Record<CategoryType, number>;
  transactionCount: number;
}

export interface CategoryInfo {
  key: string;
  label: string;
  icon: string;
  color: string;
}

