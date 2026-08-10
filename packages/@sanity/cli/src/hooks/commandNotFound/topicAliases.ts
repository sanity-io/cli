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
 * 3. If no: fall back to oclif plugin-not-found's "did you mean?" behavior
 */

import {type Hook, toStandardizedId} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'

import {resolveTopicAlias} from '../../topicAliases.js'

const debug = subdebug('hooks:topicAliases')

const hook: Hook.CommandNotFound = async function (opts) {
  const {config, id} = opts

  // Standardize the ID (handles topic separator differences)
  const standardId = toStandardizedId(id, config)
  const parts = standardId.split(':')
  const rewrittenId = resolveTopicAlias(standardId)

  const aliasExists =
    rewrittenId &&
    (parts.length === 1 ? config.findTopic(rewrittenId) : config.findCommand(rewrittenId))
  if (aliasExists) {
    debug('Rewriting topic: %s -> %s', parts[0], rewrittenId.split(':')[0])

    // Bare topic (eg "sanity dataset" with no subcommand) -> show topic help
    if (parts.length === 1) {
      return config.runCommand('help', [rewrittenId])
    }

    // Full command (eg "sanity dataset create") -> run the resolved command
    return config.runCommand(rewrittenId, opts.argv ?? [])
  }

  // No alias match - fall back to oclif plugin-not-found's "did you mean?" behavior
  // eslint-disable-next-line no-restricted-syntax -- package import, not a file path
  const {default: notFoundHook} = await import('@oclif/plugin-not-found')
  return notFoundHook.call(this, opts)
}

export default hook
