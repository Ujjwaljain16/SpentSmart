import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
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
  selectedCategory: CategoryType | null;
  onSelectCategory: (category: CategoryType) => void;
  compact?: boolean;
  mode?: 'dropdown' | 'chips';
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
          backgroundColor: isSelected ? category.color : 'rgba(255, 255, 255, 0.1)',
          borderColor: isSelected ? category.color : 'rgba(255, 255, 255, 0.15)',
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
              : `${category.color}20`,
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
            color: '#fff',
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
  mode = 'dropdown'
}: CategoryPickerProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const [categories, setCategories] = useState<CategoryInfo[]>(DEFAULT_CATEGORY_LIST);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

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
                  : 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                borderColor: isActive
                  ? cat.color
                  : 'rgba(255, 255, 255, 0.2)',
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
                color: '#fff',
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
    return (
      <View style={{ zIndex: 100 }}>
        <TouchableOpacity
          style={[
            styles.dropdownButton,
            {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
            }
          ]}
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <View style={[styles.iconContainer, { width: 24, height: 24, backgroundColor: 'transparent' }]}>
            <Ionicons
              name={selectedCategoryInfo.icon as keyof typeof Ionicons.glyphMap}
              size={18}
              color="#FFF"
            />
          </View>
          <Text style={[styles.categoryLabel, { color: '#FFF', marginRight: 4 }]}>
            {selectedCategoryInfo.label}
          </Text>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#FFF" />
        </TouchableOpacity>

        {isExpanded && (
          <View style={[
            styles.dropdownList,
            {
              backgroundColor: 'rgba(30, 58, 138, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
            }
          ]}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.key}
                style={[
                  styles.dropdownItem,
                  selectedCategory === category.key && { backgroundColor: colors.tint + '20' }
                ]}
                onPress={() => {
                  onSelectCategory(category.key);
                  setIsExpanded(false);
                }}
              >
                <Ionicons
                  name={category.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={category.color}
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '500' }}>
                  {category.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  // Default List Mode
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: 'rgba(255, 255, 255, 0.7)' }]}>
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
  },
  dropdownList: {
    position: 'absolute',
    top: '120%',
    right: 0,
    minWidth: 180,
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

