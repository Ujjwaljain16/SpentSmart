import { Ionicons } from '@expo/vector-icons';
import { AccountType } from '@spentsmart/finance/types';

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  bank: { label: 'Bank / UPI', icon: 'business-outline' },
  cash: { label: 'Cash', icon: 'cash-outline' },
  wallet: { label: 'Wallet', icon: 'wallet-outline' },
  credit: { label: 'Credit card', icon: 'card-outline' },
};
