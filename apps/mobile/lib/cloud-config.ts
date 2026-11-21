/**
 * Where the SpentSmart API is, set at build time (`EXPO_PUBLIC_API_URL` in `eas.json`). Emulator test builds point
 * at the laptop (10.0.2.2 is the host machine as seen from the Android emulator).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

/** Test builds show "Sign in for testing"; the server must also allow it, and refuses to in production. */
export const TEST_SIGN_IN_BUILD = process.env.EXPO_PUBLIC_TEST_SIGN_IN === '1';

export const CLOUD_CONFIGURED = API_URL !== '';

/** Google OAuth web client id: the audience the API checks. Client ids are public; the secret is never in the app. */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
