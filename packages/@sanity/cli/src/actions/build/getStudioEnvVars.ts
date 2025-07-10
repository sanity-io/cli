/**
 * Get all `SANITY_STUDIO_` prefix env vars
 *
 * @internal
 */
export function getStudioEnvVars(env: Record<string, string | undefined> = process.env): string[] {
  return Object.keys(env).filter((key) => key.toUpperCase().startsWith('SANITY_STUDIO_'))
}
