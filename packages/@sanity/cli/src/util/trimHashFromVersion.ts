/**
 * `2.27.3-cookieless-auth.34+8ba9c1504` →
 * `2.27.3-cookieless-auth.34`
 */
export function trimHashFromVersion(version: string) {
  return version.replace(/\+[a-z0-9]{8,}$/, '')
}
