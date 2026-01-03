import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import * as Crypto from 'expo-crypto';
import { Transaction, MonthlyStats, CategoryType, UPIPaymentData } from '@/types/transaction';

const TRANSACTIONS_KEY = '@upitracker_transactions';
const BUDGET_KEY = '@upitracker_monthly_budget';

/**
 * Get all transactions from storage, sorted by date (newest first)
 */
export const getAllTransactions = async (): Promise<Transaction[]> => {
  try {
    const data = await AsyncStorage.getItem(TRANSACTIONS_KEY);
    if (!data) return [];

    const transactions: Transaction[] = JSON.parse(data);
    return transactions.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error getting transactions:', error);
    return [];
  }
};

/**
 * Save a new transaction
 */
export const saveTransaction = async (
  paymentData: UPIPaymentData,
  category: CategoryType,
  reason?: string,
  amount?: number,
  launchedAt?: number,
  type: 'income' | 'expense' = 'expense',
  paymentMethod: 'upi' | 'cash' | 'bank' | 'other' = 'upi',
  externalRef?: string
): Promise<Transaction> => {
  try {
    const transactions = await getAllTransactions();

    // Prevent duplicates if externalRef is provided
    if (externalRef) {
      const existing = transactions.find(tx => tx.externalRef === externalRef);
      if (existing) {
        console.log(`Duplicate transaction detected for ref: ${externalRef}. Skipping.`);
        return existing;
      }
    }

    const timestamp = Date.now();

    const newTransaction: Transaction = {
      id: Crypto.randomUUID(),
      amount: amount || paymentData.amount || 0,
      upiId: paymentData.upiId,
      payeeName: paymentData.payeeName,
      category,
      type,
      paymentMethod,
      externalRef,
      reason: reason || undefined,
      timestamp,
      monthKey: format(new Date(timestamp), 'yyyy-MM'),

      // Payment verification fields
      status: 'pending', // Always start as pending
      confidence: 50, // Neutral until calculated
      verifiedBy: 'user', // Default to user verification
      launchedAt: launchedAt, // Track when payment was launched
      returnedAt: timestamp, // Track when app returned
    };

    transactions.unshift(newTransaction);
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));

    return newTransaction;
  } catch (error) {
    console.error('Error saving transaction:', error);
    throw error;
  }
};

/**
 * Get transactions for a specific month
 */
export const getTransactionsByMonth = async (monthKey: string): Promise<Transaction[]> => {
  try {
    const transactions = await getAllTransactions();
    return transactions.filter((tx) => tx.monthKey === monthKey);
  } catch (error) {
    console.error('Error getting transactions by month:', error);
    return [];
  }
};

/**
 * Delete a single transaction by ID
 */
export const deleteTransaction = async (id: string): Promise<boolean> => {
  try {
    const transactions = await getAllTransactions();
    const filtered = transactions.filter((tx) => tx.id !== id);

    if (filtered.length === transactions.length) {
      return false; // Transaction not found
    }

    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return false;
  }
};

/**
 * Update an existing transaction
 */
export const updateTransaction = async (
  id: string,
  updates: Partial<Omit<Transaction, 'id' | 'timestamp'>>
): Promise<boolean> => {
  try {
    const transactions = await getAllTransactions();
    const index = transactions.findIndex((tx) => tx.id === id);

    if (index === -1) {
      return false; // Transaction not found
    }

    // Update the transaction while preserving id and timestamp
    transactions[index] = {
      ...transactions[index],
      ...updates,
      // Recalculate monthKey if timestamp changed, otherwise keep original
      monthKey: format(new Date(transactions[index].timestamp), 'yyyy-MM'),
    };

    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    return true;
  } catch (error) {
    console.error('Error updating transaction:', error);
    return false;
  }
};

/**
 * Update transaction verification status
 */
export const updateTransactionStatus = async (
  id: string,
  status: 'pending' | 'confirmed' | 'failed' | 'unknown',
  verifiedBy: 'user' | 'intent' | 'auto' | 'manual',
  confidence?: number,
  upiTransactionId?: string,
  notes?: string
): Promise<boolean> => {
  try {
    const transactions = await getAllTransactions();
    const index = transactions.findIndex((tx) => tx.id === id);

    if (index === -1) {
      return false; // Transaction not found
    }

    // Update verification fields
    transactions[index] = {
      ...transactions[index],
      status,
      verifiedBy,
      verifiedAt: Date.now(),
      confidence: confidence ?? transactions[index].confidence,
      upiTransactionId: upiTransactionId ?? transactions[index].upiTransactionId,
      verificationNotes: notes ?? transactions[index].verificationNotes,
    };

    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    return true;
  } catch (error) {
    console.error('Error updating transaction status:', error);
    return false;
  }
};

/**
 * Clear all transaction data
 */
export const clearAllData = async (): Promise<boolean> => {
  try {
    await AsyncStorage.removeItem(TRANSACTIONS_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing data:', error);
    return false;
  }
};

/**
 * Get monthly statistics
 */
export const getMonthlyStats = async (monthKey: string): Promise<MonthlyStats> => {
  try {
    const transactions = await getTransactionsByMonth(monthKey);

    // Dynamic category breakdown based on actual transactions
    const categoryBreakdown: Record<CategoryType, number> = {};

    let totalIncome = 0;
    let totalExpense = 0;

    transactions.forEach((tx) => {
      // Default type to expense for existing transactions if type is missing
      const type = tx.type || 'expense';

      if (type === 'income') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
        if (!categoryBreakdown[tx.category]) {
          categoryBreakdown[tx.category] = 0;
        }
        categoryBreakdown[tx.category] += tx.amount;
      }
    });

    return {
      monthKey,
      totalIncome,
      totalExpense,
      categoryBreakdown,
      transactionCount: transactions.length,
    };
  } catch (error) {
    console.error('Error getting monthly stats:', error);
    return {
      monthKey,
      totalIncome: 0,
      totalExpense: 0,
      categoryBreakdown: {},
      transactionCount: 0,
    };
  }
};

/**
 * Get list of all months with transactions
 */
export const getAvailableMonths = async (): Promise<string[]> => {
  try {
    const transactions = await getAllTransactions();
    const months = [...new Set(transactions.map((tx) => tx.monthKey))];
    return months.sort().reverse(); // Most recent first
  } catch (error) {
    console.error('Error getting available months:', error);
    return [];
  }
};

/**
 * Search transactions by reason or category
 */
export const searchTransactions = async (query: string): Promise<Transaction[]> => {
  try {
    const transactions = await getAllTransactions();
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) return transactions;

    return transactions.filter((tx) => {
      return (
        tx.reason?.toLowerCase().includes(lowerQuery) ||
        tx.category.toLowerCase().includes(lowerQuery) ||
        tx.payeeName.toLowerCase().includes(lowerQuery) ||
        tx.upiId.toLowerCase().includes(lowerQuery)
      );
    });
  } catch (error) {
    console.error('Error searching transactions:', error);
    return [];
  }
};

/**
 * Get recent transactions (last N)
 */
export const getRecentTransactions = async (limit: number = 5): Promise<Transaction[]> => {
  try {
    const transactions = await getAllTransactions();
    return transactions.slice(0, limit);
  } catch (error) {
    console.error('Error getting recent transactions:', error);
    return [];
  }
};

/**
 * Get current month key
 */
export const getCurrentMonthKey = (): string => {
  return format(new Date(), 'yyyy-MM');
};

/**
 * Get monthly budget
 */
export const getBudget = async (): Promise<number | null> => {
  try {
    const budget = await AsyncStorage.getItem(BUDGET_KEY);
    return budget ? parseFloat(budget) : null;
  } catch (error) {
    console.error('Error getting budget:', error);
    return null;
  }
};

/**
 * Set monthly budget
 */
export const setBudget = async (amount: number): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(BUDGET_KEY, amount.toString());
    return true;
  } catch (error) {
    console.error('Error setting budget:', error);
    return false;
  }
};

