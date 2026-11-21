import type Anthropic from '@anthropic-ai/sdk';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useFormatMoney } from '@/components/ui/Money';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useCloud } from '@/contexts/cloud-context';
import { useRepos } from '@/contexts/database-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';
import { routes } from '@/lib/routes';
import { applyProposal, repositoryLedger } from '@/services/assistant/ledger';
import { converse } from '@spentsmart/assistant/loop';
import { firstUserMessage } from '@spentsmart/assistant/prompt';
import { Proposal } from '@spentsmart/assistant/tools';
import { StatedAmount } from '@spentsmart/assistant/traceability';

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  untraced?: StatedAmount[];
  proposals?: { proposal: Proposal; state: 'pending' | 'saved' | 'dismissed' }[];
}

const SUGGESTIONS = ['How much did I spend this month?', 'Am I within budget?', 'Can I afford a ₹3,000 dinner?', 'What subscriptions do I pay for?'];

/**
 * Ask about your own money. The model never sees the database: it asks for a tool, this phone runs it and sends back
 * only the result. Amounts it states that no tool returned are flagged, and changes wait for a tap to confirm.
 */
export default function AssistantScreen() {
  const colors = useThemeColors();
  const repos = useRepos();
  const money = useFormatMoney();
  const { resolve } = useCategories();
  const { client, status } = useCloud();
  const ledger = useMemo(() => repositoryLedger(repos), [repos]);
  const history = useRef<Anthropic.Beta.BetaMessageParam[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);

  const signedIn = status !== null && status.state !== 'signed-out';

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || thinking) return;
    setText('');
    const userBubble: Bubble = { id: `u${Date.now()}`, role: 'user', text: q };
    setBubbles((b) => [...b, userBubble]);
    setThinking(true);
    try {
      const now = new Date();
      const content = history.current.length === 0 ? firstUserMessage(q, now) : q;
      const result = await converse({
        transport: { turn: (messages) => client.assistantTurn(messages) },
        ledger,
        now: now.getTime(),
        messages: [...history.current, { role: 'user', content }],
      });
      history.current = result.messages;
      setBubbles((b) => [
        ...b,
        {
          id: `a${Date.now()}`,
          role: 'assistant',
          text: result.reply || 'I don’t have an answer for that.',
          untraced: result.untraced,
          proposals: result.proposals.map((proposal) => ({ proposal, state: 'pending' as const })),
        },
      ]);
    } catch (e) {
      log.warn('Assistant failed', e);
      setBubbles((b) => [...b, { id: `e${Date.now()}`, role: 'assistant', text: e instanceof Error ? e.message : 'The assistant isn’t available right now.' }]);
    } finally {
      setThinking(false);
    }
  };

  const decide = async (bubbleId: string, index: number, accept: boolean) => {
    const bubble = bubbles.find((b) => b.id === bubbleId);
    const p = bubble?.proposals?.[index];
    if (!p || p.state !== 'pending') return;
    try {
      if (accept) await applyProposal(repos, p.proposal);
      setBubbles((all) =>
        all.map((b) => (b.id === bubbleId ? { ...b, proposals: b.proposals!.map((x, i) => (i === index ? { ...x, state: accept ? 'saved' : 'dismissed' } : x)) } : b)),
      );
    } catch (e) {
      Alert.alert('Not saved', e instanceof Error ? e.message : 'That couldn’t be saved.');
    }
  };

  const describe = (p: Proposal) =>
    p.kind === 'transaction'
      ? `${p.type === 'income' ? 'Income' : p.type === 'refund' ? 'Refund' : 'Expense'}: ${money(p.amountPaise)} · ${p.payeeName} · ${resolve(p.categoryKey).label} · ${new Date(p.occurredAt).toLocaleDateString('en-IN')}`
      : `Goal: ${p.name} · ${money(p.targetPaise)}${p.deadline ? ` by ${new Date(p.deadline).toLocaleDateString('en-IN')}` : ''}`;

  if (!signedIn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Ask SpentSmart" />
        <View style={styles.empty}>
          <Text style={[styles.body, { color: colors.textSecondary }]}>The assistant runs through your SpentSmart account. Sign in under Sync & backup first.</Text>
          <Button label="Open Sync & backup" onPress={() => router.replace(routes.sync)} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Ask SpentSmart" />
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <FlatList
          data={bubbles}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.suggestions}>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Answers come from your own data, worked out on this phone. Only the numbers needed for an answer are sent to the model, never your full history.
              </Text>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity key={s} accessibilityRole="button" style={[styles.suggestion, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => void ask(s)}>
                  <Text style={{ color: colors.text, fontSize: FontSizes.sm }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? [styles.mine, { backgroundColor: colors.tint }] : [styles.theirs, { backgroundColor: colors.card, borderColor: colors.border }]]}>
              <Text style={{ color: item.role === 'user' ? colors.onTint : colors.text, fontSize: FontSizes.md, lineHeight: 22 }}>{item.text}</Text>
              {item.untraced && item.untraced.length > 0 ? (
                <View style={styles.warn}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                  <Text style={[styles.hint, { color: colors.warning }]}>Couldn’t check {item.untraced.map((u) => u.text).join(', ')} against your data.</Text>
                </View>
              ) : null}
              {item.proposals?.map((p, i) => (
                <View key={i} style={[styles.proposal, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text style={[styles.hint, { color: colors.text }]}>{describe(p.proposal)}</Text>
                  {p.state === 'pending' ? (
                    <View style={styles.row}>
                      <Button style={styles.flex} label="Save" onPress={() => void decide(item.id, i, true)} />
                      <Button style={styles.flex} label="Don’t save" variant="ghost" onPress={() => void decide(item.id, i, false)} />
                    </View>
                  ) : (
                    <Text style={[styles.hint, { color: p.state === 'saved' ? colors.success : colors.textSecondary }]}>{p.state === 'saved' ? 'Saved' : 'Not saved'}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
          ListFooterComponent={thinking ? <ActivityIndicator style={styles.thinking} color={colors.tint} /> : null}
        />
        <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TextInput
            accessibilityLabel="Ask a question"
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
            value={text}
            onChangeText={setText}
            placeholder="Ask about your money…"
            placeholderTextColor={colors.textSecondary}
            onSubmitEditing={() => void ask(text)}
            returnKeyType="send"
            maxLength={400}
          />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || thinking} style={[styles.send, { backgroundColor: colors.tint, opacity: !text.trim() || thinking ? 0.5 : 1 }]} onPress={() => void ask(text)}>
            <Ionicons name="arrow-up" size={22} color={colors.onTint} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  empty: { padding: Spacing.lg, gap: Spacing.md },
  list: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },
  suggestions: { gap: Spacing.sm, paddingTop: Spacing.md },
  suggestion: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: BorderRadius.lg, padding: Spacing.md, gap: Spacing.sm },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start', borderWidth: 1 },
  body: { fontSize: FontSizes.sm, lineHeight: 21 },
  hint: { fontSize: FontSizes.xs, lineHeight: 18, flexShrink: 1 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  proposal: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.sm, gap: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.sm },
  thinking: { marginVertical: Spacing.md },
  composer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, fontSize: FontSizes.md },
  send: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: MIN_TOUCH_TARGET / 2, alignItems: 'center', justifyContent: 'center' },
});
