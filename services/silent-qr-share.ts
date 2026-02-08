import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

// Load UpiIntent native module (development build only)
let UpiIntent: any = null;
try {
    UpiIntent = requireNativeModule('UpiIntent');
} catch (e) {

}

const GPAY_PACKAGE = 'com.google.android.apps.nbu.paisa.user';

export interface SilentQRShareOptions {
    upiId: string;
    payeeName: string;
    amount: number;
    transactionNote?: string;
}

/**
 * Build a UPI URL from payment data
 */
function buildUPIUrl(data: SilentQRShareOptions): string {
    const params = new URLSearchParams();
    params.append('pa', data.upiId);
    params.append('pn', data.payeeName);
    if (data.amount > 0) {
        params.append('am', data.amount.toFixed(2));
    }
    params.append('cu', 'INR');
    if (data.transactionNote) {
        params.append('tn', data.transactionNote);
    }
    return `upi://pay?${params.toString()}`;
}

/**
 * Generate QR code using online API and download as base64
 */
async function generateAndDownloadQR(upiUrl: string): Promise<string | null> {
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(upiUrl)}`;

    try {
        const response = await fetch(qrApiUrl);
        if (!response.ok) throw new Error('QR API failed');

        const blob = await response.blob();

        // Convert blob to base64
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                resolve(dataUrl);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error generating QR:', error);
        return null;
    }
}

/**
 * Share QR image to GPay silently using native module
 * This uses UpiIntent.shareDataUrl which handles base64 directly
 */
export async function shareQRToGPay(options: SilentQRShareOptions): Promise<boolean> {
    if (Platform.OS !== 'android') {
        console.log('QR share only works on Android');
        return false;
    }

    if (!UpiIntent) {
        console.log('UpiIntent not available - needs dev build');
        return false;
    }

    try {
        // 1. Build UPI URL
        const upiUrl = buildUPIUrl(options);


        // 2. Generate QR as data URL (base64)
        const dataUrl = await generateAndDownloadQR(upiUrl);
        if (!dataUrl) {

            return false;
        }


        // 3. Try to share via native module
        if (UpiIntent.shareBase64) {
            const success = await UpiIntent.shareBase64(GPAY_PACKAGE, dataUrl);

            return success;
        } else if (UpiIntent.shareDataUrl) {
            const success = await UpiIntent.shareDataUrl(GPAY_PACKAGE, dataUrl);

            return success;
        } else if (UpiIntent.shareTo) {
            // Fallback - native module expects file URI
            // For now, we'll return false and let the fallback kick in

            return false;
        }

        return false;
    } catch (error) {
        console.error('Error in shareQRToGPay:', error);
        return false;
    }
}

export const GPAY_PACKAGE_NAME = GPAY_PACKAGE;
