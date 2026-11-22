import * as BackgroundTask from 'expo-background-task';
import * as Crypto from 'expo-crypto';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { openRepositories } from '@/db/client';
import { emitDataChanged } from '@/db/events';
import { API_URL, CLOUD_CONFIGURED } from '@/lib/cloud-config';
import { log } from '@/lib/logger';
import { createApiClient } from './api-client';
import { createCloud } from './cloud';
import { secureStore } from './secure-store';

export const BACKGROUND_SYNC_TASK = 'spentsmart-background-sync';

// Must run at import time, before the app renders: Android may start the app just to run this task.
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  // When the app is open, the foreground sync already covers it; don't open a second connection.
  if (AppState.currentState === 'active' || !CLOUD_CONFIGURED) return BackgroundTask.BackgroundTaskResult.Success;
  try {
    const repos = await openRepositories();
    const client = createApiClient({ baseUrl: API_URL, store: secureStore });
    const cloud = createCloud({
      client,
      store: secureStore,
      db: repos.driver,
      random: (n) => Crypto.getRandomBytes(n),
      now: () => Date.now(),
      newId: () => Crypto.randomUUID(),
      notify: emitDataChanged,
    });
    if ((await cloud.status()).state !== 'ready') return BackgroundTask.BackgroundTaskResult.Success;
    await cloud.syncNow();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    // Typical causes: no network, or the phone is locked and the database key isn't readable. Next run retries.
    log.warn('Background sync failed', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Best effort: Android decides when it runs (roughly every few hours, on network, battery allowing). */
export async function setBackgroundSync(enabled: boolean): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (enabled && !registered) await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 4 * 60 });
    if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  } catch (e) {
    log.warn('Background sync registration failed', e);
  }
}
