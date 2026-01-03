import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllTransactions } from './storage';
import { getCategories } from './category-storage';
import * as FileSystem from 'expo-file-system';

export interface PrivacyStats {
    transactionCount: number;
    categoryCount: number;
    totalStorageBytes: number;
    oldestTransaction?: number;
    newestTransaction?: number;
    dataAgeDays?: number;
    lastBackup?: number;
}

/**
 * Get comprehensive privacy statistics
 */
export const getPrivacyStats = async (): Promise<PrivacyStats> => {
    try {
        const [transactions, categories] = await Promise.all([
            getAllTransactions(),
            getCategories(),
        ]);

        // Calculate storage sizes (approximate)
        const transactionsData = JSON.stringify(transactions);
        const categoriesData = JSON.stringify(categories);
        const totalStorageBytes =
            transactionsData.length + categoriesData.length;

        let oldestTransaction: number | undefined;
        let newestTransaction: number | undefined;
        let dataAgeDays: number | undefined;

        if (transactions.length > 0) {
            const timestamps = transactions.map(t => t.timestamp);
            oldestTransaction = Math.min(...timestamps);
            newestTransaction = Math.max(...timestamps);

            // Calculate days since oldest transaction
            const ageDiff = Date.now() - oldestTransaction;
            dataAgeDays = Math.floor(ageDiff / (1000 * 60 * 60 * 24));
        }

        // Check for last  backup timestamp
        const lastBackupStr = await AsyncStorage.getItem('@upitracker_last_backup');
        const lastBackup = lastBackupStr ? parseInt(lastBackupStr, 10) : undefined;

        return {
            transactionCount: transactions.length,
            categoryCount: categories.length,
            totalStorageBytes,
            oldestTransaction,
            newestTransaction,
            dataAgeDays,
            lastBackup,
        };
    } catch (error) {
        console.error('Error getting privacy stats:', error);
        return {
            transactionCount: 0,
            categoryCount: 0,
            totalStorageBytes: 0,
        };
    }
};

/**
 * Format bytes to human-readable string
 */
export const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Get list of storage keys used by the app
 */
export const getStorageKeys = async (): Promise<string[]> => {
    try {
        const keys = await AsyncStorage.getAllKeys();
        return keys.filter(key => key.startsWith('@upitracker'));
    } catch (error) {
        console.error('Error getting storage keys:', error);
        return [];
    }
};

/**
 * Check which optional permissions are granted
 */
export const getPermissionStatus = () => {
    // For now, we only use camera (optional) and notifications (optional)
    // This is a placeholder - actual permission checking would use react-native-permissions
    return {
        camera: 'optional',
        notifications: 'optional',
        sms: 'never_requested',
        contacts: 'never_requested',
        location: 'never_requested',
        storage: 'never_requested',
    };
};

/**
 * Record backup timestamp
 */
export const recordBackup = async (): Promise<void> => {
    try {
        await AsyncStorage.setItem(
            '@upitracker_last_backup',
            Date.now().toString()
        );
    } catch (error) {
        console.error('Error recording backup:', error);
    }
};
