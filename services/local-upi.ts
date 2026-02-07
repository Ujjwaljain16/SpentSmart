import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import { DeviceEventEmitter } from 'react-native';
import { saveTransaction } from '@/services/storage';

export interface PendingTxn {
    id: string;
    merchant: string;
    amount: number;
    note?: string;
    status: 'pending' | 'confirmed' | 'failed';
    timestamp: number;
}

// In-memory store for pending transactions (persisted state handled by app state/storage if needed)
// For now, in-memory works if app stays alive or we hydrate it.
const pendingTxns = new Map<string, PendingTxn>();

export class LocalUpiTracker {

    static generateLink(merchant: string, amount: number, note?: string): string {
        const uniqueId = Crypto.randomUUID().slice(0, 8); // Short ID for UPI param
        const txnId = `upi-${Date.now()}-${uniqueId}`;

        // Store pending
        pendingTxns.set(txnId, {
            id: txnId,
            merchant,
            amount,
            note,
            status: 'pending',
            timestamp: Date.now()
        });

        console.log(`🔗 Generated Tracked Link [${txnId}] for ₹${amount} to ${merchant}`);

        // Construct UPI Deep Link
        // tr = Transaction Ref ID (Crucial for callback tracking)
        // tn = Transaction Note
        // pn = Payee Name
        // pa = Payee Address (We need a VPA! "merchant" is often just a name. We need a VPA registry or input)
        // NOTE: The user's example assumed 'merchant' was 'merchant@paytm'. 
        // We will assume the input IS a VPA or we have a lookup. 
        // For specific "Preset" logic, we expect VPA.

        // If merchant doesn't have '@', we can't really pay. 
        // For now, we assume the input is a VPA or we fallback to a placeholder if testing.
        const vpa = merchant.includes('@') ? merchant : `${merchant.toLowerCase()}@upi`; // Fallback
        const name = merchant.split('@')[0];

        return `upi://pay?pa=${vpa}&pn=${name}&am=${amount}&cu=INR&tn=${note || 'Payment'}&tr=${txnId}`;
    }

    static async launchAndTrack(merchant: string, amount: number, note?: string) {
        const link = this.generateLink(merchant, amount, note);

        try {
            const canOpen = await Linking.canOpenURL(link);
            if (canOpen) {
                await Linking.openURL(link);
            } else {
                console.warn('Cannot open UPI link');
            }
        } catch (e) {
            console.error('Failed to launch UPI', e);
        }

        // Listener is handled globally by IntentMonitor -> handleCallback
    }

    static async handleCallback(url: string) {
        if (!url.includes('upi://')) return;

        try {
            // Parse params
            // url might be "upi://pay?..." or the callback scheme from the bank app?
            // Actually, standard UPI intent callback usually returns to the app with params IF we passed data.
            // OR, we just detect "App returned" and check status? 
            // The user's snippet implies we get a URL callback similar to webhooks. 
            // In Android Intent, it comes back to `Linking.getInitialURL` or listener.

            const params = new URLSearchParams(url.split('?')[1]);
            const txnId = params.get('tr');
            const response = params.get('response') || params.get('Status') || params.get('status');

            console.log(`🔄 UPI Callback: ID=${txnId}, Status=${response}`);

            if (txnId && pendingTxns.has(txnId)) {
                const txn = pendingTxns.get(txnId)!;

                if (response?.toLowerCase() === 'success' || response?.toLowerCase() === 'submitted') {
                    console.log('✅ Tracked Transaction SUCCESS');
                    txn.status = 'confirmed';

                    // Confirm in Storage
                    await saveTransaction(
                        {
                            upiId: txn.merchant,
                            payeeName: txn.merchant.split('@')[0],
                            amount: txn.amount,
                            transactionNote: txn.note
                        },
                        'uncategorized',
                        txn.note || 'Quick Pay',
                        txn.amount,
                        txn.timestamp,
                        'expense',
                        'upi',
                        txn.id // Use our tracked ID as external Ref
                    );

                    // Notify UI
                    DeviceEventEmitter.emit('onTransactionUpdate');
                } else if (response?.toLowerCase() === 'failure' || response?.toLowerCase() === 'failed') {
                    console.warn('❌ Tracked Transaction FAILED');
                    txn.status = 'failed';
                }

                pendingTxns.delete(txnId);
            }
        } catch (e) {
            console.error('Error handling UPI callback', e);
        }
    }
}
