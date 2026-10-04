const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function rnd(rand) {
  if (rand) return rand();
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${Math.floor(rnd() * 1e8).toString(36)}`;

/** Opaque pass token. The real backend stores only SHA-256(token). */
export function randomToken(rand) {
  let t = '';
  for (let i = 0; i < 32; i++) t += TOKEN_ALPHABET[Math.floor(rnd(rand) * 64)];
  return t;
}

/** Short human-typeable code printed under the QR, used for manual entry. */
export function passCode(rand) {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(rnd(rand) * CODE_ALPHABET.length)]).join('');
  return `GN-${part()}-${part()}`;
}

export function tempPassword() {
  return `Gn@${Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)]).join('')}`;
}
