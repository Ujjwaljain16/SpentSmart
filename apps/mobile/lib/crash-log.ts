import { redact } from './logger';

export interface CrashRecord {
  at: number;
  /** Redacted: no UPI IDs, amounts or emails. */
  message: string;
  fatal: boolean;
}

/** Where crash records live; a file in the app's private storage on the phone, memory in tests. */
export interface CrashStore {
  read(): string | null;
  write(text: string): void;
}

const MAX = 20;

/**
 * Crashes survive a restart so the user can see what went wrong the next time they open the app. Stays on the
 * phone: nothing here is uploaded, and the user can share it themselves from Settings → Diagnostics.
 */
export function createCrashLog(store: CrashStore, now: () => number = Date.now) {
  const load = (): CrashRecord[] => {
    try {
      const parsed = JSON.parse(store.read() ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.message === 'string').slice(-MAX) : [];
    } catch {
      return [];
    }
  };
  return {
    record(error: unknown, fatal: boolean) {
      const text = error instanceof Error ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack.split('\n').slice(1, 6).join('\n')}` : ''}` : String(error);
      const records = [...load(), { at: now(), message: redact(text).slice(0, 2000), fatal }].slice(-MAX);
      try {
        store.write(JSON.stringify(records));
      } catch {
        // Losing a crash record must never cause another crash.
      }
    },
    list: load,
    clear() {
      try {
        store.write('[]');
      } catch {
        // ignore
      }
    },
  };
}

export type CrashLog = ReturnType<typeof createCrashLog>;

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

/** Record uncaught JS errors (outside React rendering too), then let React Native handle them as before. */
export function installCrashHandler(crashLog: CrashLog, errorUtils: ErrorUtilsLike | undefined): void {
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    crashLog.record(error, isFatal === true);
    previous(error, isFatal);
  });
}
