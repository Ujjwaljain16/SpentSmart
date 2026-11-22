const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Map([...B64].map((c, i) => [c, i]));

/** Standard base64 with padding. Written out because neither Hermes nor Node agree on a shared byte helper. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) throw new Error('Invalid base64');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | B64_LOOKUP.get(ch)!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

/** Crockford base32: no I, L, O or U, so a hand-copied key survives 1/I and 0/O mix-ups. */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function toBase32(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
  return out;
}

export function fromBase32(text: string, byteLength: number): Uint8Array {
  const normalized = text.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  const out = new Uint8Array(byteLength);
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const ch of normalized) {
    const v = B32.indexOf(ch);
    if (v === -1) throw new Error('Invalid character');
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8 && o < byteLength) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
    buffer &= (1 << bits) - 1;
  }
  if (o !== byteLength) throw new Error('Too short');
  return out;
}

/** UTF-8 by hand: Hermes on Android doesn't reliably provide TextDecoder, and this runs on the phone. */
export const utf8 = {
  encode(s: string): Uint8Array {
    const out: number[] = [];
    for (const ch of s) {
      const c = ch.codePointAt(0)!;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  },
  decode(b: Uint8Array): string {
    let s = '';
    for (let i = 0; i < b.length; ) {
      const x = b[i]!;
      let c: number;
      if (x < 0x80) c = b[i++]!;
      else if (x < 0xe0) c = ((x & 31) << 6) | (b[i + 1]! & 63), (i += 2);
      else if (x < 0xf0) c = ((x & 15) << 12) | ((b[i + 1]! & 63) << 6) | (b[i + 2]! & 63), (i += 3);
      else c = ((x & 7) << 18) | ((b[i + 1]! & 63) << 12) | ((b[i + 2]! & 63) << 6) | (b[i + 3]! & 63), (i += 4);
      s += String.fromCodePoint(c);
    }
    return s;
  },
};
