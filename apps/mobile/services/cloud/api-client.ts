import type Anthropic from '@anthropic-ai/sdk';
import { PullResponse, PushOp, PushResult, TokenResponse } from '@spentsmart/sync-core/contracts';

/** Small async key-value store for secrets: SecureStore on the phone, a Map in tests. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const REFRESH = 'cloud.refreshToken';
const USER = 'cloud.userId';
const DEVICE = 'cloud.deviceId';

export interface Device {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/**
 * Talks to the SpentSmart API. The refresh token lives in the secret store (Keystore-backed on the phone); the
 * short-lived access token only in memory. Requests refresh it when it's missing or rejected, once.
 */
export function createApiClient(opts: { baseUrl: string; store: SecretStore; fetch?: typeof fetch }) {
  const doFetch = opts.fetch ?? fetch;
  let access: { token: string; expiresAt: number } | null = null;
  let refreshing: Promise<void> | null = null;

  async function raw(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
    try {
      return await doFetch(`${opts.baseUrl}${path}`, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'offline', 'Can’t reach the server. Check your connection.');
    }
  }

  async function fail(res: Response): Promise<never> {
    let code = 'error';
    let message = 'Something went wrong. Try again.';
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      code = j.error ?? code;
      message = j.message ?? message;
    } catch {
      // Not JSON; keep the generic message.
    }
    if (res.status === 401) message = 'You’ve been signed out. Sign in again.';
    if (res.status === 429) message = 'Too many requests. Try again in a minute.';
    throw new ApiError(res.status, code, message);
  }

  async function saveSession(t: TokenResponse) {
    await opts.store.set(REFRESH, t.refreshToken);
    await opts.store.set(USER, t.userId);
    await opts.store.set(DEVICE, t.deviceId);
    access = { token: t.accessToken, expiresAt: Date.now() + (t.expiresIn - 30) * 1000 };
  }

  async function refresh(): Promise<void> {
    refreshing ??= (async () => {
      const token = await opts.store.get(REFRESH);
      if (!token) throw new ApiError(401, 'signed_out', 'Sign in first.');
      const res = await raw('POST', '/v1/auth/refresh', { refreshToken: token });
      if (res.status === 401) {
        // The refresh chain was revoked (signed out elsewhere, or token reuse). Forget it.
        await clearLocal();
      }
      if (!res.ok) await fail(res);
      await saveSession((await res.json()) as TokenResponse);
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function authed<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!access || access.expiresAt < Date.now()) await refresh();
    let res = await raw(method, path, body, access!.token);
    if (res.status === 401) {
      await refresh();
      res = await raw(method, path, body, access!.token);
    }
    if (!res.ok) await fail(res);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async function clearLocal() {
    access = null;
    await opts.store.delete(REFRESH);
    await opts.store.delete(USER);
    await opts.store.delete(DEVICE);
  }

  return {
    async config(): Promise<{ testSignIn: boolean; assistant: boolean }> {
      const res = await raw('GET', '/v1/config');
      if (!res.ok) await fail(res);
      return res.json();
    },
    async signInForTesting(name: string, deviceName: string): Promise<TokenResponse> {
      const res = await raw('POST', '/v1/auth/test', { name, deviceName });
      if (!res.ok) await fail(res);
      const t = (await res.json()) as TokenResponse;
      await saveSession(t);
      return t;
    },
    async signInWithGoogle(idToken: string, deviceName: string): Promise<TokenResponse> {
      const res = await raw('POST', '/v1/auth/google', { idToken, deviceName });
      if (!res.ok) await fail(res);
      const t = (await res.json()) as TokenResponse;
      await saveSession(t);
      return t;
    },
    async session(): Promise<{ userId: string; deviceId: string } | null> {
      const [refreshToken, userId, deviceId] = await Promise.all([opts.store.get(REFRESH), opts.store.get(USER), opts.store.get(DEVICE)]);
      return refreshToken && userId && deviceId ? { userId, deviceId } : null;
    },
    getKey: () => authed<{ wrappedKey: string | null }>('GET', '/v1/keys'),
    putKey: (wrappedKey: string) => authed<void>('PUT', '/v1/keys', { wrappedKey }),
    push: async (ops: PushOp[]) => (await authed<{ results: PushResult[] }>('POST', '/v1/sync/push', { ops })).results,
    pull: (cursor: number, limit: number) => authed<PullResponse>('GET', `/v1/sync/pull?cursor=${cursor}&limit=${limit}`),
    devices: async () => (await authed<{ devices: Device[] }>('GET', '/v1/devices')).devices,
    removeDevice: (id: string) => authed<void>('DELETE', `/v1/devices/${encodeURIComponent(id)}`),
    assistantTurn: (messages: Anthropic.Beta.BetaMessageParam[]) =>
      authed<{ content: Anthropic.Beta.BetaContentBlock[]; stop_reason: string | null }>('POST', '/v1/assistant/turn', { messages }),
    async signOut(): Promise<void> {
      try {
        await authed<void>('POST', '/v1/auth/logout');
      } catch {
        // Signing out on this phone must work offline too; the server session expires on its own.
      }
      await clearLocal();
    },
    async deleteAccount(): Promise<void> {
      await authed<void>('DELETE', '/v1/account');
      await clearLocal();
    },
    clearLocal,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
