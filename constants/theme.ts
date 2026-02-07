/**
 * UPI Tracker Theme Configuration
 * Dark mode optimized with teal accent colors
 */

import { Platform } from 'react-native';

// Primary accent color - Teal
const tintColorLight = '#0D9488';
const tintColorDark = '#14B8A6';

export const Colors = {
  light: {
    text: '#2C2C2C', // Deep near-black with soft warmth
    textSecondary: '#6B6B6B', // Muted secondary text
    background: '#F8F6E3', // Warm cream
    surface: '#F5F3E0', // Slightly darker cream for surfaces
    card: '#FCFAF5', // Light cream for cards
    tint: 'rgb(34, 151, 153)', // Calm teal accent
    icon: '#6B6B6B', // Muted icons
    tabIconDefault: '#9A9A9A', // Subtle inactive tab icons
    tabIconSelected: 'rgb(34, 151, 153)', // Teal for active tabs
    border: '#E8E6D8', // Barely visible, warm borders
    success: '#4A9B8E', // Muted teal-green
    error: '#D67B7B', // Soft muted red
    warning: '#D4A574', // Warm muted orange
  },
  dark: {
    text: '#F5F2E7', // Warm off-white
    textSecondary: '#A8A5A0', // Warm gray
    background: '#1A1916', // Warm charcoal (not pure black)
    surface: '#242320', // Warm dark surface
    card: '#2D2B27', // Warm dark card
    tint: '#2DD4BF', // Brighter teal for dark mode visibility
    icon: '#A8A5A0', // Warm gray icons
    tabIconDefault: '#6B6965', // Muted warm gray
    tabIconSelected: '#2DD4BF', // Teal active
    border: '#3D3A35', // Warm border
    success: '#34D399', // Bright teal-green
    error: '#F87171', // Warm coral red
    warning: '#FBBF24', // Warm amber
  },
};

// Category colors for consistent use across the app
export const CategoryColors = {
  food: '#F59E0B',
  utility: '#3B82F6',
  college: '#8B5CF6',
  rent: '#EC4899',
  other: '#6B7280',
};

// Chart colors matching category theme
export const ChartColors = [
  CategoryColors.food,
  CategoryColors.utility,
  CategoryColors.college,
  CategoryColors.rent,
  CategoryColors.other,
];

// Spacing scale
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Border radius scale
export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// Font sizes
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

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// Shadow styles for cards
export const Shadows = {
  light: {
    card: {
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
      elevation: 2,
    },
  },
  dark: {
    card: {
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
      elevation: 4,
    },
  },
};
