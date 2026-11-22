import { isValidPaise } from '@spentsmart/finance/money';
import { Goal } from '@spentsmart/finance/types';
import { SqlDriver } from '../driver';
import { RepoDeps } from './deps';
import { ValidationError } from './transactions';

interface GoalRow {
  id: string;
  name: string;
  target_paise: number;
  saved_paise: number;
  deadline: number | null;
  archived_at: number | null;
}

const mapGoal = (r: GoalRow): Goal => ({
  id: r.id,
  name: r.name,
  targetPaise: r.target_paise,
  savedPaise: r.saved_paise,
  deadline: r.deadline,
  archived: r.archived_at !== null,
});

export function createGoalsRepo(db: SqlDriver, deps: RepoDeps) {
  const { now, newId, notify } = deps;

  async function get(id: string): Promise<Goal | null> {
    const row = await db.first<GoalRow>('SELECT * FROM goals WHERE id = ?', [id]);
    return row ? mapGoal(row) : null;
  }

  return {
    get,

    async list(): Promise<Goal[]> {
      const rows = await db.all<GoalRow>('SELECT * FROM goals WHERE archived_at IS NULL ORDER BY COALESCE(deadline, 9e15), name');
      return rows.map(mapGoal);
    },

    async add(input: { name: string; targetPaise: number; deadline?: number | null }): Promise<Goal> {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 40) throw new ValidationError('Goal name must be 1–40 characters.');
      if (!isValidPaise(input.targetPaise)) throw new ValidationError('Enter a target greater than zero.');
      const id = newId();
      await db.run('INSERT INTO goals (id, name, target_paise, saved_paise, deadline, created_at) VALUES (?, ?, ?, 0, ?, ?)', [
        id,
        name,
        input.targetPaise,
        input.deadline ?? null,
        now(),
      ]);
      notify();
      return (await get(id))!;
    },

    /** Add (or, with a negative amount, take back) money set aside for a goal. Never goes below zero. */
    async contribute(id: string, amountPaise: number): Promise<Goal | null> {
      if (!Number.isSafeInteger(amountPaise) || amountPaise === 0) throw new ValidationError('Enter an amount.');
      const result = await db.run(
        'UPDATE goals SET saved_paise = MAX(0, saved_paise + ?) WHERE id = ? AND archived_at IS NULL',
        [amountPaise, id],
      );
      if (result.changes === 0) return null;
      notify();
      return get(id);
    },

    async archive(id: string): Promise<boolean> {
      const result = await db.run('UPDATE goals SET archived_at = ? WHERE id = ? AND archived_at IS NULL', [now(), id]);
      if (result.changes > 0) notify();
      return result.changes > 0;
    },
  };
}

export type GoalsRepo = ReturnType<typeof createGoalsRepo>;
