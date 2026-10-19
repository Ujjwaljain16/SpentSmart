import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { log } from '@/lib/logger';
import { useSettings } from './settings-context';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  colorScheme: ColorScheme;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useSystemColorScheme();
  const { settings, setSetting } = useSettings();

  const setThemeMode = useCallback(
    async (mode: ThemeMode) => {
      try {
        await setSetting('themeMode', mode);
      } catch (error) {
        log.warn('Could not save theme', error);
      }
    },
    [setSetting],
  );

  const value = useMemo<ThemeContextType>(
    () => ({
      themeMode: settings.themeMode,
      colorScheme: settings.themeMode === 'system' ? (system ?? 'dark') : settings.themeMode,
      setThemeMode,
    }),
    [settings.themeMode, system, setThemeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}

/** Resolved colour scheme; falls back to dark outside the provider (e.g. in error screens). */
export function useColorScheme(): ColorScheme {
  const context = useContext(ThemeContext);
  return context ? context.colorScheme : 'dark';
}
