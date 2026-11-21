export interface Config {
  /** Google OAuth client ids whose ID tokens we accept (the Android and web clients). */
  googleClientIds: string[];
  /** HMAC secret for access tokens, at least 32 bytes. */
  accessTokenSecret: Uint8Array;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config & { databaseUrl: string; port: number } {
  const missing = ['DATABASE_URL', 'GOOGLE_CLIENT_IDS', 'ACCESS_TOKEN_SECRET'].filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const secret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
  if (secret.length < 32) throw new Error('ACCESS_TOKEN_SECRET must be at least 32 characters');
  return {
    databaseUrl: env.DATABASE_URL!,
    port: Number(env.PORT ?? 3000),
    googleClientIds: env.GOOGLE_CLIENT_IDS!.split(',').map((s) => s.trim()).filter(Boolean),
    accessTokenSecret: secret,
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlDays: 60,
  };
}
