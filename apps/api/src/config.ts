export interface Config {
  /** Google OAuth client ids whose ID tokens we accept (the Android and web clients). */
  googleClientIds: string[];
  /** HMAC secret for access tokens, at least 32 bytes. */
  accessTokenSecret: Uint8Array;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  /**
   * Sign in by name, no Google, for local testing on an emulator. Refused at start-up when NODE_ENV is production, so a
   * real deployment can't be left open by a stray environment variable.
   */
  testSignIn?: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config & { databaseUrl: string; migrationDatabaseUrl: string; port: number } {
  const testSignIn = env.TEST_SIGN_IN === 'true';
  if (testSignIn && env.NODE_ENV === 'production') throw new Error('TEST_SIGN_IN must never be enabled in production');
  const required = ['DATABASE_URL', 'ACCESS_TOKEN_SECRET', ...(testSignIn ? [] : ['GOOGLE_CLIENT_IDS'])];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const secret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
  if (secret.length < 32) throw new Error('ACCESS_TOKEN_SECRET must be at least 32 characters');
  return {
    databaseUrl: env.DATABASE_URL!,
    // Neon's DATABASE_URL goes through PgBouncer in transaction mode; migrations take the direct connection instead.
    migrationDatabaseUrl: env.DATABASE_URL_UNPOOLED || env.DATABASE_URL!,
    port: Number(env.PORT ?? 3000),
    googleClientIds: (env.GOOGLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    accessTokenSecret: secret,
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlDays: 60,
    testSignIn,
  };
}
