import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { AppState, AppStateStatus } from 'react-native';
import { parseUPIQRCode } from './upi-parser';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { LocalUpiTracker } from './local-upi';

let isListening = false;

export const initIntentMonitor = () => {
    if (isListening) return;
    isListening = true;



    // 1. Listen for Deep Links (upi://)
    Linking.addEventListener('url', handleDeepLink);

    // Check if app was launched via URL
    Linking.getInitialURL().then((url) => {
        if (url) handleDeepLink({ url });
    });

    // 2. Listen for Clipboard (AppState change)
    AppState.addEventListener('change', handleAppStateChange);
};

const handleDeepLink = async ({ url }: { url: string }) => {
    if (!url) return;

    // Check if it's a "LocalSetu" callback from a payment app
    // e.g., spentsmart://upi/callback?tr=...&status=...
    // OR upi://pay?tr=...&response=... (some apps return original scheme)
    if (url.includes('tr=') || url.includes('response=') || url.includes('Status=')) {

        await LocalUpiTracker.handleCallback(url);
        return; // specific callback handled, do not treat as new scan
    }

    if (!url.includes('upi://')) return;


    processUPIIntent(url, 'link');
};

const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
        // Check Clipboard for UPI links
        try {
            const hasString = await Clipboard.hasStringAsync();
            if (hasString) {
                const content = await Clipboard.getStringAsync();
                if (content.includes('upi://')) {
                    // Simple heuristic to avoid spamming: Check if it looks like a full UPI link
                    // and maybe if we haven't just processed it (could leverage a "last processed" timestamp)
                    // For now, we'll just check format.
                    const paymentData = parseUPIQRCode(content);
                    if (paymentData) {
                        Alert.alert(
                            'UPI Link Detected',
                            `Found payment link for ₹${paymentData.amount || '?'} to ${paymentData.payeeName}. Record this?`,
                            [
                                { text: 'Ignore', style: 'cancel' },
                                {
                                    text: 'Record Expense',
                                    onPress: () => processUPIIntent(content, 'clipboard')
                                }
                            ]
                        );
                    }
                }
            }
        } catch (e) {
            // Ignore clipboard errors
        }
    }
};

const processUPIIntent = (upiDataString: string, source: 'link' | 'clipboard') => {
    const paymentData = parseUPIQRCode(upiDataString);
    if (!paymentData) return;

    // Navigate to Payment Screen (or Confirmation)
    // We treat this similar to a "Scan"
    // Use a small delay to ensure navigation is ready if app just opened
    setTimeout(() => {
        router.push({
            pathname: '/payment',
            params: {
                upiId: paymentData.upiId || '',
                payeeName: paymentData.payeeName,
                amount: paymentData.amount?.toString() || '',
                transactionNote: paymentData.transactionNote || '',
                initialCategory: 'uncategorized'
            }
        });
    }, 500);
};
