/** Mirrors brett's `STUDIO_APP_HOST_PATTERN`, which rejects anything else on create. */
export const APP_SLUG_PATTERN = /^[a-z][a-z0-9-]*[a-z0-9]$/

export function toAppSlug(value: string): string | null {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
  return APP_SLUG_PATTERN.test(slug) ? slug : null
}
