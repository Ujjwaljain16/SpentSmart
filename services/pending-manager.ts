import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, UPIPaymentData, CategoryType } from '../types/transaction';

export interface PendingTransaction {
    id: string;
    paymentData: UPIPaymentData;
    category: CategoryType;
    reason?: string;
    timestamp: number;
    status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
    launchedApp?: string;
}

const PENDING_TX_KEY = 'pending_transactions';
const MAX_PENDING = 5;

export class PendingManager {
    /**
     * Save a new pending transaction
     */
    static async savePending(tx: PendingTransaction): Promise<void> {
        try {
            const storaged = await AsyncStorage.getItem(PENDING_TX_KEY);
            let pendings: PendingTransaction[] = storaged ? JSON.parse(storaged) : [];

            // Add new at the beginning
            pendings.unshift(tx);

            // Keep only recent pendings
            pendings = pendings.slice(0, MAX_PENDING);

            await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(pendings));

        } catch (error) {
            console.error('Failed to save pending transaction:', error);
        }
    }

    /**
     * Get all active pending transactions
     */
    static async getPendings(): Promise<PendingTransaction[]> {
        try {
            const storaged = await AsyncStorage.getItem(PENDING_TX_KEY);
            if (!storaged) return [];

            const pendings: PendingTransaction[] = JSON.parse(storaged);
            // Return only those that are still pending and not too old (e.g., 24h)
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;

            return pendings.filter(tx =>
                tx.status === 'pending' && (now - tx.timestamp) < oneDay
            );
        } catch (error) {
            console.error('Failed to get pending transactions:', error);
            return [];
        }
    }

    /**
     * Mark a pending transaction as resolved
     */
    static async resolvePending(id: string, status: 'confirmed' | 'cancelled'): Promise<void> {
        try {
            const storaged = await AsyncStorage.getItem(PENDING_TX_KEY);
            if (!storaged) return;

            let pendings: PendingTransaction[] = JSON.parse(storaged);
            const index = pendings.findIndex(tx => tx.id === id);

            if (index !== -1) {
                pendings[index].status = status;
                await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(pendings));

            }
        } catch (error) {
            console.error('Failed to resolve pending transaction:', error);
        }
    }

    /**
     * Delete a pending transaction entry
     */
    static async deletePending(id: string): Promise<void> {
        try {
            const storaged = await AsyncStorage.getItem(PENDING_TX_KEY);
            if (!storaged) return;

            let pendings: PendingTransaction[] = JSON.parse(storaged);
            pendings = pendings.filter(tx => tx.id !== id);

            await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(pendings));
        } catch (error) {
            console.error('Failed to delete pending transaction:', error);
        }
    }

    /**
     * Calculate smart confidence for a recovered transaction
     */
    static getConfidence(tx: PendingTransaction): number {
        const ageMinutes = (Date.now() - tx.timestamp) / (1000 * 60);

        if (ageMinutes < 5) return 85; // Very recent
        if (ageMinutes < 30) return 70; // Recent
        if (ageMinutes < 120) return 50; // A bit old
        return 30; // Old
    }
}
