
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification handler safely
try {
    if (Platform.OS !== 'web' && Notifications && Notifications.setNotificationHandler) {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
    }
} catch (error) {
    console.warn('Failed to set notification handler:', error);
}

export async function scheduleDailyReminders() {
    if (Platform.OS === 'web') return;

    try {
        if (!Notifications) {
            console.warn('Notifications module not available');
            return;
        }

        // Native module check hack - if setNotificationHandler throws, likely native module missing
        // or just check if methods exist
        if (!Notifications.getPermissionsAsync || !Notifications.scheduleNotificationAsync) {
            console.warn('Notifications methods not available - native module missing?');
            return;
        }

        // Check valid permission
        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
            const { status: newStatus } = await Notifications.requestPermissionsAsync();
            finalStatus = newStatus;
        }

        if (finalStatus !== 'granted') {
            return;
        }

        // Cancel existing to avoid duplicates
        if (Notifications.cancelAllScheduledNotificationsAsync) {
            await Notifications.cancelAllScheduledNotificationsAsync();
        }

        // Schedule Morning Reminder (10:00 AM)
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Good Morning",
                body: "Don't forget to log your expenses from last night.",
            },
            trigger: {
                type: 'calendar',
                hour: 10,
                minute: 0,
                repeats: true,
            } as Notifications.CalendarTriggerInput,
        });

        // Schedule Evening Reminder (8:00 PM)
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Evening Check-in",
                body: "Did you spend money today? Log it now to stay on track!",
            },
            trigger: {
                type: 'calendar',
                hour: 20,
                minute: 0,
                repeats: true,
            } as Notifications.CalendarTriggerInput,
        });
    } catch (error) {
        // Broad catch to prevent crashing the app if native module is missing
        console.warn('Failed to schedule reminders (likely missing native module):', error);
    }
}
