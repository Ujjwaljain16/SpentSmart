import { PullResponse, PushOp, PushResult } from '@spentsmart/sync-core/contracts';
import { Db, asUser } from './db';
import { Session } from './auth/tokens';

/**
 * Apply a batch of pushed changes. Each op is a compare-and-set on the record's version, keyed by an idempotency id
 * so a retried request returns the original results. The whole batch is one transaction holding the user row lock,
 * which also hands out change sequence numbers in commit order.
 */
export async function push(db: Db, session: Session, ops: PushOp[]): Promise<PushResult[]> {
  return asUser(db, session.userId, async (tx) => {
    // Locks the user row for the rest of the transaction; concurrent pushes from other devices wait here.
    await tx.query('SELECT record_seq FROM users WHERE id = $1 FOR UPDATE', [session.userId]);

    const results: PushResult[] = [];
    for (const op of ops) {
      const prior = await tx.query<{ result: PushResult }>('SELECT result FROM applied_ops WHERE user_id = $1 AND op_id = $2', [session.userId, op.opId]);
      if (prior.rows[0]) {
        results.push(prior.rows[0].result);
        continue;
      }

      const current = await tx.query<{ version: number }>(
        'SELECT version FROM records WHERE user_id = $1 AND collection = $2 AND record_id = $3',
        [session.userId, op.collection, op.recordId],
      );
      const currentVersion = current.rows[0]?.version ?? 0;

      let result: PushResult;
      if (currentVersion !== op.baseVersion) {
        result = { opId: op.opId, status: 'conflict', currentVersion };
      } else {
        const seqRow = await tx.query<{ record_seq: string }>('UPDATE users SET record_seq = record_seq + 1 WHERE id = $1 RETURNING record_seq', [session.userId]);
        const seq = Number(seqRow.rows[0]!.record_seq);
        const version = currentVersion + 1;
        await tx.query(
          `INSERT INTO records (user_id, collection, record_id, version, deleted, ciphertext, key_version, seq, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (user_id, collection, record_id) DO UPDATE
             SET version = EXCLUDED.version, deleted = EXCLUDED.deleted, ciphertext = EXCLUDED.ciphertext,
                 key_version = EXCLUDED.key_version, seq = EXCLUDED.seq, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [session.userId, op.collection, op.recordId, version, op.deleted, op.ciphertext, op.keyVersion, seq, session.deviceId],
        );
        result = { opId: op.opId, status: 'applied', version, seq };
      }
      // Conflicts are recorded too: the same op retried must get the same answer, not a late success.
      await tx.query('INSERT INTO applied_ops (user_id, op_id, result) VALUES ($1, $2, $3)', [session.userId, op.opId, JSON.stringify(result)]);
      results.push(result);
    }
    return results;
  });
}

export async function pull(db: Db, session: Session, cursor: number, limit: number): Promise<PullResponse> {
  return asUser(db, session.userId, async (tx) => {
    const { rows } = await tx.query<{
      collection: PullResponse['records'][number]['collection'];
      record_id: string;
      version: number;
      deleted: boolean;
      ciphertext: string;
      key_version: number;
      seq: string;
    }>(
      `SELECT collection, record_id, version, deleted, ciphertext, key_version, seq FROM records
       WHERE user_id = $1 AND seq > $2 ORDER BY seq ASC LIMIT $3`,
      [session.userId, cursor, limit + 1],
    );
    const page = rows.slice(0, limit);
    const records = page.map((r) => ({
      collection: r.collection,
      recordId: r.record_id,
      version: r.version,
      deleted: r.deleted,
      ciphertext: r.ciphertext,
      keyVersion: r.key_version,
      seq: Number(r.seq),
    }));
    return { records, cursor: records.at(-1)?.seq ?? cursor, hasMore: rows.length > limit };
  });
}
