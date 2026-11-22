import { JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';

export interface GoogleIdentity {
  sub: string;
  email: string | null;
}

export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity>;

export class InvalidGoogleTokenError extends Error {
  constructor(reason: string) {
    super(`Google sign-in failed: ${reason}`);
    this.name = 'InvalidGoogleTokenError';
  }
}

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/**
 * Verifies a Google ID token from Credential Manager: signature against Google's published keys, issuer, audience
 * (one of our client ids), expiry, and a verified email. `keys` is injectable so tests can sign their own tokens.
 */
export function googleVerifier(clientIds: string[], keys: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))): GoogleVerifier {
  return async (idToken) => {
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, keys, { issuer: GOOGLE_ISSUERS, audience: clientIds, clockTolerance: 30 }));
    } catch (error) {
      throw new InvalidGoogleTokenError(error instanceof Error ? error.message : 'invalid token');
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new InvalidGoogleTokenError('no subject');
    if (payload.email !== undefined && payload.email_verified !== true) throw new InvalidGoogleTokenError('email not verified');
    return { sub: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
  };
}
