/**
 * Topic Alias Configuration
 *
 * Maps canonical topic names to their aliases. Used by:
 * - The command_not_found hook (runtime alias resolution)
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
  backups: ['backup'],
  blueprints: ['blueprint'],
  datasets: ['dataset'],
  documents: ['document'],
  functions: ['function'],
  hooks: ['hook'],
  projects: ['project'],
  schemas: ['schema'],
  tokens: ['token'],
  users: ['user'],
}
