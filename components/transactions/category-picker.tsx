import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Modal,
  TouchableWithoutFeedback,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { CategoryType, CategoryInfo } from '@/types/transaction';
import { DEFAULT_CATEGORY_LIST } from '@/constants/categories';
import { getCategories, AVAILABLE_ICONS } from '@/services/category-storage';
import { Colors, BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface CategoryPickerProps {
  selectedCategory: CategoryType | string | null;
  onSelectCategory: (category: any) => void;
  compact?: boolean;
  mode?: 'dropdown' | 'chips';
  customCategories?: CategoryInfo[];
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function CategoryButton({
  category,
  isSelected,
  onPress,
}: {
  category: CategoryInfo;
  isSelected: boolean;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isSelected ? 1.05 : 1, {
            damping: 15,
            stiffness: 150,
          }),
        },
      ],
    };
  }, [isSelected]);

  const getIconName = (icon: string): keyof typeof Ionicons.glyphMap => {
    // Check if it's a valid Ionicons icon
    if (AVAILABLE_ICONS.includes(icon)) {
      return icon as keyof typeof Ionicons.glyphMap;
    }
    return 'pricetag';
  };

  return (
    <AnimatedTouchable
      style={[
        styles.categoryButton,
        {
          backgroundColor: isSelected ? category.color : 'transparent',
          borderColor: isSelected ? category.color : colors.border,
        },
        animatedStyle,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: isSelected
              ? 'rgba(255, 255, 255, 0.2)'
              : colors.surface,
          },
        ]}
      >
        <Ionicons
          name={getIconName(category.icon)}
          size={20}
          color={isSelected ? '#fff' : category.color}
        />
      </View>
      <Text
        style={[
          styles.categoryLabel,
          {
            color: isSelected ? '#fff' : colors.text,
          },
        ]}
        numberOfLines={1}
      >
        {category.label}
      </Text>
    </AnimatedTouchable>
  );
}

export function CategoryPicker({
  selectedCategory,
  onSelectCategory,
  compact = false,
  mode = 'dropdown',
  customCategories
}: CategoryPickerProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const [categories, setCategories] = useState<CategoryInfo[]>(customCategories || DEFAULT_CATEGORY_LIST);
  const [isLoading, setIsLoading] = useState(!customCategories);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = React.useRef<View>(null);

  useEffect(() => {
    if (!customCategories) {
      loadCategories();
    } else {
      setCategories(customCategories);
    }
  }, [customCategories]);

  const loadCategories = async () => {
    try {
      const loaded = await getCategories();
      setCategories(loaded);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to get selected category info
  const selectedCategoryInfo = categories.find(c => c.key === selectedCategory) || categories[0];

  // Chips Mode (Horizontal Carousel)
  if (mode === 'chips') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 4, gap: 8 }}
      >
        {categories.map((cat) => {
          const isActive = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: isActive
                  ? cat.color
                  : 'transparent',
                borderWidth: 1,
                borderColor: isActive
                  ? cat.color
                  : colors.border,
              }}
              onPress={() => onSelectCategory(cat.key)}
            >
              <Ionicons
                name={cat.icon as keyof typeof Ionicons.glyphMap}
                size={16}
                color={isActive ? '#fff' : cat.color}
                style={{ marginRight: 6 }}
              />
              <Text style={{
                color: isActive ? '#fff' : colors.text,
                fontWeight: isActive ? '700' : '500',
                fontSize: 14
              }}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  // Compact Dropdown Mode
  if (compact) {
    const handleOpen = () => {
      buttonRef.current?.measureInWindow((x, y, width, height) => {
        setDropdownPosition({
          top: y + height + 4,
          left: x,
          width: width,
        });
        setIsExpanded(true);
      });
    };

    return (
      <View style={{ width: '100%' }}>
        <TouchableOpacity
          ref={buttonRef}
          style={[
            styles.dropdownButton,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            }
          ]}
          onPress={handleOpen}
        >
          <View style={[styles.iconContainer, { width: 24, height: 24, backgroundColor: 'transparent' }]}>
            <Ionicons
              name={(selectedCategoryInfo.icon || 'apps') as keyof typeof Ionicons.glyphMap}
              size={18}
              color={colors.text}
            />
          </View>
          <Text
            style={[styles.categoryLabel, { color: colors.text, flex: 1, marginRight: 4 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {selectedCategoryInfo.label}
          </Text>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.text} />
        </TouchableOpacity>

        <Modal
          visible={isExpanded}
          transparent
          animationType="fade"
          onRequestClose={() => setIsExpanded(false)}
        >
          <TouchableWithoutFeedback onPress={() => setIsExpanded(false)}>
            <View style={styles.modalOverlay}>
              <View style={[
                styles.dropdownList,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  top: dropdownPosition.top,
                  left: dropdownPosition.left,
                  width: dropdownPosition.width,
                  maxHeight: 300, // Explicit height constraint
                }
              ]}>
                <FlatList
                  data={categories}
                  keyExtractor={(item) => item.key}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.dropdownItem,
                        selectedCategory === item.key && { backgroundColor: colors.tint + '20' }
                      ]}
                      onPress={() => {
                        onSelectCategory(item.key);
                        setIsExpanded(false);
                      }}
                    >
                      <Ionicons
                        name={(item.icon || 'apps') as keyof typeof Ionicons.glyphMap}
                        size={20}
                        color={item.color}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>
                        {item.label}
                      </Text>
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

  // Default List Mode
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Category
      </Text>
      <View style={styles.categoriesContainer}>
        {categories.map((category) => (
          <CategoryButton
            key={category.key}
            category={category}
            isSelected={selectedCategory === category.key}
            onPress={() => onSelectCategory(category.key)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  // New Compact/Dropdown Styles
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: 6,
    minHeight: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)', // Dim background slightly to show focus
  },
  dropdownList: {
    position: 'absolute',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: 4,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)',
    elevation: 5,
    zIndex: 1000,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: BorderRadius.sm,
  }
});

