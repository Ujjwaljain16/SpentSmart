import { Category } from './types';

export const OTHER_CATEGORY_KEY = 'other';
export const INCOME_CATEGORY_KEY = 'income';
export const DEFAULT_EXPENSE_CATEGORY_KEY = 'food';

export const CATEGORY_ICONS = [
  'restaurant', 'flash', 'school', 'home', 'pricetag', 'cart', 'car', 'medkit', 'airplane', 'gift',
  'fitness', 'film', 'musical-notes', 'game-controller', 'shirt', 'cut', 'cafe', 'beer', 'pizza',
  'wallet', 'card', 'cash', 'business', 'briefcase', 'construct', 'hammer', 'bulb', 'water', 'wifi',
  'phone-portrait', 'desktop', 'laptop', 'tv', 'headset', 'book', 'library', 'newspaper',
  'document-text', 'people', 'person', 'heart', 'paw', 'leaf', 'flower', 'globe', 'train', 'bus',
  'boat', 'bicycle',
] as const;

export const CATEGORY_COLORS = [
  '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280', '#10B981', '#EF4444', '#F97316',
  '#14B8A6', '#6366F1', '#84CC16', '#06B6D4', '#A855F7', '#F43F5E', '#78716C',
] as const;

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { key: 'food', label: 'Food', icon: 'restaurant', color: '#F59E0B', sortOrder: 0, isSystem: false },
  { key: 'utility', label: 'Utility', icon: 'flash', color: '#3B82F6', sortOrder: 1, isSystem: false },
  { key: 'college', label: 'College', icon: 'school', color: '#8B5CF6', sortOrder: 2, isSystem: false },
  { key: 'rent', label: 'Rent', icon: 'home', color: '#EC4899', sortOrder: 3, isSystem: false },
  { key: INCOME_CATEGORY_KEY, label: 'Income', icon: 'wallet', color: '#10B981', sortOrder: 4, isSystem: true },
  { key: OTHER_CATEGORY_KEY, label: 'Other', icon: 'pricetag', color: '#6B7280', sortOrder: 5, isSystem: true },
];

const FALLBACK: Category = DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]!;

export function isKnownIcon(icon: string): boolean {
  return (CATEGORY_ICONS as readonly string[]).includes(icon);
}

/** Resolve a category key to its definition; unknown keys fall back to "Other" (never to another category). */
export function resolveCategory(categories: readonly Category[], key: string): Category {
  return categories.find((c) => c.key === key) ?? categories.find((c) => c.key === OTHER_CATEGORY_KEY) ?? FALLBACK;
}

/** Turn a label into a unique, stable key ("Eating Out" -> "eating-out", "eating-out-2"). */
export function slugifyCategoryKey(label: string, existingKeys: Iterable<string>): string {
  const taken = new Set(existingKeys);
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category';
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
  return key;
}

export interface CategoryLabelCheck {
  ok: boolean;
  message?: string;
}

export function validateCategoryLabel(label: string, existing: readonly Category[], ignoreKey?: string): CategoryLabelCheck {
  const trimmed = label.trim();
  if (trimmed.length < 2) return { ok: false, message: 'Category name must be at least 2 characters.' };
  if (trimmed.length > 24) return { ok: false, message: 'Category name must be at most 24 characters.' };
  const dup = existing.some((c) => c.key !== ignoreKey && c.label.toLowerCase() === trimmed.toLowerCase());
  if (dup) return { ok: false, message: 'A category with this name already exists.' };
  return { ok: true };
}
