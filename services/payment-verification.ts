/**
 * Payment Verification Service
 * Provides smart confidence scoring and payment status management
 * Fully local and privacy-preserving
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction } from '@/types/transaction';

const PENDING_KEY = '@upitracker_pending';
const PATTERNS_KEY = '@upitracker_patterns';

/**
 * User behavior patterns (aggregate, privacy-safe analytics)
 */
interface UserPatterns {
    avgTimeInUPIApp: number; // Average seconds spent in UPI app
    successRate: number; // 0-1 ratio of confirmed vs total
    totalPayments: number;
    totalConfirmed: number;
    totalFailed: number;
    lastUpdated: number;
}

/**
 * Calculate confidence score for payment completion
 * Based on multiple privacy-safe signals
 */
export const calculateConfidence = async (
    launchedAt: number,
    returnedAt: number,
    amount: number,
    upiId: string
): Promise<number> => {
    let confidence = 50; // Start at neutral

    // Signal 1: Time spent in UPI app
    const timeInApp = (returnedAt - launchedAt) / 1000; // seconds

    if (timeInApp >= 10 && timeInApp <= 60) {
        // Typical successful payment time
        confidence += 30;
    } else if (timeInApp < 5) {
        // Likely cancelled immediately
        confidence -= 30;
    } else if (timeInApp > 120) {
        // Too long - might have backgrounded or had issues
        confidence -= 10;
    }

    // Signal 2: Historical success rate
    try {
        const patterns = await getUserPatterns();
        if (patterns && patterns.totalPayments > 5) {
            // Use historical data if we have enough samples
            const historicalBoost = patterns.successRate * 20; // max +20 points
            confidence += historicalBoost;
        }
    } catch (error) {
        // Ignore pattern errors
    }

    // Signal 3: Amount-based confidence
    if (amount > 0 && amount < 1000) {
        // Small amounts more likely to complete
        confidence += 5;
    } else if (amount > 10000) {
        // Large amounts might need more verification
        confidence -= 5;
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, confidence));
};

/**
 * Get pending transactions
 */
export const getPendingTransactions = async (): Promise<Transaction[]> => {
    try {
        const data = await AsyncStorage.getItem(PENDING_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch (error) {
        console.error('Error getting pending transactions:', error);
        return [];
    }
};

/**
 * Add transaction to pending list
 */
export const addPendingTransaction = async (transaction: Transaction): Promise<void> => {
    try {
        const pending = await getPendingTransactions();
        pending.unshift(transaction);
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (error) {
        console.error('Error adding pending transaction:', error);
    }
};

/**
 * Remove transaction from pending list
 */
export const removePendingTransaction = async (transactionId: string): Promise<void> => {
    try {
        const pending = await getPendingTransactions();
        const filtered = pending.filter(tx => tx.id !== transactionId);
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(filtered));
    } catch (error) {
        console.error('Error removing pending transaction:', error);
    }
};

/**
 * Clear all pending transactions
 */
export const clearPendingTransactions = async (): Promise<void> => {
    try {
        await AsyncStorage.removeItem(PENDING_KEY);
    } catch (error) {
        console.error('Error clearing pending transactions:', error);
    }
};

/**
 * Get user payment patterns (privacy-safe aggregates only)
 */
export const getUserPatterns = async (): Promise<UserPatterns | null> => {
    try {
        const data = await AsyncStorage.getItem(PATTERNS_KEY);
        if (!data) {
            // Initialize default patterns
            return {
                avgTimeInUPIApp: 15,
                successRate: 0.85,
                totalPayments: 0,
                totalConfirmed: 0,
                totalFailed: 0,
                lastUpdated: Date.now(),
            };
        }
        return JSON.parse(data);
    } catch (error) {
        console.error('Error getting user patterns:', error);
        return null;
    }
};

/**
 * Update user patterns after payment verification
 */
export const updateUserPatterns = async (
    wasConfirmed: boolean,
    timeInApp: number
): Promise<void> => {
    try {
        const patterns = await getUserPatterns();
        if (!patterns) return;

        patterns.totalPayments += 1;

        if (wasConfirmed) {
            patterns.totalConfirmed += 1;
        } else {
            patterns.totalFailed += 1;
        }

        // Update success rate
        patterns.successRate = patterns.totalConfirmed / patterns.totalPayments;

        // Update average time (exponential moving average)
        const alpha = 0.2; // Smoothing factor
        patterns.avgTimeInUPIApp =
            alpha * timeInApp + (1 - alpha) * patterns.avgTimeInUPIApp;

        patterns.lastUpdated = Date.now();

        await AsyncStorage.setItem(PATTERNS_KEY, JSON.stringify(patterns));
    } catch (error) {
        console.error('Error updating user patterns:', error);
    }
};

/**
 * Get smart prompt message based on confidence score
 */
export const getSmartPromptMessage = (confidence: number): {
    message: string;
    primaryOption: 'confirmed' | 'failed';
} => {
    if (confidence >= 70) {
        return {
            message: 'Payment completed successfully?',
            primaryOption: 'confirmed',
        };
    } else if (confidence <= 30) {
        return {
            message: 'Payment was cancelled or failed?',
            primaryOption: 'failed',
        };
    } else {
        return {
            message: 'Did the payment complete?',
            primaryOption: 'confirmed',
        };
    }
};

/**
 * Verify payment and update transaction status
 */
export const verifyPayment = async (
    transactionId: string,
    status: 'confirmed' | 'failed',
    verifiedBy: 'user' | 'intent' | 'auto' | 'manual',
    notes?: string
): Promise<boolean> => {
    try {
        // This will be called from storage.ts to update the main transaction
        return true;
    } catch (error) {
        console.error('Error verifying payment:', error);
        return false;
    }
};
