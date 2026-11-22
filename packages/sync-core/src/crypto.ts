import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { fromBase32, fromBase64, toBase32, toBase64, utf8 } from './encoding';

/** Source of secure random bytes: `crypto.getRandomValues` on Node, expo-crypto on the phone. */
export type RandomBytes = (length: number) => Uint8Array;

const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const CHECK_CHARS = 2;

export class WrongKeyError extends Error {
  constructor(message = 'This key does not open the data.') {
    super(message);
    this.name = 'WrongKeyError';
  }
}

export class InvalidRecoveryKeyError extends Error {
  constructor() {
    super('That recovery key has a typo. Check each group of four.');
    this.name = 'InvalidRecoveryKeyError';
  }
}

export function generateKey(random: RandomBytes): Uint8Array {
  const key = random(KEY_BYTES);
  if (key.length !== KEY_BYTES) throw new Error('Random source returned the wrong length');
  return key;
}

/** Two check characters so a mistyped recovery key is caught before it's tried against the wrapped key. */
function checkChars(key: Uint8Array): string {
  return toBase32(sha256(key)).slice(0, CHECK_CHARS);
}

/** 32 bytes as 52 base32 characters plus 2 check characters, in groups of four: "7KQ2-…". */
export function formatRecoveryKey(key: Uint8Array): string {
  const text = toBase32(key) + checkChars(key);
  return text.match(/.{1,4}/g)!.join('-');
}

export function parseRecoveryKey(text: string): Uint8Array {
  const normalized = text.toUpperCase().replace(/[\s-]/g, '');
  const body = normalized.slice(0, -CHECK_CHARS);
  const check = normalized.slice(-CHECK_CHARS).replace(/[IL]/g, '1').replace(/O/g, '0');
  let key: Uint8Array;
  try {
    key = fromBase32(body, KEY_BYTES);
  } catch {
    throw new InvalidRecoveryKeyError();
  }
  if (body.length !== 52 || checkChars(key) !== check) throw new InvalidRecoveryKeyError();
  return key;
}

function seal(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array, random: RandomBytes): string {
  const nonce = random(NONCE_BYTES);
  const ct = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
  const out = new Uint8Array(NONCE_BYTES + ct.length);
  out.set(nonce);
  out.set(ct, NONCE_BYTES);
  return toBase64(out);
}

function open(key: Uint8Array, sealed: string, aad: Uint8Array): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(sealed);
  } catch {
    throw new WrongKeyError('The data is damaged.');
  }
  if (bytes.length < NONCE_BYTES + 16) throw new WrongKeyError('The data is damaged.');
  try {
    return xchacha20poly1305(key, bytes.subarray(0, NONCE_BYTES), aad).decrypt(bytes.subarray(NONCE_BYTES));
  } catch {
    throw new WrongKeyError();
  }
}

function wrappingKey(recoveryKey: Uint8Array, userId: string): Uint8Array {
  return hkdf(sha256, recoveryKey, utf8.encode(userId), utf8.encode('spentsmart/wrap/v1'), KEY_BYTES);
}

const wrapAad = (userId: string) => utf8.encode(`spentsmart/data-key|${userId}`);

/** The data key encrypted under the recovery key. This is what the server keeps. */
export function wrapDataKey(dataKey: Uint8Array, recoveryKey: Uint8Array, userId: string, random: RandomBytes): string {
  return seal(wrappingKey(recoveryKey, userId), dataKey, wrapAad(userId), random);
}

export function unwrapDataKey(wrapped: string, recoveryKey: Uint8Array, userId: string): Uint8Array {
  const key = open(wrappingKey(recoveryKey, userId), wrapped, wrapAad(userId));
  if (key.length !== KEY_BYTES) throw new WrongKeyError();
  return key;
}

export interface RecordAddress {
  userId: string;
  collection: string;
  recordId: string;
}

// The address is bound into the ciphertext: a server that moves a ciphertext to another record or user makes it
// fail to decrypt instead of silently showing the wrong data.
const recordAad = (a: RecordAddress) => utf8.encode(`spentsmart/record|${a.userId}|${a.collection}|${a.recordId}`);

export function encryptRecord(dataKey: Uint8Array, address: RecordAddress, value: unknown, random: RandomBytes): string {
  return seal(dataKey, utf8.encode(JSON.stringify(value)), recordAad(address), random);
}

export function decryptRecord<T = unknown>(dataKey: Uint8Array, address: RecordAddress, sealed: string): T {
  return JSON.parse(utf8.decode(open(dataKey, sealed, recordAad(address)))) as T;
}
