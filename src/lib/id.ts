const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short, collision-resistant id (time prefix keeps them roughly sortable). */
export function uid(): string {
  let rand = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) rand += ALPHABET[b % 36];
  return Date.now().toString(36) + rand;
}
