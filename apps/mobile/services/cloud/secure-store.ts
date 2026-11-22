import * as SecureStore from 'expo-secure-store';
import { SecretStore } from './api-client';

/** Keystore-backed, this device only, never in backups. SecureStore keys allow only [A-Za-z0-9._-]. */
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureStore: SecretStore = {
  get: (k) => SecureStore.getItemAsync(safe(k)),
  set: (k, v) => SecureStore.setItemAsync(safe(k), v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  delete: (k) => SecureStore.deleteItemAsync(safe(k)),
};
