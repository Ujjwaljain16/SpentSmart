import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { log } from '@/lib/logger';

const CHANNEL_ID = 'reminders';
const MORNING_ID = 'reminder-morning';
const EVENING_ID = 'reminder-evening';

let handlerConfigured = false;

function configureHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function hasPermission(askIfNeeded: boolean): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!askIfNeeded || !current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function cancelReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(MORNING_ID).catch(() => undefined);
  await Notifications.cancelScheduledNotificationAsync(EVENING_ID).catch(() => undefined);
}

async function scheduleReminders(): Promise<void> {
  await ensureChannel();
  // Fixed identifiers make scheduling idempotent: scheduling again replaces, never duplicates.
  await Notifications.scheduleNotificationAsync({
    identifier: MORNING_ID,
    content: { title: 'Good morning', body: "Don't forget to log last night's expenses." },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 10, minute: 0, channelId: CHANNEL_ID },
  });
  await Notifications.scheduleNotificationAsync({
    identifier: EVENING_ID,
    content: { title: 'Evening check-in', body: 'Did you spend anything today? Log it to stay on track.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0, channelId: CHANNEL_ID },
  });
}

/**
 * Turn the two daily reminders on or off. Only ever asks for notification permission when the user turns
 * reminders on. Returns whether reminders are now active.
 */
export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    configureHandler();
    if (!enabled) {
      await cancelReminders();
      return false;
    }
    if (!(await hasPermission(true))) return false;
    await scheduleReminders();
    return true;
  } catch (error) {
    log.warn('Could not update reminders', error);
    return false;
  }
}

/** Re-assert the stored preference at startup without ever prompting. */
export async function syncReminders(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    configureHandler();
    if (enabled && (await hasPermission(false))) await scheduleReminders();
    else if (!enabled) await cancelReminders();
  } catch (error) {
    log.warn('Could not sync reminders', error);
  }
}
