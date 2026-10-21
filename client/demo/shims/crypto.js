// Hachage simplifié, suffisant pour une démo locale (le vrai serveur utilise scrypt).
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
globalThis.Buffer ??= { from: (h) => ({ length: h.length / 2, hex: h }) };

export const randomBytes = (n) => ({ toString: () => hex(n) });
export function scryptSync(pw, salt, len) {
  let h = 2166136261, out = '';
  const s = `${salt}:${pw}`;
  while (out.length < len * 2) {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  out = out.slice(0, len * 2);
  return { length: len, hex: out, toString: () => out };
}
export const timingSafeEqual = (a, b) => a.hex === b.hex;
