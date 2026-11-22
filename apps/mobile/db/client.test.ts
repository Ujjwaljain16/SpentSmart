import { beforeEach, describe, expect, it, vi } from 'vitest';

const openDatabaseAsync = vi.fn();

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: (...args: unknown[]) => openDatabaseAsync(...args), deleteDatabaseAsync: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));
vi.mock('./key', () => ({ getOrCreateDatabaseKey: async () => 'ab'.repeat(32), deleteDatabaseKey: async () => undefined }));
vi.mock('./migrations', () => ({ migrate: async () => undefined }));
vi.mock('./repositories', () => ({ createRepositories: () => ({ attempts: { cleanup: async () => undefined } }) }));
vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn(), error: vi.fn() } }));

function fakeDatabase() {
  return {
    getFirstAsync: vi.fn(async (sql: string) => (sql.includes('cipher_version') ? { cipher_version: '4.6.1' } : { c: 0 })),
    execAsync: vi.fn(async () => undefined),
    closeAsync: vi.fn(async () => undefined),
  };
}

describe('openRepositories', () => {
  beforeEach(() => {
    vi.resetModules();
    openDatabaseAsync.mockReset();
  });

  // Android recreates the activity (font size, language, split screen…) and React mounts the app again in the same
  // runtime. A second open hands back the same native connection under a new JS handle; when the old handle is
  // garbage-collected, expo-sqlite closes that shared connection and every later query fails.
  it('opens the database once, however many times the app mounts', async () => {
    openDatabaseAsync.mockImplementation(async () => fakeDatabase());
    const { openRepositories } = await import('./client');

    const [first, second] = await Promise.all([openRepositories(), openRepositories()]);
    const third = await openRepositories();

    expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('tries again after a failed open', async () => {
    openDatabaseAsync.mockRejectedValueOnce(new Error('locked')).mockImplementation(async () => fakeDatabase());
    const { openRepositories } = await import('./client');

    await expect(openRepositories()).rejects.toThrow('could not be opened');
    await expect(openRepositories()).resolves.toBeDefined();
    expect(openDatabaseAsync).toHaveBeenCalledTimes(2);
  });
});
