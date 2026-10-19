import React, { useCallback } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { useSecurity } from '@/contexts/security-context';
import { FormatOptions, Paise, formatPaise } from '@/domain/money';

const MASK = '•••••';

/** Formatter that honours Privacy Mode everywhere amounts are shown. */
export function useFormatMoney() {
  const { isPrivacyModeEnabled } = useSecurity();
  return useCallback(
    (paise: Paise, options?: FormatOptions & { sign?: '+' | '-' }) => {
      const prefix = options?.sign ?? '';
      if (isPrivacyModeEnabled) return `${prefix}${options?.symbol === false ? '' : '₹'}${MASK}`;
      return `${prefix}${formatPaise(paise, options)}`;
    },
    [isPrivacyModeEnabled],
  );
}

interface MoneyProps {
  paise: Paise;
  style?: StyleProp<TextStyle>;
  options?: FormatOptions & { sign?: '+' | '-' };
  numberOfLines?: number;
}

export function Money({ paise, style, options, numberOfLines }: MoneyProps) {
  const format = useFormatMoney();
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {format(paise, options)}
    </Text>
  );
}
