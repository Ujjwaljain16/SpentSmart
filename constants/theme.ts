/**
 * Design tokens. Screens must use these instead of literal colours so light/dark and future re-theming
 * stay consistent.
 */

export const Colors = {
  light: {
    text: '#2C2C2C',
    textSecondary: '#6B6B6B',
    background: '#F8F6E3',
    surface: '#F5F3E0',
    card: '#FCFAF5',
    tint: '#1F8A8C',
    onTint: '#FFFFFF',
    icon: '#6B6B6B',
    tabIconDefault: '#9A9A9A',
    tabIconSelected: '#1F8A8C',
    border: '#E8E6D8',
    success: '#2F7F73',
    error: '#C65A5A',
    warning: '#B7791F',
    scrim: 'rgba(0, 0, 0, 0.35)',
  },
  dark: {
    text: '#F5F2E7',
    textSecondary: '#A8A5A0',
    background: '#1A1916',
    surface: '#242320',
    card: '#2D2B27',
    tint: '#2DD4BF',
    onTint: '#0F1F1D',
    icon: '#A8A5A0',
    tabIconDefault: '#6B6965',
    tabIconSelected: '#2DD4BF',
    border: '#3D3A35',
    success: '#34D399',
    error: '#F87171',
    warning: '#FBBF24',
    scrim: 'rgba(0, 0, 0, 0.55)',
  },
};

export type ThemeColors = typeof Colors.light;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 48,
};

/** Minimum touch target recommended by Android accessibility guidelines (dp). */
export const MIN_TOUCH_TARGET = 48;
