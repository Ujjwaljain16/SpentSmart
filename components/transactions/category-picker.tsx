import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useCategories } from '@/contexts/categories-context';
import { isKnownIcon } from '@/domain/categories';
import { Category } from '@/domain/types';
import { useThemeColors } from '@/hooks/use-theme-colors';

interface CategoryPickerProps {
  selectedCategory: string | null;
  onSelectCategory: (key: string) => void;
  /** 'chips': horizontal scroller. 'dropdown': compact select. 'list': wrapped buttons. */
  mode?: 'chips' | 'dropdown' | 'list';
  /** Replace the category list (e.g. to prepend an "All categories" entry). */
  categories?: readonly Category[];
  /** Hide categories that make no sense for the current context. */
  exclude?: readonly string[];
}

const iconOf = (icon: string) => (isKnownIcon(icon) ? icon : 'pricetag') as keyof typeof Ionicons.glyphMap;

export function CategoryPicker({ selectedCategory, onSelectCategory, mode = 'list', categories: override, exclude }: CategoryPickerProps) {
  const colors = useThemeColors();
  const { categories: stored } = useCategories();
  const categories = (override ?? stored).filter((c) => !exclude?.includes(c.key));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const anchor = useRef<View>(null);

  const selected = categories.find((c) => c.key === selectedCategory) ?? categories[0];

  if (mode === 'chips') {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
        {categories.map((cat) => {
          const active = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              accessibilityRole="button"
              accessibilityLabel={`Category ${cat.label}`}
              accessibilityState={{ selected: active }}
              style={[styles.chip, { backgroundColor: active ? cat.color : 'transparent', borderColor: active ? cat.color : colors.border }]}
              onPress={() => onSelectCategory(cat.key)}
            >
              <Ionicons name={iconOf(cat.icon)} size={16} color={active ? '#FFFFFF' : cat.color} style={styles.chipIcon} />
              <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.text, fontWeight: active ? '700' : '500' }]}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  if (mode === 'dropdown') {
    const openMenu = () => {
      anchor.current?.measureInWindow((x, y, width, height) => {
        setPosition({ top: y + height + 4, left: x, width });
        setOpen(true);
      });
    };
    return (
      <View style={styles.full}>
        <TouchableOpacity
          ref={anchor as React.RefObject<View>}
          accessibilityRole="button"
          accessibilityLabel={`Category filter: ${selected?.label ?? 'none'}`}
          accessibilityState={{ expanded: open }}
          style={[styles.dropdownButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={openMenu}
        >
          <Ionicons name={iconOf(selected?.icon ?? 'apps')} size={18} color={colors.text} />
          <Text style={[styles.dropdownLabel, { color: colors.text }]} numberOfLines={1}>
            {selected?.label ?? 'Select'}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.text} />
        </TouchableOpacity>

        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <TouchableWithoutFeedback onPress={() => setOpen(false)} accessibilityLabel="Close category list">
            <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
              <View
                style={[styles.dropdownList, { backgroundColor: colors.card, borderColor: colors.border, top: position.top, left: position.left, width: position.width }]}
              >
                <FlatList
                  data={categories}
                  keyExtractor={(item) => item.key}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      accessibilityRole="menuitem"
                      accessibilityLabel={item.label}
                      style={[styles.dropdownItem, selectedCategory === item.key && { backgroundColor: `${colors.tint}33` }]}
                      onPress={() => {
                        onSelectCategory(item.key);
                        setOpen(false);
                      }}
                    >
                      <Ionicons name={iconOf(item.icon)} size={20} color={item.color} style={styles.dropdownIcon} />
                      <Text style={{ color: colors.text, fontSize: FontSizes.sm, fontWeight: '500' }}>{item.label}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {categories.map((cat) => {
        const active = selectedCategory === cat.key;
        return (
          <TouchableOpacity
            key={cat.key}
            accessibilityRole="button"
            accessibilityLabel={`Category ${cat.label}`}
            accessibilityState={{ selected: active }}
            style={[styles.listButton, { backgroundColor: active ? cat.color : 'transparent', borderColor: active ? cat.color : colors.border }]}
            onPress={() => onSelectCategory(cat.key)}
          >
            <Ionicons name={iconOf(cat.icon)} size={20} color={active ? '#FFFFFF' : cat.color} />
            <Text style={{ color: active ? '#FFFFFF' : colors.text, fontSize: FontSizes.sm, fontWeight: '500' }} numberOfLines={1}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { width: '100%' },
  chipRow: { paddingVertical: 4, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 40, borderRadius: 20, borderWidth: 1 },
  chipIcon: { marginRight: 6 },
  chipText: { fontSize: FontSizes.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  listButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minHeight: 44, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1 },
  dropdownButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: BorderRadius.full, borderWidth: 1 },
  dropdownLabel: { flex: 1, fontSize: FontSizes.sm, fontWeight: '500' },
  overlay: { flex: 1 },
  dropdownList: { position: 'absolute', maxHeight: 300, borderRadius: BorderRadius.md, borderWidth: 1, padding: 4, elevation: 6 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', padding: 12, minHeight: 44, borderRadius: BorderRadius.sm },
  dropdownIcon: { marginRight: 8 },
});
