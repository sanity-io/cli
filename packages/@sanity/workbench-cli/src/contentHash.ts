/**
 * SHA-256 of a string, as hex, via the Web Crypto API — available in both Node
 * and the browser. Its callers (`appId`, `deriveInterfaces`) reach the browser,
 * so this can't use `node:crypto`.
 */
export async function contentHash(input: string): Promise<string> {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- the Web Crypto global is available on our Node target and in the browser
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
