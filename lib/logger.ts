/**
 * Minimal logger.
 *  - debug/info are silent in production builds.
 *  - Everything is passed through `redact` first: UPI IDs and amounts must never reach logs.
 *  - Warnings and errors are kept in a small in-memory ring buffer so the user can attach them to a bug
 *    report from Settings → Diagnostics. Nothing is ever sent anywhere automatically.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  at: number;
  level: LogLevel;
  message: string;
}

const VPA = /[A-Za-z0-9._-]+@[A-Za-z0-9.]{2,}/g;
const AMOUNT_PARAM = /\b(am|amount|mam)=[^&\s]+/gi;
const SIGN_PARAM = /\b(sign|pa|pn|tn)=[^&\s]+/gi;

export function redact(text: string): string {
  return text.replace(SIGN_PARAM, '$1=***').replace(AMOUNT_PARAM, '$1=***').replace(VPA, '***@***');
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const MAX_ENTRIES = 100;
const buffer: LogEntry[] = [];
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

function emit(level: LogLevel, message: string, extra?: unknown): void {
  const text = redact(extra === undefined ? message : `${message} ${describe(extra)}`);
  if (level === 'warn' || level === 'error') {
    buffer.push({ at: Date.now(), level, message: text });
    if (buffer.length > MAX_ENTRIES) buffer.shift();
  }
  if (!isDev && (level === 'debug' || level === 'info')) return;
  /* eslint-disable no-console */
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(`[${level}] ${text}`);
  /* eslint-enable no-console */
}

export const log = {
  debug: (message: string, extra?: unknown) => emit('debug', message, extra),
  info: (message: string, extra?: unknown) => emit('info', message, extra),
  warn: (message: string, extra?: unknown) => emit('warn', message, extra),
  error: (message: string, extra?: unknown) => emit('error', message, extra),
};

export function getRecentLogs(): readonly LogEntry[] {
  return buffer;
}

export function clearLogs(): void {
  buffer.length = 0;
}

declare const __DEV__: boolean | undefined;
