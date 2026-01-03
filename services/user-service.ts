import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_UPI_KEY = '@upitracker_user_upi';
const USER_NAME_KEY = '@upitracker_user_name';

export interface UserProfile {
    upiId: string;
    name: string;
}

export const getUserProfile = async (): Promise<UserProfile | null> => {
    try {
        const upiId = await AsyncStorage.getItem(USER_UPI_KEY);
        const name = await AsyncStorage.getItem(USER_NAME_KEY);

        if (!upiId) return null;

        return {
            upiId,
            name: name || 'User',
        };
    } catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
};

export const saveUserProfile = async (profile: UserProfile): Promise<boolean> => {
    try {
        await Promise.all([
            AsyncStorage.setItem(USER_UPI_KEY, profile.upiId),
            AsyncStorage.setItem(USER_NAME_KEY, profile.name),
        ]);
        return true;
    } catch (error) {
        console.error('Error saving user profile:', error);
        return false;
    }
};
