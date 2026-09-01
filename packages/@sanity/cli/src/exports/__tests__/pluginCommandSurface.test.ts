import {fileURLToPath} from 'node:url'

import {Config} from '@oclif/core'
import {beforeAll, describe, expect, test} from 'vitest'

import {resolveCommandPolicies} from '../invokeSanityCli/commandPolicies/index.js'

/**
 * A record of every command the CLI's plugins contribute.
 *
 * Plugin commands are denied unless the plugin declares a policy for them, so
 * nothing here is reachable by a programmatic caller today. The point of the
 * snapshot is that additions become visible: a plugin release that adds a
 * command, or adds a flag to one already exposed, shows up as a diff to
 * review rather than arriving silently. That second case is the one that
 * matters most — a new flag can turn an already-allowed command into one that
 * reads from the host.
 *
 * When this snapshot changes, check whether the new surface should be exposed
 * (which is the plugin's call to declare, see `PluginInvocationPolicies`) and
 * whether anything newly allowed needs a veto in `pluginOverlay.ts`.
 *
 * Hidden commands are included deliberately. Being hidden keeps a command out
 * of help listings but does not stop it being declared allowed and invoked, so
 * it belongs in the surface this tracks — a hidden command arriving unnoticed
 * is exactly what this guards against.
 */

/** oclif's own help command never reaches dispatch — `isHelpRequest`
 * intercepts it and renders policy-scoped help instead — so it is not part of
 * the surface this file tracks. */
const NOT_DISPATCHED = new Set(['help'])

let config: Config

beforeAll(async () => {
  config = await Config.load(fileURLToPath(new URL('../../..', import.meta.url)))
})

function pluginCommands() {
  return config.commands.filter(
    (command) => command.pluginName !== config.pjson.name && !NOT_DISPATCHED.has(command.id),
  )
}

describe('plugin-contributed command surface', () => {
  test('matches the recorded surface', () => {
    const surface: Record<string, Record<string, string[]>> = {}

    for (const command of pluginCommands().toSorted((a, b) => (a.id < b.id ? -1 : 1))) {
      const plugin = (surface[command.pluginName ?? 'unknown'] ??= {})
      plugin[command.id] = Object.keys(command.flags ?? {}).toSorted()
    }

    expect(surface).toMatchSnapshot()
  })

  test('no plugin command is invokable, because none has declared a policy', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')
    const exposed = pluginCommands()
      .filter((command) => policies[command.id] !== undefined)
      .map((command) => command.id)

    expect(exposed).toEqual([])
  })

  test('every policy entry is attributed to the package that declared it', async () => {
    const policies = await resolveCommandPolicies(config, 'mcp')
    const unattributed = Object.entries(policies)
      .filter(([, policy]) => !policy.declaredBy)
      .map(([id]) => id)

    expect(unattributed).toEqual([])
  })
})
