import { Linking, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireNativeModule } from 'expo';
import * as IntentLauncher from 'expo-intent-launcher';

// Attempt to load the native module
let UpiIntent: any = null;
try {
    UpiIntent = requireNativeModule('UpiIntent');
} catch (e) {

}

export interface UPIAppInfo {
    id: string;
    name: string;
    scheme: string;
    packageName: string;
    icon?: string;
}

export const UPI_APPS: UPIAppInfo[] = [
    // Top 3 (Gen Z / Market Leaders)
    { id: 'phonepe', name: 'PhonePe', scheme: 'phonepe://', packageName: 'com.phonepe.app' },
    { id: 'gpay', name: 'Google Pay', scheme: 'tez://upi/pay', packageName: 'com.google.android.apps.nbu.paisa.user' },
    { id: 'paytm', name: 'Paytm', scheme: 'paytmmp://', packageName: 'net.one97.paytm' },

    // Rising Stars / Gen Z Favorites
    { id: 'navi', name: 'Navi', scheme: 'navi://', packageName: 'com.naviapp' },
    { id: 'cred', name: 'CRED', scheme: 'credpay://', packageName: 'com.dreamplug.androidapp' },
    { id: 'slice', name: 'Slice', scheme: 'slice://', packageName: 'indwin.c3.shareapp' },
    { id: 'jupiter', name: 'Jupiter', scheme: 'jupiter://', packageName: 'money.jupiter' },

    // Govt / NPCI
    { id: 'bhim', name: 'BHIM', scheme: 'bhim://pay', packageName: 'in.org.npci.upiapp' },

    // Major Banks (UPI & Mobile Banking Apps)
    { id: 'icici', name: 'iMobile (ICICI)', scheme: 'imobile://', packageName: 'com.csam.icici.bank.imobile' },
    { id: 'hdfc', name: 'HDFC Bank', scheme: 'hdfcbank://', packageName: 'com.snapwork.hdfc' },
    { id: 'axis', name: 'Axis Pay', scheme: 'axispay://', packageName: 'com.upi.axispay' },
    { id: 'sbi', name: 'SBI UPI', scheme: 'sbiupi://', packageName: 'com.sbi.upi' },
    { id: 'kotak', name: 'Kotak Bank', scheme: 'kotakpay://', packageName: 'com.olive.kotak.upi' },
    { id: 'amazon', name: 'Amazon Pay', scheme: 'amazonpay://', packageName: 'in.amazon.mShop.android.shopping' },
];

const PREFERRED_APP_KEY = 'preferred_upi_app';

/**
 * Show system UPI chooser for any other installed apps
 */
export async function launchUPIFallback(upiUrl: string = 'upi://pay'): Promise<boolean> {

    try {
        if (Platform.OS === 'android') {
            // Try our custom native module first (best: Intent.createChooser)
            if (UpiIntent && UpiIntent.launchUPI) {
                try {

                    await UpiIntent.launchUPI(upiUrl);

                    return true;
                } catch (e) {

                }
            }

            // Fallback to Expo IntentLauncher (Better than standard Linking for choosers)

            try {
                // Use a simpler approach for IntentLauncher to avoid flag issues
                await IntentLauncher.startActivityAsync(
                    'android.intent.action.VIEW',
                    {
                        data: upiUrl,
                    }
                );

                return true;
            } catch (intentErr) {
                console.error('Tier 2 failed:', intentErr);
            }
        }

        // Standard Linking fallback (iOS or Android if others fail)

        const canOpen = await Linking.canOpenURL(upiUrl);
        if (canOpen) {
            await Linking.openURL(upiUrl);

            return true;
        }

        // Total fallback to generic

        await Linking.openURL('upi://pay');
        return true;
    } catch (error) {
        console.error('Fallback chooser error:', error);
        Alert.alert('Error', 'No UPI apps could be opened. Please install a UPI app.');
        return false;
    }
}

/**
 * Open a UPI app by package name (like tapping app icon)
 * Returns true if successful, false if app not installed
 */
export async function openUPIApp(appId: string, url?: string): Promise<boolean> {
    // 1. Try to find in our hardcoded list for known schemes/names
    let app = UPI_APPS.find(a => a.id === appId);

    // 2. If not found, create a virtual app entry (treating appId as packageName)
    if (!app) {
        console.log(`ℹ️ App ${appId} not in hardcoded list, treating as packageName`);
        app = {
            id: appId,
            name: appId, // Use packageName as name if unknown
            scheme: 'upi://pay',
            packageName: appId
        };
    }

    try {
        // Debug: Check if native module is available



        // Use native module to launch by package (like tapping icon)
        if (Platform.OS === 'android' && UpiIntent && UpiIntent.launchAppByPackage) {
            try {

                await UpiIntent.launchAppByPackage(app.packageName);

                return true;
            } catch (error) {
                console.error(`Native package launch failed for ${app.name}:`, error);
                // Fall through to scheme fallback
            }
        }

        // Fallback to scheme for iOS or if native module unavailable

        const canOpen = await Linking.canOpenURL(app.scheme);
        if (canOpen) {
            await Linking.openURL(app.scheme);

            return true;
        } else {
            console.log(`Scheme not supported for ${app.name}: ${app.scheme}`);
            Alert.alert(
                'Launch Issue',
                `${app.name} could not be opened directly. Would you like to try the standard system picker instead?`,
                [
                    {
                        text: 'Try Picker',
                        onPress: () => launchUPIFallback()
                    },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
            return false;
        }
    } catch (error) {
        console.error(`Failed to open ${app.name} (Critical Error):`, error);
        launchUPIFallback(); // Auto-fallback on critical error
        return false;
    }
}

/**
 * Get the user's preferred UPI app
 */
export async function getPreferredUPIApp(): Promise<string | null> {
    try {
        return await AsyncStorage.getItem(PREFERRED_APP_KEY);
    } catch (error) {
        console.error('Failed to get preferred UPI app:', error);
        return null;
    }
}

/**
 * Set the user's preferred UPI app
 */
export async function setPreferredUPIApp(appId: string): Promise<void> {
    try {
        await AsyncStorage.setItem(PREFERRED_APP_KEY, appId);
        console.log(`Set preferred UPI app: ${appId}`);
    } catch (error) {
        console.error('Failed to set preferred UPI app:', error);
    }
}

/**
 * Check which UPI apps are installed (Unified & Reliable)
 */
export async function getInstalledUPIApps(): Promise<UPIAppInfo[]> {


    // TIER 1: Native System Discovery (Most Accurate - Requires EAS Build)

    if (UpiIntent) {

        try {
            // Log keys of the native module object to see exposed methods
            console.log('Keys:', Object.keys(UpiIntent));
            console.log('Has getUPIApps:', typeof UpiIntent.getUPIApps);
        } catch (e) {
            console.error('Error inspecting module:', e);
        }
    }

    if (Platform.OS === 'android' && UpiIntent && UpiIntent.getUPIApps) {
        try {

            const nativeApps = await UpiIntent.getUPIApps();


            const nativePackages = new Set(nativeApps.map((a: any) => a.packageName));

            // Filter our known apps list by what's actually on the phone
            // This prevents "Ghost Apps" from appearing
            const confirmedKnown = UPI_APPS.filter(app => nativePackages.has(app.packageName));

            // Also include any other UPI-capable apps found that we don't have in our list
            const others = nativeApps
                .filter((na: any) => !UPI_APPS.some(ka => ka.packageName === na.packageName))
                .map((na: any) => ({
                    id: na.packageName,
                    name: na.name,
                    scheme: 'upi://pay',
                    packageName: na.packageName
                }));

            return [...confirmedKnown, ...others];
        } catch (e) {
            console.error('Tier 1 Discovery Failed:', e);
        }
    }

    // TIER 2: Legacy Fallback (Used before EAS build is complete)

    const installed: UPIAppInfo[] = [];

    for (const app of UPI_APPS) {
        try {
            // NOTE: On Android 11+, this often returns false OR true mistakenly 
            // without the proper <queries> in AndroidManifest.xml
            const canOpen = await Linking.canOpenURL(app.scheme);
            if (canOpen) {
                installed.push(app);
            }
        } catch (error) {
            // Silently skip
        }
    }

    return installed;
}

/**
 * Open UPI app with smart fallback
 * If preferred app is set, opens it. Otherwise shows chooser.
 */
export async function openPreferredUPIApp(): Promise<boolean> {
    const preferredId = await getPreferredUPIApp();

    if (preferredId) {
        const success = await openUPIApp(preferredId);
        if (success) return true;
    }

    // No preferred app or it failed - get installed apps
    const installed = await getInstalledUPIApps();

    if (installed.length === 0) {
        Alert.alert(
            'No UPI Apps Found',
            'Please install a UPI app like Google Pay, PhonePe, or Paytm to make payments.'
        );
        return false;
    }

    if (installed.length === 1) {
        // Only one app installed - open it
        return await openUPIApp(installed[0].id);
    }

    // Multiple apps - user should choose (handled by UI)
    return false;
}

/**
 * Get ALL UPI apps installed on the device (Dynamic native query)
 * Now simply an alias for getInstalledUPIApps for consistency
 */
export async function getAllInstalledUPIApps(): Promise<UPIAppInfo[]> {
    return await getInstalledUPIApps();
}
