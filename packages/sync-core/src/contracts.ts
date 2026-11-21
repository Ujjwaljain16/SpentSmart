import { z } from 'zod';

/** What can be synced. The server only uses this to validate the name; it never sees what's inside. */
export const COLLECTIONS = ['transactions', 'accounts', 'categories', 'budgets', 'goals', 'settings'] as const;
export type Collection = (typeof COLLECTIONS)[number];

const uuid = z.string().uuid();
/** Base64 ciphertext. 64 KB is far above any real record and stops one request from filling the database. */
const ciphertext = z.string().min(1).max(64 * 1024).regex(/^[A-Za-z0-9+/]+=*$/);

export const pushOp = z.object({
  opId: uuid,
  collection: z.enum(COLLECTIONS),
  recordId: uuid,
  /** The version this change was made on top of; 0 for a record the server has never seen. */
  baseVersion: z.number().int().min(0),
  deleted: z.boolean(),
  ciphertext,
  keyVersion: z.number().int().min(1).default(1),
});
export type PushOp = z.infer<typeof pushOp>;

export const pushRequest = z.object({ ops: z.array(pushOp).min(1).max(200) });
export type PushRequest = z.infer<typeof pushRequest>;

export const pushResult = z.discriminatedUnion('status', [
  z.object({ opId: uuid, status: z.literal('applied'), version: z.number().int(), seq: z.number().int() }),
  /** Someone else changed the record first: pull, merge, push again on top of `currentVersion`. */
  z.object({ opId: uuid, status: z.literal('conflict'), currentVersion: z.number().int() }),
]);
export type PushResult = z.infer<typeof pushResult>;
export const pushResponse = z.object({ results: z.array(pushResult) });

export const pullQuery = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const remoteRecord = z.object({
  collection: z.enum(COLLECTIONS),
  recordId: uuid,
  version: z.number().int().min(1),
  deleted: z.boolean(),
  ciphertext,
  keyVersion: z.number().int(),
  seq: z.number().int(),
});
export type RemoteRecord = z.infer<typeof remoteRecord>;

export const pullResponse = z.object({
  records: z.array(remoteRecord),
  /** Pass back as `cursor` on the next pull. */
  cursor: z.number().int(),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof pullResponse>;

export const googleSignInRequest = z.object({
  idToken: z.string().min(20).max(4096),
  deviceName: z.string().trim().min(1).max(60),
});

export const refreshRequest = z.object({ refreshToken: z.string().min(20).max(200) });

export const tokenResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number().int(),
  userId: z.string(),
  deviceId: z.string(),
});
export type TokenResponse = z.infer<typeof tokenResponse>;

export const keyEnvelopeRequest = z.object({ wrappedKey: ciphertext });
export const keyEnvelopeResponse = z.object({ wrappedKey: z.string().nullable() });
