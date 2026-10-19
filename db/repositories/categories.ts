import {
  DEFAULT_CATEGORIES,
  OTHER_CATEGORY_KEY,
  slugifyCategoryKey,
  validateCategoryLabel,
} from '@/domain/categories';
import { Category } from '@/domain/types';
import { SqlDriver } from '../driver';
import { RepoDeps } from './deps';
import { ValidationError } from './transactions';

interface CategoryRow {
  key: string;
  label: string;
  icon: string;
  color: string;
  sort_order: number;
  is_system: number;
}

const mapCategory = (r: CategoryRow): Category => ({
  key: r.key,
  label: r.label,
  icon: r.icon,
  color: r.color,
  sortOrder: r.sort_order,
  isSystem: r.is_system === 1,
});

export function createCategoriesRepo(db: SqlDriver, deps: RepoDeps) {
  const { notify } = deps;

  async function list(): Promise<Category[]> {
    const rows = await db.all<CategoryRow>('SELECT * FROM categories ORDER BY sort_order ASC, label ASC');
    return rows.map(mapCategory);
  }

  return {
    list,

    async add(input: { label: string; icon: string; color: string }): Promise<Category> {
      const existing = await list();
      const check = validateCategoryLabel(input.label, existing);
      if (!check.ok) throw new ValidationError(check.message ?? 'Invalid category.');
      const key = slugifyCategoryKey(input.label, existing.map((c) => c.key));
      const sortOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;
      await db.run('INSERT INTO categories (key, label, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, 0)', [
        key,
        input.label.trim(),
        input.icon,
        input.color,
        sortOrder,
      ]);
      notify();
      return { key, label: input.label.trim(), icon: input.icon, color: input.color, sortOrder, isSystem: false };
    },

    async update(key: string, patch: Partial<Pick<Category, 'label' | 'icon' | 'color'>>): Promise<boolean> {
      const existing = await list();
      const current = existing.find((c) => c.key === key);
      if (!current) return false;
      if (patch.label !== undefined) {
        const check = validateCategoryLabel(patch.label, existing, key);
        if (!check.ok) throw new ValidationError(check.message ?? 'Invalid category.');
      }
      const result = await db.run('UPDATE categories SET label = ?, icon = ?, color = ? WHERE key = ?', [
        patch.label?.trim() ?? current.label,
        patch.icon ?? current.icon,
        patch.color ?? current.color,
        key,
      ]);
      if (result.changes > 0) notify();
      return result.changes > 0;
    },

    /**
     * Delete a category. Its transactions move to "Other" in the same atomic step, so no transaction is
     * ever left pointing at a category that does not exist. System categories cannot be deleted.
     */
    async remove(key: string): Promise<boolean> {
      const removed = await db.transaction(async (tx) => {
        const row = await tx.first<CategoryRow>('SELECT * FROM categories WHERE key = ?', [key]);
        if (!row || row.is_system === 1) return false;
        await tx.run('UPDATE transactions SET category_key = ? WHERE category_key = ?', [OTHER_CATEGORY_KEY, key]);
        await tx.run('UPDATE payment_attempts SET category_key = ? WHERE category_key = ?', [OTHER_CATEGORY_KEY, key]);
        await tx.run('DELETE FROM categories WHERE key = ?', [key]);
        return true;
      });
      if (removed) notify();
      return removed;
    },

    /** Restore the default set; custom categories are deleted and their transactions moved to "Other". */
    async resetToDefaults(): Promise<void> {
      await db.transaction(async (tx) => {
        const defaultKeys = new Set(DEFAULT_CATEGORIES.map((c) => c.key));
        const rows = await tx.all<CategoryRow>('SELECT * FROM categories');
        for (const row of rows) {
          if (defaultKeys.has(row.key)) continue;
          await tx.run('UPDATE transactions SET category_key = ? WHERE category_key = ?', [OTHER_CATEGORY_KEY, row.key]);
          await tx.run('UPDATE payment_attempts SET category_key = ? WHERE category_key = ?', [OTHER_CATEGORY_KEY, row.key]);
          await tx.run('DELETE FROM categories WHERE key = ?', [row.key]);
        }
        for (const c of DEFAULT_CATEGORIES) {
          await tx.run(
            `INSERT INTO categories (key, label, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET label = excluded.label, icon = excluded.icon, color = excluded.color,
               sort_order = excluded.sort_order, is_system = excluded.is_system`,
            [c.key, c.label, c.icon, c.color, c.sortOrder, c.isSystem ? 1 : 0],
          );
        }
      });
      notify();
    },
  };
}

export type CategoriesRepo = ReturnType<typeof createCategoriesRepo>;
