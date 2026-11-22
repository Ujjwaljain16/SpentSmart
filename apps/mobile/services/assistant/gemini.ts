import { secureStore } from '@/services/cloud/secure-store';
import { GEMINI_MODELS, checkGeminiKey } from '@spentsmart/assistant/gemini';

const KEY = 'gemini_api_key';

/** The user's own Gemini API key. Keystore-backed, this phone only, never synced or backed up. */
export const geminiKey = {
  get: () => secureStore.get(KEY),
  async set(key: string): Promise<void> {
    await secureStore.set(KEY, key.trim());
  },
  remove: () => secureStore.delete(KEY),
};

/** Keys from Google AI Studio start with "AIza"; catch obvious paste mistakes before a network call. */
export function looksLikeGeminiKey(key: string): boolean {
  return /^AIza[0-9A-Za-z_-]{30,}$/.test(key.trim());
}

/** Check a key against the chosen model, then store it. Throws a GeminiError with a readable message. */
export async function saveGeminiKey(key: string, model: string): Promise<void> {
  await checkGeminiKey(key.trim(), model, fetch);
  await geminiKey.set(key);
}

export const geminiModelLabel = (id: string) => GEMINI_MODELS.find((m) => m.id === id)?.label ?? id;
