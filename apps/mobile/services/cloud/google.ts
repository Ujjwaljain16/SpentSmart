import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@/lib/cloud-config';

let configured = false;

/**
 * Google's account picker, returning an ID token for our server to verify. The token's audience is the web client
 * id, which is what the API checks (GOOGLE_CLIENT_IDS). Returns null when the user backs out.
 */
export async function googleIdToken(): Promise<string | null> {
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Google sign-in isn’t set up in this build.');
  if (!configured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, scopes: ['email', 'profile'] });
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new Error('Google didn’t return a sign-in token. Try again.');
    return response.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Google Play services is needed to sign in with Google.');
    }
    throw e;
  }
}

/** Forget the Google account choice so the next sign-in shows the picker again. */
export async function googleSignOut(): Promise<void> {
  try {
    if (configured) await GoogleSignin.signOut();
  } catch {
    // Signing out of SpentSmart must not depend on Google's side succeeding.
  }
}
