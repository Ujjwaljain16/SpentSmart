import { Ionicons } from '@expo/vector-icons';
import { openURL } from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { FieldLabel, FormCard, TextField } from '@/components/ui/form';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/settings-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { geminiKey, looksLikeGeminiKey, saveGeminiKey } from '@/services/assistant/gemini';
import { GEMINI_MODELS } from '@spentsmart/assistant/gemini';

const AI_STUDIO_KEYS = 'https://aistudio.google.com/apikey';
const GEMINI_TERMS = 'https://ai.google.dev/gemini-api/terms';

/**
 * Bring your own Gemini key. The key stays in this phone's Keystore and the phone talks to Google directly; this
 * screen is also where the user learns what a free key means for their data before turning anything on.
 */
export default function AssistantSettingsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings, setSetting } = useSettings();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void geminiKey.get().then((k) => setHasKey(!!k));
  }, []);

  const save = async () => {
    if (!looksLikeGeminiKey(draft)) {
      Alert.alert('That doesn’t look like a Gemini key', 'Keys from Google AI Studio start with “AIza”. Copy the whole key and try again.');
      return;
    }
    setBusy(true);
    try {
      await saveGeminiKey(draft, settings.geminiModel);
      setDraft('');
      setHasKey(true);
    } catch (e) {
      Alert.alert('Key not saved', e instanceof Error ? e.message : 'That key couldn’t be checked.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Remove your Gemini key?', 'The assistant stops working until you add a key again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void geminiKey.remove().then(() => setHasKey(false)) },
    ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Assistant" bordered />
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.warning }]}>
            <Ionicons name="information-circle-outline" size={20} color={colors.warning} />
            <View style={styles.flex}>
              <Text style={[styles.noticeTitle, { color: colors.text }]}>Before you add a key</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                The assistant uses your own Google Gemini key. Your phone talks to Google directly; SpentSmart’s servers aren’t involved.
              </Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                On a <Text style={styles.strong}>free</Text> key, Google may use what you send to improve its products, and people may review it. On a paid key, it
                doesn’t. So by default SpentSmart sends only figures (totals, categories, dates), never payee names or notes.
              </Text>
              <TouchableOpacity accessibilityRole="link" onPress={() => void openURL(GEMINI_TERMS)}>
                <Text style={[styles.link, { color: colors.tint }]}>Read Google’s Gemini API terms</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FormCard>
            <FieldLabel>Gemini API key</FieldLabel>
            {hasKey ? (
              <View style={styles.row}>
                <Ionicons name="key" size={18} color={colors.success} />
                <Text style={[styles.body, styles.flex, { color: colors.text }]}>A key is saved on this phone.</Text>
                <Button label="Remove" variant="ghost" onPress={remove} />
              </View>
            ) : (
              <>
                <TextField
                  accessibilityLabel="Gemini API key"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="AIza…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <Button label="Check and save" loading={busy} disabled={busy || !draft.trim()} onPress={() => void save()} />
                <TouchableOpacity accessibilityRole="link" onPress={() => void openURL(AI_STUDIO_KEYS)}>
                  <Text style={[styles.link, { color: colors.tint }]}>Get a free key in Google AI Studio</Text>
                </TouchableOpacity>
              </>
            )}
            <Text style={[styles.hint, { color: colors.textSecondary }]}>Stored in this phone’s Keystore. Never synced, backed up or sent to SpentSmart.</Text>
          </FormCard>

          <FormCard>
            <FieldLabel>Model</FieldLabel>
            {GEMINI_MODELS.map((m) => {
              const active = settings.geminiModel === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${m.label}. ${m.note}`}
                  style={[styles.model, { borderColor: active ? colors.tint : colors.border, backgroundColor: active ? colors.surface : 'transparent' }]}
                  onPress={() => void setSetting('geminiModel', m.id)}
                >
                  <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? colors.tint : colors.textSecondary} />
                  <View style={styles.flex}>
                    <Text style={[styles.modelName, { color: colors.text }]}>{m.label}</Text>
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>{m.note}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </FormCard>

          <FormCard>
            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityState={{ checked: settings.assistantShareDetails }}
              style={styles.row}
              onPress={() => void setSetting('assistantShareDetails', !settings.assistantShareDetails)}
            >
              <View style={styles.flex}>
                <Text style={[styles.modelName, { color: colors.text }]}>Share payee names and notes</Text>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Lets the assistant name shops and people. Best with a paid key. Off: it sees amounts, categories and dates only.
                </Text>
              </View>
              <Switch value={settings.assistantShareDetails} trackColor={{ true: colors.tint }} pointerEvents="none" />
            </TouchableOpacity>
          </FormCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md },
  notice: { flexDirection: 'row', gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md },
  noticeTitle: { fontSize: FontSizes.md, fontWeight: '700', marginBottom: Spacing.xs },
  body: { fontSize: FontSizes.sm, lineHeight: 21, marginBottom: Spacing.xs },
  strong: { fontWeight: '700' },
  link: { fontSize: FontSizes.sm, fontWeight: '600', paddingVertical: Spacing.xs },
  hint: { fontSize: FontSizes.xs, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: MIN_TOUCH_TARGET },
  model: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.sm, minHeight: MIN_TOUCH_TARGET },
  modelName: { fontSize: FontSizes.md, fontWeight: '600' },
});
