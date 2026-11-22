import { Colors, ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/contexts/theme-context';

/** Active colour tokens. */
export function useThemeColors(): ThemeColors & { isDark: boolean } {
  const scheme = useColorScheme();
  return { ...Colors[scheme], isDark: scheme === 'dark' };
}
