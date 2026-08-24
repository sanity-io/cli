/**
 * The qualified, globally-unique handle for an application: `sanity/<name>` for
 * singletons (always Sanity-owned), `<organizationId>/<name>` otherwise. Mirrors
 * brett's server-side composition so a locally served app carries the same
 * reference the deployed one would — the CLI is the authority for local apps,
 * which never reach brett.
 * @public
 */
export function applicationReference(app: {
  isSingleton: boolean
  name: string
  organizationId: string
}): string {
  return `${app.isSingleton ? 'sanity' : app.organizationId}/${app.name}`
}
