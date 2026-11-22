/**
 * A short, stable fingerprint of a captured message, so the same SMS or notification is never captured twice however
 * often its app re-posts it. Only this hash is stored, never the message text. cyrb53: fast, well spread, not
 * cryptographic (it only has to tell messages apart on one phone).
 */
export function messageFingerprint(source: string, text: string): string {
  const input = `${source}\n${text.replace(/\s+/g, ' ').trim()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
