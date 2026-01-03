// Export the native UPI Intent module
export { default } from './src/UpiIntentModule';
export * from './src/UpiIntent.types';

// Convenience function for launching UPI payments
import UpiIntentModule from './src/UpiIntentModule';

export async function launchUPI(upiUrl: string): Promise<boolean> {
    try {
        return await UpiIntentModule.launchUPI(upiUrl);
    } catch (error) {
        console.error('UPI Intent Error:', error);
        throw error;
    }
}
