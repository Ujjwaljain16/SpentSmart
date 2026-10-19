import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { log } from '@/lib/logger';
import { useSettings } from './settings-context';

export type EnableLockResult = { ok: true } | { ok: false; reason: 'no_hardware' | 'not_enrolled' | 'auth_failed' };

interface SecurityContextType {
  isBioLockEnabled: boolean;
  isPrivacyModeEnabled: boolean;
  isUnlocked: boolean;
  lockTimeoutSeconds: number;
  /** Device can authenticate (biometrics or screen lock). */
  canUseLock: boolean;
  setBioLockEnabled: (enabled: boolean) => Promise<EnableLockResult>;
  setPrivacyModeEnabled: (enabled: boolean) => Promise<void>;
  setLockTimeoutSeconds: (seconds: number) => Promise<void>;
  authenticate: () => Promise<boolean>;
  /** Ask the device owner to confirm a sensitive action. Always true when no app lock is configured. */
  verifyOwner: (message: string) => Promise<boolean>;
  lockApp: () => void;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);
const CAPTURE_KEY = 'spentsmart-lock';

async function deviceLevel(): Promise<LocalAuthentication.SecurityLevel> {
  try {
    return await LocalAuthentication.getEnrolledLevelAsync();
  } catch {
    return LocalAuthentication.SecurityLevel.NONE;
  }
}

async function promptForAuth(message: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
    fallbackLabel: 'Use device passcode',
  });
  return result.success;
}

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings, setSetting } = useSettings();
  const { bioLockEnabled, privacyModeEnabled, lockTimeoutSeconds } = settings;

  // Settings are loaded before this provider renders, so the very first frame is already locked when it should be.
  const [isUnlocked, setIsUnlocked] = useState(() => !bioLockEnabled);
  const [canUseLock, setCanUseLock] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);

  useEffect(() => {
    let alive = true;
    deviceLevel().then((level) => alive && setCanUseLock(level !== LocalAuthentication.SecurityLevel.NONE));
    return () => {
      alive = false;
    };
  }, []);

  // Lock after the configured time in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (bioLockEnabled && since !== null && Date.now() - since >= lockTimeoutSeconds * 1000) {
          setIsUnlocked(false);
        }
      }
    });
    return () => subscription.remove();
  }, [bioLockEnabled, lockTimeoutSeconds]);

  // While the lock is on, hide the app in the recents screen and block screenshots/recordings.
  useEffect(() => {
    if (bioLockEnabled) {
      ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY).catch((e) => log.warn('preventScreenCapture failed', e));
    } else {
      ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY).catch(() => undefined);
    }
  }, [bioLockEnabled]);

  const authenticate = useCallback(async () => {
    if (!bioLockEnabled) {
      setIsUnlocked(true);
      return true;
    }
    if (prompting.current) return false;
    prompting.current = true;
    try {
      // If the user later removed every screen lock from the device, the lock can no longer be enforced and
      // must not lock them out of their own data.
      if ((await deviceLevel()) === LocalAuthentication.SecurityLevel.NONE) {
        log.warn('Device has no screen lock; disabling app lock');
        await setSetting('bioLockEnabled', false);
        setIsUnlocked(true);
        return true;
      }
      const ok = await promptForAuth('Unlock SpentSmart');
      if (ok) setIsUnlocked(true);
      return ok;
    } catch (error) {
      log.warn('Authentication error', error);
      return false;
    } finally {
      prompting.current = false;
    }
  }, [bioLockEnabled, setSetting]);

  const setBioLockEnabled = useCallback(
    async (enabled: boolean): Promise<EnableLockResult> => {
      if (enabled) {
        if (!(await LocalAuthentication.hasHardwareAsync())) return { ok: false, reason: 'no_hardware' };
        if ((await deviceLevel()) === LocalAuthentication.SecurityLevel.NONE) return { ok: false, reason: 'not_enrolled' };
      }
      // Changing the lock always requires proving it works / being the owner.
      if (!(await promptForAuth(enabled ? 'Confirm to turn on app lock' : 'Confirm to turn off app lock'))) {
        return { ok: false, reason: 'auth_failed' };
      }
      await setSetting('bioLockEnabled', enabled);
      return { ok: true };
    },
    [setSetting],
  );

  const verifyOwner = useCallback(
    async (message: string) => {
      if (!bioLockEnabled) return true;
      try {
        return await promptForAuth(message);
      } catch (error) {
        log.warn('Owner verification failed', error);
        return false;
      }
    },
    [bioLockEnabled],
  );
  const setPrivacyModeEnabled = useCallback((enabled: boolean) => setSetting('privacyModeEnabled', enabled), [setSetting]);
  const setLockTimeoutSeconds = useCallback((seconds: number) => setSetting('lockTimeoutSeconds', seconds), [setSetting]);
  const lockApp = useCallback(() => {
    if (bioLockEnabled) setIsUnlocked(false);
  }, [bioLockEnabled]);

  const value = useMemo<SecurityContextType>(
    () => ({
      isBioLockEnabled: bioLockEnabled,
      isPrivacyModeEnabled: privacyModeEnabled,
      isUnlocked,
      lockTimeoutSeconds,
      canUseLock,
      setBioLockEnabled,
      setPrivacyModeEnabled,
      setLockTimeoutSeconds,
      authenticate,
      verifyOwner,
      lockApp,
    }),
    [
      bioLockEnabled,
      privacyModeEnabled,
      isUnlocked,
      lockTimeoutSeconds,
      canUseLock,
      setBioLockEnabled,
      setPrivacyModeEnabled,
      setLockTimeoutSeconds,
      authenticate,
      verifyOwner,
      lockApp,
    ],
  );

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
};

export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext);
  if (context === undefined) throw new Error('useSecurity must be used within a SecurityProvider');
  return context;
};
