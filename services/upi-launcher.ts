import { Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { requireNativeModule } from 'expo';

// Attempt to load the native module for the generic Intent.createChooser
let launchNativeUPI: any = null;
try {
  const UpiIntent = requireNativeModule('UpiIntent');
  // We'll add launchUPI back to the native module in the next step to support the chooser
  launchNativeUPI = UpiIntent.launchUPI;
} catch (e) {
  console.log('⚠️ UpiIntent native module not found in upi-launcher.ts');
}

import { buildUPIUrl } from '@/constants/upi-config';

interface LaunchPaymentParams {
  upiId: string;
  payeeName: string;
  amount: number;
  transactionNote?: string;
  rawParams?: Record<string, string>; // Original QR parameters
  rawQuery?: string; // Original raw query string
}

export interface UPIApp {
  name: string;
  scheme: string;
  pkg?: string; // Android package name (optional, for explicit intent)
  icon?: string; // TODO: Add icon mapping later
}

// Known UPI App Schemes - The "Magic Key" to bypass risk engines
// These typically working schemes bypass generic browser intents
export const UPI_APPS: UPIApp[] = [
  { name: 'Google Pay', scheme: 'tez://upi/pay' },
  { name: 'PhonePe', scheme: 'phonepe://pay' },
  { name: 'Paytm', scheme: 'paytmmp://pay' },
  { name: 'BHIM', scheme: 'bhim://pay' },
  // Amazon Pay usually handles via generic upi:// but can try amazonpay:// in future
];

/**
 * Detects which PSP apps are installed on the device.
 * Vital for showing a "Pay with..." selection sheet.
 */
export const getAvailableUPIApps = async (): Promise<UPIApp[]> => {
  const availableApps: UPIApp[] = [];

  for (const app of UPI_APPS) {
    try {
      // Test if the OS can handle this scheme
      const canOpen = await Linking.canOpenURL(app.scheme);
      if (canOpen) {
        availableApps.push(app);
      }
    } catch (e) {
      console.log(`Error checking scheme ${app.scheme}:`, e);
    }
  }

  // Always include a "Generic UPI" fallback that uses the standard intent
  // This catches any other apps (Jupiter, Cred, Bank Apps) via the OS chooser
  availableApps.push({ name: 'Other UPI Apps', scheme: 'upi://pay' });

  return availableApps;
};

/**
 * Launches a specifically chosen PSP app.
 * By targeting the scheme (e.g. tez://), we enter the trusted native flow.
 */
export const launchPSPPayment = async (
  params: LaunchPaymentParams,
  targetApp?: UPIApp
): Promise<boolean> => {
  try {
    // 1. Build the STANDARD (and correct) UPI query string
    // This handles the complexity of "Same param replay" vs "Stripped P2P"
    const genericUrl = buildUPIUrl(params);

    // Extract the query part (everything after upi://pay?)
    const queryPart = genericUrl.split('?')[1];

    // 2. Determine the Final URL Scheme
    let finalUrl = genericUrl;

    if (targetApp && targetApp.scheme !== 'upi://pay') {
      // PSP-SPECIFIC SCHEMES (phonepe://, tez://, paytmmp://)
      // StackOverflow shows these work with ALL params when using + for spaces

      console.log(`🎯 Using PSP scheme: ${targetApp.name}`);

      // Build PSP URL with ALL params (no stripping needed)
      const baseScheme = targetApp.scheme.endsWith('?')
        ? targetApp.scheme.slice(0, -1)
        : targetApp.scheme;

      finalUrl = `${baseScheme}?${queryPart}`;
      console.log(`   URL: ${finalUrl}`);
    } else {
      console.log('🌐 Using Generic UPI Intent');
    }

    // 3. Launch!
    if (Platform.OS === 'android') {
      // Try native module first (better success rate with Intent.createChooser)
      if (!targetApp || targetApp.scheme === 'upi://pay') {
        if (launchNativeUPI) {
          try {
            console.log('🚀 Using Native UPI Module (Intent.createChooser)');
            await launchNativeUPI(finalUrl);
            return true;
          } catch (nativeError) {
            console.log('⚠️ Native module failed, falling back to IntentLauncher');
            console.error(nativeError);
          }
        }

        // Fallback to IntentLauncher
        await IntentLauncher.startActivityAsync(
          'android.intent.action.VIEW',
          {
            data: finalUrl,
            flags: 1,
          }
        );
        return true;
      } else {
        // SPECIFIC APP: Use Linking to hit the scheme directly
        await Linking.openURL(finalUrl);
        return true;
      }
    } else {
      // iOS
      const canOpen = await Linking.canOpenURL(finalUrl);
      if (canOpen) {
        await Linking.openURL(finalUrl);
        return true;
      }
      return false;
    }
  } catch (error) {
    console.error('PSP Launch Error:', error);
    return false;
  }
};

/**
 * Legacy compatibility wrapper
 */
export const launchPayment = async (params: LaunchPaymentParams): Promise<boolean> => {
  // Default to generic launcher if no app chosen
  return launchPSPPayment(params);
};

/**
 * Check if any UPI app is available (Generic check)
 */
export const isUPIAvailable = async (): Promise<boolean> => {
  try {
    return await Linking.canOpenURL('upi://pay');
  } catch (error) {
    return false;
  }
};
