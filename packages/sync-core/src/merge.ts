/** A synced record's plaintext: a flat object of JSON values. */
export type Fields = Record<string, unknown>;

export interface RecordState {
  deleted: boolean;
  fields: Fields;
}

export interface FieldConflict {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
}

export interface MergeResult {
  merged: RecordState;
  /** Empty when the two sides could be combined without a judgement call. */
  conflicts: FieldConflict[];
  /** Deleted on one side, edited on the other; the edit was kept. */
  deleteConflict: 'deleted-remotely' | 'deleted-locally' | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge of one record, field by field, against the last version both sides agreed on (`base`).
 * A field changed on only one side takes that change; changed on both to different values keeps the local value and
 * reports a conflict for the user to settle. `base` is null when the record was created on both sides independently,
 * which only happens with id collisions; every field then counts as changed.
 */
export function mergeRecord(base: RecordState | null, local: RecordState, remote: RecordState): MergeResult {
  const baseFields = base?.fields ?? {};
  const keys = new Set([...Object.keys(baseFields), ...Object.keys(local.fields), ...Object.keys(remote.fields)]);
  const fields: Fields = {};
  const conflicts: FieldConflict[] = [];

  let localEdited = false;
  let remoteEdited = false;
  for (const key of [...keys].sort()) {
    const b = baseFields[key];
    const l = local.fields[key];
    const r = remote.fields[key];
    const localChanged = base === null || !same(l, b);
    const remoteChanged = base === null || !same(r, b);
    localEdited ||= localChanged;
    remoteEdited ||= remoteChanged;

    let value: unknown;
    if (!remoteChanged) value = l;
    else if (!localChanged || same(l, r)) value = r;
    else {
      value = l;
      conflicts.push({ field: key, localValue: l, remoteValue: r });
    }
    if (value !== undefined) fields[key] = value;
  }

  const baseDeleted = base?.deleted ?? false;
  const localDeletes = local.deleted && !baseDeleted;
  const remoteDeletes = remote.deleted && !baseDeleted;
  let deleted: boolean;
  let deleteConflict: MergeResult['deleteConflict'] = null;
  if (localDeletes && remoteEdited && !remote.deleted) {
    deleted = false;
    deleteConflict = 'deleted-locally';
  } else if (remoteDeletes && localEdited && !local.deleted) {
    deleted = false;
    deleteConflict = 'deleted-remotely';
  } else {
    deleted = local.deleted || remote.deleted;
  }

  // A delete-vs-edit conflict keeps the edited side as it was, not a mix with the deleted side's stale fields.
  if (deleteConflict === 'deleted-locally') return { merged: { deleted, fields: { ...remote.fields } }, conflicts: [], deleteConflict };
  if (deleteConflict === 'deleted-remotely') return { merged: { deleted, fields: { ...local.fields } }, conflicts: [], deleteConflict };
  return { merged: { deleted, fields }, conflicts, deleteConflict };
}
