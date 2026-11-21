import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useRepos } from '@/contexts/database-context';
import { emitDataChanged, subscribeToDataChanges } from '@/db/events';
import { log } from '@/lib/logger';
import { API_URL } from '@/lib/cloud-config';
import { ApiClient, ApiError, createApiClient } from '@/services/cloud/api-client';
import { setBackgroundSync } from '@/services/cloud/background-sync';
import { secureStore } from '@/services/cloud/secure-store';
import { Cloud, CloudStatus, createCloud } from '@/services/cloud/cloud';

interface CloudContextValue {
  client: ApiClient;
  cloud: Cloud;
  status: CloudStatus | null;
  syncing: boolean;
  /** Last sync problem, in plain words; cleared by the next successful sync. */
  error: string | null;
  refreshStatus: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const CloudContext = createContext<CloudContextValue | null>(null);

const AUTO_SYNC_DELAY_MS = 8_000;

export function CloudProvider({ children }: { children: React.ReactNode }) {
  const repos = useRepos();
  const client = useMemo(() => createApiClient({ baseUrl: API_URL, store: secureStore }), []);
  const cloud = useMemo(
    () =>
      createCloud({
        client,
        store: secureStore,
        db: repos.driver,
        random: (n) => Crypto.getRandomBytes(n),
        now: () => Date.now(),
        newId: () => Crypto.randomUUID(),
        notify: emitDataChanged,
      }),
    [client, repos],
  );
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = status?.state === 'ready';

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await cloud.status());
    } catch (e) {
      // Offline: keep whatever we knew, but don't pretend to be signed out.
      setStatus((s) => s ?? { state: 'signed-out' });
      if (e instanceof ApiError && e.status === 401) setStatus({ state: 'signed-out' });
    }
  }, [cloud]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await cloud.syncNow();
      setError(null);
    } catch (e) {
      log.warn('Sync failed', e);
      setError(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setSyncing(false);
      await refreshStatus();
    }
  }, [cloud, refreshStatus]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Background sync follows sync being set up on this phone; it stops when sync is turned off.
  useEffect(() => {
    if (status) void setBackgroundSync(status.state === 'ready');
  }, [status]);

  // Sync when the app comes back to the foreground, and a few seconds after local changes settle.
  useEffect(() => {
    if (!ready) return;
    void syncNow();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncNow();
    });
    const unsubscribe = subscribeToDataChanges(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void syncNow(), AUTO_SYNC_DELAY_MS);
    });
    return () => {
      sub.remove();
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const value = useMemo(() => ({ client, cloud, status, syncing, error, refreshStatus, syncNow }), [client, cloud, status, syncing, error, refreshStatus, syncNow]);
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

export function useCloud(): CloudContextValue {
  const v = useContext(CloudContext);
  if (!v) throw new Error('useCloud must be used inside CloudProvider');
  return v;
}
