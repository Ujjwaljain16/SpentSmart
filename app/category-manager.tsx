import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BorderRadius, FontSizes, MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { useRepos } from '@/contexts/database-context';
import { CATEGORY_COLORS, CATEGORY_ICONS, isKnownIcon } from '@/domain/categories';
import { Category } from '@/domain/types';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { log } from '@/lib/logger';

const iconOf = (icon: string) => (isKnownIcon(icon) ? icon : 'pricetag') as keyof typeof Ionicons.glyphMap;

export default function CategoryManagerScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const repos = useRepos();
  const { categories } = useCategories();

  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState<string>('pricetag');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);

  const fail = (error: unknown, fallback: string) => {
    log.warn('Category operation failed', error);
    Alert.alert('Error', error instanceof Error && error.name === 'ValidationError' ? error.message : fallback);
  };

  const remove = (category: Category) => {
    Alert.alert('Delete category', `Delete “${category.label}”? Its transactions will move to “Other”.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => repos.categories.remove(category.key).then((ok) => !ok && Alert.alert('Error', 'This category can’t be deleted.')).catch((e) => fail(e, 'The category could not be deleted.')) },
    ]);
  };

  const add = async () => {
    try {
      await repos.categories.add({ label, icon, color });
      setShowAdd(false);
      setLabel('');
      setIcon('pricetag');
      setColor(CATEGORY_COLORS[0]);
    } catch (error) {
      fail(error, 'The category could not be added.');
    }
  };

  const reset = () => {
    Alert.alert('Reset categories', 'Restore the default categories? Custom categories are removed and their transactions move to “Other”.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => repos.categories.resetToDefaults().catch((e) => fail(e, 'Categories could not be reset.')) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <ScreenHeader
        title="Categories"
        bordered
        trailing={
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add category" onPress={() => setShowAdd(true)} style={styles.addButton}>
            <Ionicons name="add" size={26} color={colors.tint} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {categories.map((c, i) => (
            <View key={c.key}>
              <View style={styles.item}>
                <View style={[styles.icon, { backgroundColor: `${c.color}33` }]}>
                  <Ionicons name={iconOf(c.icon)} size={20} color={c.color} />
                </View>
                <Text style={[styles.itemLabel, { color: colors.text }]}>{c.label}</Text>
                {!c.isSystem ? (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${c.label}`} onPress={() => remove(c)} style={styles.delete}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.system, { color: colors.textSecondary }]}>built-in</Text>
                )}
              </View>
              {i < categories.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
            </View>
          ))}
        </View>
        <Button label="Reset to default categories" variant="secondary" onPress={reset} />
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => setShowAdd(false)} style={styles.sheetButton}>
                <Text style={{ color: colors.textSecondary, fontSize: FontSizes.md }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: colors.text }]} accessibilityRole="header">
                New category
              </Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add category" onPress={() => void add()} style={styles.sheetButton}>
                <Text style={{ color: colors.tint, fontSize: FontSizes.md, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                accessibilityLabel="Category name"
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. Shopping"
                placeholderTextColor={colors.textSecondary}
                maxLength={24}
                autoFocus
              />

              <View style={[styles.preview, { backgroundColor: color }]}>
                <Ionicons name={iconOf(icon)} size={20} color="#FFFFFF" />
                <Text style={styles.previewText}>{label || 'Category'}</Text>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Colour</Text>
              <View style={styles.grid}>
                {CATEGORY_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    accessibilityRole="radio"
                    accessibilityLabel={`Colour ${c}`}
                    accessibilityState={{ selected: color === c }}
                    style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchSelected]}
                    onPress={() => setColor(c)}
                  >
                    {color === c ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Icon</Text>
              <View style={styles.grid}>
                {CATEGORY_ICONS.map((name) => (
                  <TouchableOpacity
                    key={name}
                    accessibilityRole="radio"
                    accessibilityLabel={`Icon ${name}`}
                    accessibilityState={{ selected: icon === name }}
                    style={[styles.iconOption, { backgroundColor: icon === name ? color : colors.surface }]}
                    onPress={() => setIcon(name)}
                  >
                    <Ionicons name={iconOf(name)} size={20} color={icon === name ? '#FFFFFF' : colors.text} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  addButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, minHeight: 64, gap: Spacing.md },
  icon: { width: 44, height: 44, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center' },
  itemLabel: { flex: 1, fontSize: FontSizes.md, fontWeight: '500' },
  delete: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  system: { fontSize: FontSizes.xs },
  divider: { height: 1, marginLeft: Spacing.md + 44 + Spacing.md },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '88%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, borderBottomWidth: 1 },
  sheetButton: { minHeight: MIN_TOUCH_TARGET, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
  sheetTitle: { fontSize: FontSizes.lg, fontWeight: '600' },
  sheetBody: { padding: Spacing.lg, gap: Spacing.md },
  fieldLabel: { fontSize: FontSizes.sm, fontWeight: '500', marginTop: Spacing.sm },
  input: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, minHeight: 48, fontSize: FontSizes.md },
  preview: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'flex-start', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md },
  previewText: { color: '#FFFFFF', fontSize: FontSizes.sm, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  swatch: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  swatchSelected: { borderWidth: 3, borderColor: '#FFFFFF' },
  iconOption: { width: 44, height: 44, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center' },
});
