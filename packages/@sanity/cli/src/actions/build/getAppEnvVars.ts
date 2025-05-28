/**
 * Get all `SANITY_APP_` prefix env vars
 *
 * @internal
 */
export function getAppEnvVars(env: Record<string, string | undefined> = process.env): string[] {
  return Object.keys(env).filter((key) => key.toUpperCase().startsWith('SANITY_APP_'))
}
