import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { Transaction, CategoryInfo } from '@/types/transaction';
import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { getCategories, AVAILABLE_ICONS } from '@/services/category-storage';
import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSecurity } from '@/contexts/security-context';

interface TransactionCardProps {
  transaction: Transaction;
  onDelete?: (id: string) => void;
  onEdit?: (transaction: Transaction) => void;
  showDeleteButton?: boolean;
  showEditButton?: boolean;
}

function TransactionCardComponent({
  transaction,
  onDelete,
  onEdit,
  showDeleteButton = true,
  showEditButton = true,
}: TransactionCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const { isPrivacyModeEnabled } = useSecurity();
  const [categoryInfo, setCategoryInfo] = useState<CategoryInfo>(
    DEFAULT_CATEGORIES[transaction.category] || DEFAULT_CATEGORIES.other
  );

  useEffect(() => {
    loadCategory();
  }, [transaction.category]);

  const loadCategory = async () => {
    try {
      const categories = await getCategories();
      const found = categories.find(c => c.key === transaction.category);
      if (found) {
        setCategoryInfo(found);
      }
    } catch (error) {
      // Use default category on error
    }
  };

  const getIconName = (icon: string): keyof typeof Ionicons.glyphMap => {
    if (AVAILABLE_ICONS.includes(icon)) {
      return icon as keyof typeof Ionicons.glyphMap;
    }
    return 'pricetag';
  };

  const formattedDate = format(new Date(transaction.timestamp), 'MMM d, yyyy');
  const formattedTime = format(new Date(transaction.timestamp), 'h:mm a');

  return (
    <View style={[styles.container, { backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)' }]}>
      {/* Category Icon */}
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: `${categoryInfo.color}40` },
        ]}
      >
        <Ionicons
          name={getIconName(categoryInfo.icon)}
          size={20}
          color={categoryInfo.color}
        />
      </View>

      {/* Transaction Details */}
      <View style={styles.details}>
        <Text style={[styles.reason, { color: '#FFF' }]} numberOfLines={1}>
          {transaction.reason || transaction.category}
        </Text>
        <Text
          style={[styles.payee, { color: 'rgba(255, 255, 255, 0.7)' }]}
          numberOfLines={1}
        >
          {transaction.payeeName}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.date, { color: 'rgba(255, 255, 255, 0.6)' }]}>
            {formattedDate} • {formattedTime}
          </Text>
        </View>
      </View>

      {/* Amount & Delete */}
      <View style={styles.rightSection}>
        <Text style={[
          styles.amount,
          { color: transaction.type === 'income' ? '#10B981' : '#FFF' }
        ]}>
          {transaction.type === 'income' ? '+' : '-'}
          {isPrivacyModeEnabled ? '•••••' : `₹${transaction.amount.toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })}`}
        </Text>
        <View style={styles.actionButtons}>
          {showEditButton && onEdit && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => onEdit(transaction)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="pencil" size={18} color={colors.tint} />
            </TouchableOpacity>
          )}
          {showDeleteButton && onDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => onDelete(transaction.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
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
  details: {
    flex: 1,
  },
  reason: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  payee: {
    fontSize: FontSizes.sm,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: FontSizes.xs,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  editButton: {
    padding: Spacing.xs,
  },
  deleteButton: {
    padding: Spacing.xs,
  },
});
