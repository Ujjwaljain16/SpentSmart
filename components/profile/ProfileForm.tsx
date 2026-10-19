import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { sanitizeText } from '@/domain/upi/vpa';
import { useThemeColors } from '@/hooks/use-theme-colors';

export const AVATAR_OPTIONS = ['person', 'happy', 'star', 'heart', 'paw', 'leaf', 'rocket', 'shield', 'flash'] as const;

interface ProfileFormProps {
  initialName: string;
  initialAvatar: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (profile: { name: string; avatarId: string }) => Promise<void>;
}

/** Name + avatar form shared by onboarding and "Edit profile". */
export function ProfileForm({ initialName, initialAvatar, submitLabel, autoFocus, onSubmit }: ProfileFormProps) {
  const colors = useThemeColors();
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<string | null>(initialAvatar || null);
  const [submitting, setSubmitting] = useState(false);

  const cleaned = sanitizeText(name, 50);
  const valid = cleaned.length >= 2 && avatar !== null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Display name</Text>
      <TextInput
        accessibilityLabel="Display name"
        style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        placeholder="Your name"
        placeholderTextColor={colors.textSecondary}
        value={name}
        onChangeText={setName}
        autoFocus={autoFocus}
        maxLength={50}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Choose an avatar</Text>
      <View style={styles.grid}>
        {AVATAR_OPTIONS.map((id) => {
          const active = avatar === id;
          return (
            <TouchableOpacity
              key={id}
              accessibilityRole="radio"
              accessibilityLabel={`Avatar ${id}`}
              accessibilityState={{ selected: active }}
              style={[styles.avatar, { backgroundColor: colors.card, borderColor: active ? colors.tint : colors.border, borderWidth: active ? 3 : 1 }]}
              onPress={() => setAvatar(id)}
            >
              <Ionicons name={id} size={32} color={colors.text} />
            </TouchableOpacity>
          );
        })}
      </View>

      <Button
        label={submitLabel}
        disabled={!valid}
        loading={submitting}
        onPress={async () => {
          if (!valid || avatar === null) return;
          setSubmitting(true);
          try {
            await onSubmit({ name: cleaned, avatarId: avatar });
          } finally {
            setSubmitting(false);
          }
        }}
        style={styles.submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  label: { fontSize: FontSizes.md, fontWeight: '600' },
  input: { minHeight: MIN_TOUCH_TARGET, borderRadius: BorderRadius.md, borderWidth: 1, paddingHorizontal: Spacing.md, fontSize: FontSizes.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.md },
  avatar: { width: 70, height: 70, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  submit: { marginTop: Spacing.md },
});
