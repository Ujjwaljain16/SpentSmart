import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Money } from '@/components/ui/Money';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { isKnownIcon } from '@/domain/categories';
import { Transaction } from '@/domain/types';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface TransactionCardProps {
  transaction: Transaction;
  onDelete?: (id: string) => void;
  onEdit?: (transaction: Transaction) => void;
}

function TransactionCardComponent({ transaction, onDelete, onEdit }: TransactionCardProps) {
  const colors = useThemeColors();
  const { resolve } = useCategories();
  const category = resolve(transaction.categoryKey);
  const iconName = (isKnownIcon(category.icon) ? category.icon : 'pricetag') as keyof typeof Ionicons.glyphMap;
  const isIncome = transaction.type === 'income';
  const date = new Date(transaction.occurredAt);
  const title = transaction.note || category.label;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${isIncome ? 'Received from' : 'Paid to'} ${transaction.payeeName}, ${title}, ${format(date, 'd MMMM yyyy')}`}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${category.color}33` }]}>
        <Ionicons name={iconName} size={20} color={category.color} />
      </View>

      <View style={styles.details}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.payee, { color: colors.textSecondary }]} numberOfLines={1}>
          {transaction.payeeName}
        </Text>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {format(date, 'MMM d, yyyy')} • {format(date, 'h:mm a')}
        </Text>
      </View>

      <View style={styles.right}>
        <Money
          paise={transaction.amountPaise}
          options={{ sign: isIncome ? '+' : '-' }}
          style={[styles.amount, { color: isIncome ? colors.success : colors.text }]}
        />
        {(onEdit || onDelete) && (
          <View style={styles.actions}>
            {onEdit && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Edit transaction with ${transaction.payeeName}`}
                style={styles.actionButton}
                onPress={() => onEdit(transaction)}
              >
                <Ionicons name="pencil" size={18} color={colors.tint} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Delete transaction with ${transaction.payeeName}`}
                style={styles.actionButton}
                onPress={() => onDelete(transaction.id)}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export const TransactionCard = React.memo(TransactionCardComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  details: { flex: 1 },
  title: { fontSize: FontSizes.md, fontWeight: '600', marginBottom: 2 },
  payee: { fontSize: FontSizes.sm, marginBottom: 4 },
  date: { fontSize: FontSizes.xs },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: FontSizes.lg, fontWeight: '700', marginBottom: Spacing.xs },
  actions: { flexDirection: 'row' },
  actionButton: { padding: Spacing.sm, minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
