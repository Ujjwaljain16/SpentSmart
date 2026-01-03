import React, { createContext, useContext, useState, useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIO_LOCK_KEY = '@upitracker_bio_lock';
const PRIVACY_MODE_KEY = '@upitracker_privacy_mode';

interface SecurityContextType {
    isBioLockEnabled: boolean;
    isPrivacyModeEnabled: boolean;
    isUnlocked: boolean;
    setBioLockEnabled: (enabled: boolean) => Promise<void>;
    setPrivacyModeEnabled: (enabled: boolean) => Promise<void>;
    authenticate: () => Promise<boolean>;
    lockApp: () => void;
    hasHardware: boolean;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isBioLockEnabled, setIsBioLockEnabled] = useState(false);
    const [isPrivacyModeEnabled, setIsPrivacyModeEnabled] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(true);
    const [hasHardware, setHasHardware] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            const bio = await AsyncStorage.getItem(BIO_LOCK_KEY);
            const privacy = await AsyncStorage.getItem(PRIVACY_MODE_KEY);

            const bioEnabled = bio === 'true';
            setIsBioLockEnabled(bioEnabled);
            setIsPrivacyModeEnabled(privacy === 'true');

            // If bio lock is enabled, start locked
            if (bioEnabled) {
                setIsUnlocked(false);
            }

            const compatible = await LocalAuthentication.hasHardwareAsync();
            setHasHardware(compatible);
        };

        loadSettings();
    }, []);

    const setBioLockEnabled = async (enabled: boolean) => {
        await AsyncStorage.setItem(BIO_LOCK_KEY, String(enabled));
        setIsBioLockEnabled(enabled);
    };

    const setPrivacyModeEnabled = async (enabled: boolean) => {
        await AsyncStorage.setItem(PRIVACY_MODE_KEY, String(enabled));
        setIsPrivacyModeEnabled(enabled);
    };

    const authenticate = async () => {
        if (!isBioLockEnabled) {
            setIsUnlocked(true);
            return true;
        }

        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock ExpenseTracker',
            fallbackLabel: 'Enter Passcode',
        });

        if (result.success) {
            setIsUnlocked(true);
            return true;
        }
        return false;
    };

    const lockApp = () => {
        if (isBioLockEnabled) {
            setIsUnlocked(false);
        }
    };

    return (
        <SecurityContext.Provider
            value={{
                isBioLockEnabled,
                isPrivacyModeEnabled,
                isUnlocked,
                setBioLockEnabled,
                setPrivacyModeEnabled,
                authenticate,
                lockApp,
                hasHardware,
            }}
        >
            {children}
        </SecurityContext.Provider>
    );
};

export const useSecurity = () => {
    const context = useContext(SecurityContext);
    if (context === undefined) {
        throw new Error('useSecurity must be used within a SecurityProvider');
    }
    return context;
};
