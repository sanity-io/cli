/**
 * Topic Alias Configuration
 *
 * Maps canonical topic names to their aliases. Used by:
 * - The command_not_found hook (runtime alias resolution)
 * - Programmatic CLI invocation
 * - Help rendering
 * - The check-topic-aliases script (build-time validation)
 *
 * Every topic with aliases must be listed here. The key is the canonical
 * topic name (the actual directory under commands/), and values are
 * alternative names that should resolve to it.
 *
 * Convention: prefer plural canonical names with singular aliases.
 *   datasets: ['dataset']     - "sanity dataset create" works
 *   cors: []                  - no alias needed (no natural singular/plural pair)
 *
 * While the config technically supports any direction, keeping it consistent
 * (plural to singular) makes the CLI predictable for users.
 */
export const topicAliases: Record<string, string[]> = {
  assets: ['asset'],
  backups: ['backup'],
  blueprints: ['blueprint'],
  datasets: ['dataset'],
  documents: ['document'],
  functions: ['function'],
  hooks: ['hook'],
  migrations: ['migration'],
  organizations: ['organization', 'organisations', 'organisation', 'org', 'orgs'],
  projects: ['project'],
  schemas: ['schema'],
  tokens: ['token'],
  users: ['user'],
}

const canonicalTopicByAlias = new Map(
  Object.entries(topicAliases).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [alias, canonical]),
  ),
)

/**
 * Resolve the topic portion of a command ID from an alias to its canonical name.
 * Handles both bare topics (`hook`) and colon-separated command IDs (`hook:list`).
 *
 * @internal
 */
export function resolveTopicAlias(id: string): string | undefined {
  const separatorIndex = id.indexOf(':')
  const topic = separatorIndex === -1 ? id : id.slice(0, separatorIndex)
  const canonical = canonicalTopicByAlias.get(topic)
  if (!canonical) return undefined

  const suffix = separatorIndex === -1 ? '' : id.slice(separatorIndex)
  return `${canonical}${suffix}`
}

/**
 * Resolve the first positional topic in argv, preserving flags and arguments.
 *
 * @internal
 */
export function resolveTopicAliasInArgv(argv: string[]): string[] {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') break
    if (arg.startsWith('-')) continue

    const resolvedTopic = resolveTopicAlias(arg)
    if (resolvedTopic) {
      const resolved = [...argv]
      resolved[i] = resolvedTopic
      return resolved
    }
    break
  }
  return argv
}
