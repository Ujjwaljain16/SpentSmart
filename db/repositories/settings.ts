import { SqlExecutor } from '../driver';
import { RepoDeps } from './deps';

/** Every persisted setting, with its type and default. */
export interface SettingsShape {
  onboardingComplete: boolean;
  profileName: string;
  avatarId: string;
  themeMode: 'light' | 'dark' | 'system';
  bioLockEnabled: boolean;
  /** Seconds the app may stay in the background before it locks (0 = lock immediately). */
  lockTimeoutSeconds: number;
  privacyModeEnabled: boolean;
  remindersEnabled: boolean;
  /** Monthly budget in paise; 0 means "no budget". */
  budgetPaise: number;
  /** Package name of the last UPI app used. */
  preferredUpiApp: string;
  /** The user's own UPI ID (for receiving). */
  myVpa: string;
  myPayName: string;
}

export const SETTINGS_DEFAULTS: SettingsShape = {
  onboardingComplete: false,
  profileName: '',
  avatarId: 'person',
  themeMode: 'system',
  bioLockEnabled: false,
  lockTimeoutSeconds: 120,
  privacyModeEnabled: false,
  remindersEnabled: false,
  budgetPaise: 0,
  preferredUpiApp: '',
  myVpa: '',
  myPayName: '',
};

export type SettingKey = keyof SettingsShape;

function decode<K extends SettingKey>(key: K, raw: string | undefined): SettingsShape[K] {
  const fallback = SETTINGS_DEFAULTS[key];
  if (raw === undefined) return fallback;
  switch (typeof fallback) {
    case 'boolean':
      return (raw === 'true') as SettingsShape[K];
    case 'number': {
      const n = Number(raw);
      return (Number.isFinite(n) ? n : fallback) as SettingsShape[K];
    }
    default:
      if (key === 'themeMode') {
        return (raw === 'light' || raw === 'dark' || raw === 'system' ? raw : fallback) as SettingsShape[K];
      }
      return raw as SettingsShape[K];
  }
}

export function createSettingsRepo(db: SqlExecutor, deps: RepoDeps) {
  return {
    async loadAll(): Promise<SettingsShape> {
      const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
      const map = new Map(rows.map((r) => [r.key, r.value]));
      const out = { ...SETTINGS_DEFAULTS } as Record<string, unknown>;
      for (const key of Object.keys(SETTINGS_DEFAULTS) as SettingKey[]) {
        out[key] = decode(key, map.get(key));
      }
      return out as unknown as SettingsShape;
    },

    async set<K extends SettingKey>(key: K, value: SettingsShape[K]): Promise<void> {
      await db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, String(value)],
      );
      deps.notify();
    },

    async removeAll(): Promise<void> {
      await db.run('DELETE FROM settings');
      deps.notify();
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
