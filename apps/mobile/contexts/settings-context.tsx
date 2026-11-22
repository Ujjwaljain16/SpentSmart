import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { SETTINGS_DEFAULTS, SettingKey, SettingsShape } from '@/db/repositories/settings';
import { log } from '@/lib/logger';
import { useRepos } from './database-context';

interface SettingsContextType {
  settings: SettingsShape;
  setSetting: <K extends SettingKey>(key: K, value: SettingsShape[K]) => Promise<void>;
  /** Re-read everything from the database (used after "Delete all data"). */
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

/** Loads all settings once, before children render, so there is no "default then real" flash. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const repos = useRepos();
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const latest = useRef<SettingsShape>(SETTINGS_DEFAULTS);

  const reload = useCallback(async () => {
    const loaded = await repos.settings.loadAll();
    latest.current = loaded;
    setSettings(loaded);
  }, [repos]);

  useEffect(() => {
    reload().catch((error) => {
      log.error('Failed to load settings', error);
      setSettings(SETTINGS_DEFAULTS);
    });
  }, [reload]);

  const setSetting = useCallback(
    async <K extends SettingKey>(key: K, value: SettingsShape[K]) => {
      const previous = latest.current;
      const next = { ...previous, [key]: value };
      latest.current = next;
      setSettings(next); // optimistic
      try {
        await repos.settings.set(key, value);
      } catch (error) {
        log.error(`Failed to save setting ${key}`, error);
        latest.current = previous;
        setSettings(previous);
        throw error;
      }
    },
    [repos],
  );

  const value = useMemo(() => (settings ? { settings, setSetting, reload } : null), [settings, setSetting, reload]);
  if (!value) return <View style={{ flex: 1, backgroundColor: '#0F0F0F' }} />;
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextType {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
