import { Account, ACCOUNT_TYPES, AccountType } from '@spentsmart/finance/types';
import { SqlDriver } from '../driver';
import { DEFAULT_BANK_ACCOUNT_ID, DEFAULT_CASH_ACCOUNT_ID } from '../migrations';
import { RepoDeps } from './deps';
import { BALANCE_EFFECT_SQL, ValidationError } from './transactions';

interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  opening_balance_paise: number;
  sort_order: number;
  archived_at: number | null;
  balance: number;
}

export interface AccountWithBalance extends Account {
  /** Tracked balance: opening balance plus everything recorded in the app. Not the bank's figure. */
  balancePaise: number;
}

const mapAccount = (r: AccountRow): AccountWithBalance => ({
  id: r.id,
  name: r.name,
  type: r.type,
  openingBalancePaise: r.opening_balance_paise,
  sortOrder: r.sort_order,
  archived: r.archived_at !== null,
  balancePaise: r.balance,
});

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 30) throw new ValidationError('Account name must be 1–30 characters.');
  return trimmed;
}

export function createAccountsRepo(db: SqlDriver, deps: RepoDeps) {
  const { now, newId, notify } = deps;

  async function list(includeArchived = false): Promise<AccountWithBalance[]> {
    const rows = await db.all<AccountRow>(
      `SELECT a.*, a.opening_balance_paise + COALESCE((
         SELECT SUM(${BALANCE_EFFECT_SQL}) FROM transactions t WHERE t.account_id = a.id AND t.deleted_at IS NULL
       ), 0) AS balance
       FROM accounts a ${includeArchived ? '' : 'WHERE a.archived_at IS NULL'}
       ORDER BY a.sort_order ASC, a.name ASC`,
    );
    return rows.map(mapAccount);
  }

  return {
    list,

    async add(input: { name: string; type: AccountType; openingBalancePaise?: number }): Promise<AccountWithBalance> {
      if (!ACCOUNT_TYPES.includes(input.type)) throw new ValidationError('Invalid account type.');
      const opening = input.openingBalancePaise ?? 0;
      if (!Number.isSafeInteger(opening)) throw new ValidationError('Invalid opening balance.');
      const id = newId();
      const order = await db.first<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM accounts');
      await db.run(
        'INSERT INTO accounts (id, name, type, opening_balance_paise, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, validateName(input.name), input.type, opening, (order?.m ?? 0) + 1, now()],
      );
      notify();
      return (await list(true)).find((a) => a.id === id)!;
    },

    async update(id: string, patch: { name?: string; openingBalancePaise?: number }): Promise<boolean> {
      const current = (await list(true)).find((a) => a.id === id);
      if (!current) return false;
      if (patch.openingBalancePaise !== undefined && !Number.isSafeInteger(patch.openingBalancePaise)) {
        throw new ValidationError('Invalid opening balance.');
      }
      const result = await db.run('UPDATE accounts SET name = ?, opening_balance_paise = ? WHERE id = ?', [
        patch.name !== undefined ? validateName(patch.name) : current.name,
        patch.openingBalancePaise ?? current.openingBalancePaise,
        id,
      ]);
      if (result.changes > 0) notify();
      return result.changes > 0;
    },

    /** Hide an account from pickers. Its history stays. The last active account cannot be archived. */
    async archive(id: string): Promise<boolean> {
      const archived = await db.transaction(async (tx) => {
        const active = await tx.first<{ c: number }>('SELECT COUNT(*) AS c FROM accounts WHERE archived_at IS NULL');
        if ((active?.c ?? 0) <= 1) throw new ValidationError('Keep at least one active account.');
        const result = await tx.run('UPDATE accounts SET archived_at = ? WHERE id = ? AND archived_at IS NULL', [now(), id]);
        return result.changes > 0;
      });
      if (archived) notify();
      return archived;
    },

    /** Back to the two starting accounts, used by "Delete all data" after transactions are gone. */
    async resetToDefaults(): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM accounts WHERE id NOT IN (?, ?)', [DEFAULT_BANK_ACCOUNT_ID, DEFAULT_CASH_ACCOUNT_ID]);
        await tx.run("UPDATE accounts SET name = 'Bank & UPI', opening_balance_paise = 0, archived_at = NULL, sort_order = 0 WHERE id = ?", [
          DEFAULT_BANK_ACCOUNT_ID,
        ]);
        await tx.run("UPDATE accounts SET name = 'Cash', opening_balance_paise = 0, archived_at = NULL, sort_order = 1 WHERE id = ?", [
          DEFAULT_CASH_ACCOUNT_ID,
        ]);
      });
      notify();
    },
  };
}

export type AccountsRepo = ReturnType<typeof createAccountsRepo>;
