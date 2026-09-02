/**
 * Builds the effective policy table for one invocation source, combining what
 * this CLI declares for its own commands with what each plugin declares for
 * the commands it contributes.
 *
 * The table is deny-by-default in both directions: a command with no entry is
 * denied by the caller (`policySet[id] ?? deny`), and every step here that
 * cannot establish permission simply omits an entry rather than falling back
 * to something permissive.
 */
import {resolve} from 'node:path'

import {type Config, type Interfaces} from '@oclif/core'
import {
  type CommandPolicy,
  type CommandPolicySet,
  deny,
  type InvocationSource,
  isCommandPolicySet,
} from '@sanity/cli-core/commandPolicy'
import {subdebug} from '@sanity/cli-core/debug'
import {doImport} from '@sanity/cli-core/util'

import {mcpPolicy} from './mcpPolicy.js'
import {deniedPluginCommands, deniedPlugins} from './pluginOverlay.js'

const debug = subdebug('commandPolicies')

/** Policies this CLI declares for its own commands, by invocation source. */
export const commandPolicies: Record<InvocationSource, CommandPolicySet> = {
  mcp: mcpPolicy,
}

/**
 * Policy entries annotated with the package that declared each one. Merging
 * several sources makes provenance load-bearing: it decides whether the host
 * overlay applies, and it lets the tests attribute every entry.
 */
export type ResolvedCommandPolicySet = Readonly<
  Record<string, CommandPolicy & {declaredBy: string}>
>

type ResolvedCommandPolicy = ResolvedCommandPolicySet[string]

/**
 * Resolution reads plugin package.json files and imports their policy
 * modules, so it is async and depends on the loaded oclif config. Memoized
 * per config so that work happens once per process rather than per
 * invocation, and so a config supplied by a test gets its own entry.
 */
const cache = new WeakMap<Config, Map<InvocationSource, Promise<ResolvedCommandPolicySet>>>()

export function resolveCommandPolicies(
  config: Config,
  source: InvocationSource,
): Promise<ResolvedCommandPolicySet> {
  let bySource = cache.get(config)
  if (!bySource) {
    bySource = new Map()
    cache.set(config, bySource)
  }

  let resolved = bySource.get(source)
  if (!resolved) {
    resolved = buildCommandPolicies(config, source)
    bySource.set(source, resolved)
  }
  return resolved
}

async function buildCommandPolicies(
  config: Config,
  source: InvocationSource,
): Promise<ResolvedCommandPolicySet> {
  const hostName = config.pjson.name
  const entries: Record<string, ResolvedCommandPolicy> = {}

  for (const [id, policy] of Object.entries(commandPolicies[source])) {
    entries[id] = {...policy, declaredBy: hostName}
  }

  for (const plugin of config.plugins.values()) {
    if (plugin.name === hostName) continue

    // Only plugins this CLI declares itself may speak. oclif loads plugins
    // recursively, so a dependency of a plugin also lands here — but it
    // arrives through a version range this package does not control, and
    // could start declaring policy without any diff to review here.
    if (plugin.parent) {
      debug(
        'ignoring %s, contributed by %s rather than declared here',
        plugin.name,
        plugin.parent.name,
      )
      continue
    }

    const declared = await loadPluginPolicies(plugin, source)
    if (!declared) continue

    // A plugin only speaks for the commands it actually contributes.
    // Otherwise declaring a policy for, say, `login` would be a way to grant
    // itself surface that belongs to another package.
    const contributed = new Set(plugin.commands.map((command) => command.id))

    for (const [id, policy] of Object.entries(declared)) {
      if (!contributed.has(id)) {
        debug('%s declared a policy for %s, which it does not contribute', plugin.name, id)
        continue
      }
      // Ids already claimed keep their existing declaration, mirroring
      // oclif's own first-one-wins command resolution.
      if (entries[id]) continue

      entries[id] = {...applyOverlay(id, policy, plugin.name), declaredBy: plugin.name}
    }
  }

  return entries
}

/** The host's veto over a plugin-declared entry. Only ever denies. */
function applyOverlay(id: string, policy: CommandPolicy, pluginName: string): CommandPolicy {
  const vetoed = deniedPlugins[pluginName] ?? deniedPluginCommands[id]
  if (!vetoed) return policy

  debug('denying %s from %s: %s', id, pluginName, vetoed)
  return deny
}

/**
 * Load the policy table a plugin declares for one invocation source, or
 * `undefined` when it declares none, points at a module that cannot be
 * loaded, or exports something that is not a policy table.
 *
 * Every failure is silent and non-fatal by design. A plugin's policy module
 * is third-party code resolved at runtime: it must not be able to take down
 * the whole invocation surface by throwing, and it must not be able to reach
 * a permissive outcome by being malformed. Returning `undefined` leaves the
 * plugin's commands uncategorized, which the caller treats as denied.
 */
async function loadPluginPolicies(
  plugin: Interfaces.Plugin,
  source: InvocationSource,
): Promise<CommandPolicySet | undefined> {
  const declaredPath = readInvocationPoliciesPath(plugin)
  if (!declaredPath) return undefined

  try {
    const loaded: unknown = await doImport(resolve(plugin.root, declaredPath))
    const policies = (loaded as {invocationPolicies?: unknown}).invocationPolicies

    if (typeof policies !== 'object' || policies === null) {
      debug('%s policy module has no usable `invocationPolicies` export', plugin.name)
      return undefined
    }

    const forSource = (policies as Record<string, unknown>)[source]
    if (forSource === undefined) return undefined

    if (!isCommandPolicySet(forSource)) {
      debug('%s declared a malformed policy table for %s', plugin.name, source)
      return undefined
    }

    return forSource
  } catch (err) {
    debug('failed to load policy module for %s: %s', plugin.name, err)
    return undefined
  }
}

function readInvocationPoliciesPath(plugin: Interfaces.Plugin): string | undefined {
  const {sanity} = plugin.pjson as {sanity?: {invocationPolicies?: unknown}}
  const declared = sanity?.invocationPolicies
  return typeof declared === 'string' && declared !== '' ? declared : undefined
}
