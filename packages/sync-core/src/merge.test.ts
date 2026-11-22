import { describe, expect, it } from 'vitest';
import { mergeRecord } from './merge';

const rec = (fields: Record<string, unknown>, deleted = false) => ({ deleted, fields });
const base = rec({ amount: 100, payee: 'Swiggy', note: null, tags: ['a'] });

describe('mergeRecord', () => {
  it('takes remote changes to fields only the remote touched', () => {
    const r = mergeRecord(base, base, rec({ ...base.fields, amount: 120 }));
    expect(r).toEqual({ merged: rec({ ...base.fields, amount: 120 }), conflicts: [], deleteConflict: null });
  });

  it('keeps local changes to fields only the local touched', () => {
    const r = mergeRecord(base, rec({ ...base.fields, note: 'dinner' }), base);
    expect(r.merged.fields.note).toBe('dinner');
    expect(r.conflicts).toEqual([]);
  });

  it('combines edits to different fields', () => {
    const r = mergeRecord(base, rec({ ...base.fields, note: 'dinner' }), rec({ ...base.fields, amount: 120 }));
    expect(r.merged.fields).toEqual({ amount: 120, payee: 'Swiggy', note: 'dinner', tags: ['a'] });
    expect(r.conflicts).toEqual([]);
  });

  it('agrees when both sides made the same change', () => {
    const changed = rec({ ...base.fields, amount: 150 });
    expect(mergeRecord(base, changed, changed).conflicts).toEqual([]);
  });

  it('keeps local and reports a conflict when both changed a field differently', () => {
    const r = mergeRecord(base, rec({ ...base.fields, amount: 150 }), rec({ ...base.fields, amount: 175 }));
    expect(r.merged.fields.amount).toBe(150);
    expect(r.conflicts).toEqual([{ field: 'amount', localValue: 150, remoteValue: 175 }]);
  });

  it('compares arrays and objects by value', () => {
    const r = mergeRecord(base, rec({ ...base.fields, tags: ['a', 'b'] }), rec({ ...base.fields, tags: ['a'] }));
    expect(r.merged.fields.tags).toEqual(['a', 'b']);
    expect(r.conflicts).toEqual([]);
  });

  it('handles added and removed fields', () => {
    const r = mergeRecord(base, rec({ ...base.fields, account: 'cash' }), rec({ amount: 100, payee: 'Swiggy', tags: ['a'] }));
    expect(r.merged.fields).toEqual({ amount: 100, payee: 'Swiggy', tags: ['a'], account: 'cash' });
  });

  it('deletes when one side deleted and the other did nothing', () => {
    expect(mergeRecord(base, rec(base.fields, true), base).merged.deleted).toBe(true);
    expect(mergeRecord(base, base, rec(base.fields, true)).merged.deleted).toBe(true);
  });

  it('keeps a remote edit over a local delete, and says so', () => {
    const r = mergeRecord(base, rec(base.fields, true), rec({ ...base.fields, amount: 175 }));
    expect(r).toEqual({ merged: rec({ ...base.fields, amount: 175 }), conflicts: [], deleteConflict: 'deleted-locally' });
  });

  it('keeps a local edit over a remote delete, and says so', () => {
    const r = mergeRecord(base, rec({ ...base.fields, note: 'x' }), rec(base.fields, true));
    expect(r).toEqual({ merged: rec({ ...base.fields, note: 'x' }), conflicts: [], deleteConflict: 'deleted-remotely' });
  });

  it('both deleted stays deleted', () => {
    expect(mergeRecord(base, rec(base.fields, true), rec(base.fields, true)).merged.deleted).toBe(true);
  });

  it('with no base, treats every differing field as a conflict', () => {
    const r = mergeRecord(null, rec({ amount: 1, payee: 'A' }), rec({ amount: 2, payee: 'A' }));
    expect(r.conflicts).toEqual([{ field: 'amount', localValue: 1, remoteValue: 2 }]);
    expect(r.merged.fields).toEqual({ amount: 1, payee: 'A' });
  });

  it('is symmetric about what changed, apart from which side wins a conflict', () => {
    const a = rec({ ...base.fields, note: 'n' });
    const b = rec({ ...base.fields, amount: 9 });
    expect(mergeRecord(base, a, b).merged).toEqual(mergeRecord(base, b, a).merged);
  });
});
