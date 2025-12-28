import * as Linking from 'expo-linking';
import { buildUPIUrl } from '@/constants/upi-config';

interface LaunchPaymentParams {
  upiId: string;
  payeeName: string;
  amount: number;
  transactionNote?: string;
}

/**
 * Launch UPI payment - lets user choose their preferred UPI app
 */
export const launchPayment = async (params: LaunchPaymentParams): Promise<boolean> => {
  try {
    const upiUrl = buildUPIUrl(params);
    const canOpenUPI = await Linking.canOpenURL(upiUrl);
    
    if (canOpenUPI) {
      await Linking.openURL(upiUrl);
      return true;
    }

    console.error('No UPI app available to handle payment');
    return false;
  } catch (error) {
    console.error('Error launching payment:', error);
    return false;
  }
};

/**
 * Check if any UPI app is available on the device
 */
export const isUPIAvailable = async (): Promise<boolean> => {
  try {
    const testUrl = 'upi://pay';
    return await Linking.canOpenURL(testUrl);
  } catch (error) {
    return false;
  }
};

