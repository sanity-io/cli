const ORGANIZATION_PREFIXES = ['organization', 'organisations', 'organisation', 'org', 'orgs']

export function organizationAliases(action: string): string[] {
  return ORGANIZATION_PREFIXES.map((prefix) => `${prefix}:${action}`)
}
