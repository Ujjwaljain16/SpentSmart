import { Platform } from 'react-native';
import type { UpiIntentNativeModule } from './src/UpiIntent.types';

export type { InstalledUpiApp, PayWithUpiResult, UpiIntentNativeModule } from './src/UpiIntent.types';

/**
 * The native module, or `null` when it is unavailable (non-Android platforms, Expo Go, or a build made
 * without it). Callers must handle `null` and fall back to plain Linking.
 */
export function loadUpiIntent(): UpiIntentNativeModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    // Required lazily so that merely importing this file never throws where the module is missing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo') as typeof import('expo');
    return requireNativeModule<UpiIntentNativeModule>('UpiIntent');
  } catch {
    return null;
  }
}
