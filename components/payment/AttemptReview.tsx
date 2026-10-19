import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { PaymentAttempt } from '@/db/repositories/attempts';
import { Paise, formatPaise, paiseToDecimal, parseRupees } from '@/domain/money';
import { parseUpiResponse } from '@/domain/upi/response';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface AttemptReviewProps {
  attempt: PaymentAttempt;
  busy?: boolean;
  onRecord: (amountPaise: Paise) => void;
  onDiscard: () => void;
  onSnooze: () => void;
  /** Offered when the UPI app reported a failure: some apps refuse pre-filled amounts to personal accounts. */
  onRetryWithoutAmount?: () => void;
  /** Offered after a failure: pay the same payee by importing a QR from the gallery instead. */
  onPayViaQr?: () => void;
}

/**
 * "Did this payment go through?" — the single place where a payment attempt becomes a record.
 * The UPI app's answer pre-selects the likely choice; the user always has the final say.
 */
export function AttemptReview({ attempt, busy, onRecord, onDiscard, onSnooze, onRetryWithoutAmount, onPayViaQr }: AttemptReviewProps) {
  const colors = useThemeColors();
  const [amountText, setAmountText] = useState(attempt.amountPaise ? paiseToDecimal(attempt.amountPaise) : '');
  const amount = parseRupees(amountText);
  const response = parseUpiResponse(attempt.response);

  const verdict = (() => {
    switch (attempt.suggestion) {
      case 'paid':
        return { icon: 'checkmark-circle', color: colors.success, title: 'Your UPI app reports success', hint: 'Record it to add it to your expenses.' } as const;
      case 'not_paid':
        return {
          icon: 'close-circle',
          color: colors.error,
          title: response.outcome === 'cancelled' ? 'The payment was cancelled' : 'Your UPI app reports it did not go through',
          hint: 'If you did pay, you can still record it.',
        } as const;
      default:
        return { icon: 'help-circle', color: colors.warning, title: 'Did this payment go through?', hint: 'Your UPI app did not say. Check its history if unsure.' } as const;
    }
  })();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.verdictRow}>
        <Ionicons name={verdict.icon} size={32} color={verdict.color} />
        <View style={styles.verdictText}>
          <Text style={[styles.verdictTitle, { color: colors.text }]} accessibilityRole="header">
            {verdict.title}
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{verdict.hint}</Text>
        </View>
      </View>

      <View style={[styles.details, { backgroundColor: colors.surface }]}>
        <Text style={[styles.payee, { color: colors.text }]}>{attempt.payeeName}</Text>
        <Text style={[styles.vpa, { color: colors.textSecondary }]}>{attempt.vpa}</Text>
        {attempt.note ? <Text style={[styles.note, { color: colors.textSecondary }]}>“{attempt.note}”</Text> : null}
        {response.txnId ? <Text style={[styles.vpa, { color: colors.textSecondary }]}>Transaction ID: {response.txnId}</Text> : null}
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Amount paid (₹)</Text>
      <TextInput
        accessibilityLabel="Amount paid in rupees"
        style={[styles.amountInput, { color: colors.text, borderColor: amount === null && amountText ? colors.error : colors.border, backgroundColor: colors.surface }]}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
        editable={!busy}
      />
      {amount === null && amountText !== '' ? (
        <Text style={[styles.error, { color: colors.error }]}>Enter an amount like 250 or 250.50</Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={amount ? `Record ${formatPaise(amount)}` : 'Record payment'}
          accessibilityLabel="Record this payment as an expense"
          variant={attempt.suggestion === 'not_paid' ? 'secondary' : 'primary'}
          disabled={busy || amount === null}
          loading={busy}
          onPress={() => amount !== null && onRecord(amount)}
        />
        <Button
          label="It didn't go through"
          accessibilityLabel="Discard, this payment did not go through"
          variant={attempt.suggestion === 'not_paid' ? 'primary' : 'secondary'}
          disabled={busy}
          onPress={onDiscard}
        />
        {onRetryWithoutAmount && attempt.suggestion === 'not_paid' ? (
          <Button
            label="Retry without amount"
            accessibilityLabel="Retry the payment without a pre-filled amount"
            variant="secondary"
            disabled={busy}
            onPress={onRetryWithoutAmount}
          />
        ) : null}
        {onPayViaQr && attempt.suggestion === 'not_paid' ? (
          <Button
            label="Pay with QR from gallery"
            accessibilityLabel="Pay this payee by importing a QR code from your gallery"
            variant="secondary"
            disabled={busy}
            onPress={onPayViaQr}
          />
        ) : null}
        <Button label="Decide later" variant="ghost" disabled={busy} onPress={onSnooze} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  verdictText: { flex: 1 },
  verdictTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  hint: { fontSize: FontSizes.sm, marginTop: 2 },
  details: { borderRadius: BorderRadius.md, padding: Spacing.md, gap: 2 },
  payee: { fontSize: FontSizes.md, fontWeight: '700' },
  vpa: { fontSize: FontSizes.sm },
  note: { fontSize: FontSizes.sm, fontStyle: 'italic' },
  label: { fontSize: FontSizes.sm, marginTop: Spacing.sm },
  amountInput: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, minHeight: 48, fontSize: FontSizes.xl, fontWeight: '700' },
  error: { fontSize: FontSizes.xs },
  actions: { gap: Spacing.sm, marginTop: Spacing.md },
});
