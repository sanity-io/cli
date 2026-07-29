/**
 * Hook: Topic Alias Resolution + Command Not Found
 *
 * Replaces oclif plugin-not-found as a plugin, calling it as a fallback instead.
 * This avoids a race condition where both hooks run concurrently via Promise.all.
 *
 * This hook only fires for names oclif doesn't recognize. Registered topics
 * and commands (including hiddenAliases) are resolved by oclif before this runs.
 *
 * Flow:
 * 1. Check if the unrecognized name is a known alias (eg "dataset" for "datasets")
 * 2. If yes: rewrite and run the resolved command (or show topic help for bare topics)
 * 3. If no, and the invocation is unattended (non-interactive terminal, or
 *    --yes/--json in argv): warn and error out without prompting
 * 4. Otherwise: fall back to oclif plugin-not-found's "did you mean?" behavior
 */

import {type Hook, toConfiguredId, toStandardizedId} from '@oclif/core'
import {isInteractive, subdebug} from '@sanity/cli-core'

import {topicAliases} from '../../topicAliases.js'

const debug = subdebug('hooks:topicAliases')

// Flags that request unattended behavior. The typo'd command never parses its
// flags (it doesn't exist), so we scan the raw argv tokens instead.
const unattendedFlags = new Set(['--json', '--yes', '-y'])

// Build a lookup from alias names to candidate topics.
// This hook only fires for names oclif doesn't recognize. Since canonical
// topics (eg "datasets") are registered and resolved by oclif directly,
// only aliases (eg "dataset") reach here. We still map both directions
// so the hook is resilient to future renames or plugin-provided topics
// where the canonical name may not be a registered topic.
const topicMappings = new Map<string, string[]>()
for (const [canonical, aliases] of Object.entries(topicAliases)) {
  // canonical -> all aliases
  topicMappings.set(canonical, aliases)
  // each alias -> [canonical]
  for (const alias of aliases) {
    topicMappings.set(alias, [canonical])
  }
}

const hook: Hook.CommandNotFound = async function (opts) {
  const {config, id} = opts

  // Standardize the ID (handles topic separator differences)
  const standardId = toStandardizedId(id, config)
  const parts = standardId.split(':')
  const topic = parts[0]

  const candidates = topicMappings.get(topic)
  if (candidates) {
    // Find which candidate topic actually has commands registered
    const resolvedTopic = candidates.find((candidate) =>
      parts.length === 1
        ? config.findTopic(candidate)
        : config.findCommand([candidate, ...parts.slice(1)].join(':')),
    )

    if (resolvedTopic) {
      debug('Rewriting topic: %s -> %s', topic, resolvedTopic)

      // Bare topic (eg "sanity dataset" with no subcommand) -> show topic help
      if (parts.length === 1) {
        return config.runCommand('help', [resolvedTopic])
      }

      // Full command (eg "sanity dataset create") -> run the resolved command
      const rewrittenId = [resolvedTopic, ...parts.slice(1)].join(':')
      return config.runCommand(rewrittenId, opts.argv ?? [])
    }
  }

  // No alias match. plugin-not-found's "did you mean?" prompt guards on a bare
  // `process.stdin.isTTY` check, which is looser than our unattended semantics:
  // it would still prompt (blocking for its 10s timeout) under CI, TERM=dumb,
  // or when the user passed --yes/--json. In those cases, skip the prompt and
  // emit the same warning + help pointer the plugin prints for non-TTY stdin.
  const argv = opts.argv ?? []
  if (!isInteractive() || argv.some((arg) => unattendedFlags.has(arg))) {
    debug('Unattended invocation, skipping "did you mean?" prompt for: %s', standardId)
    this.warn(`${toConfiguredId(standardId, config)} is not a ${config.bin} command.`)
    const binHelp = config.findTopic(topic) ? `${config.bin} help ${topic}` : `${config.bin} help`
    return this.error(`Run ${binHelp} for a list of available commands.`, {exit: 127})
  }

  // Interactive terminal - fall back to plugin-not-found's "did you mean?" behavior
  // eslint-disable-next-line no-restricted-syntax -- package import, not a file path
  const {default: notFoundHook} = await import('@oclif/plugin-not-found')
  return notFoundHook.call(this, opts)
}

export default hook
