/**
 * Config loading and the isolated-execution capability check, shared by
 * `invokeSanityCli` (execution) and `getMcpToolDefinitions` (advertisement)
 * so the two cannot disagree about what is invokable.
 */
import {fileURLToPath} from 'node:url'

import {type Command, Config} from '@oclif/core'
import {type SanityCommand} from '@sanity/cli-core/SanityCommand'

export type InvokableCommand = Pick<SanityCommand<typeof Command>, 'runInExecutionContext'>

/**
 * Whether a command can run in isolation, which in practice means it extends
 * `SanityCommand`: only that base class routes output, token resolution,
 * interactivity, and project discovery through the CLI execution context.
 *
 * This is a capability check, not a policy check. A plugin can declare a
 * policy for a command that still extends oclif's `Command` directly, and
 * such a command must not run here — the policy says the invocation is safe,
 * but nothing would hold it to the isolation guarantees that assessment
 * assumes.
 */
export function supportsIsolatedExecution(CommandClass: Command.Class): boolean {
  const prototype = CommandClass.prototype as Partial<InvokableCommand> | undefined
  return typeof prototype?.runInExecutionContext === 'function'
}

/**
 * Load the oclif `Config` for this package, needed to resolve, load, and run
 * commands. Loading it once and reusing it across invocations avoids
 * re-reading the command manifest per call. It only reads this package's own
 * installed files — process-lifetime initialization, not per-invocation host
 * state — so it happens outside any execution context.
 *
 * `userPlugins: false` keeps this surface to the plugins this package ships
 * with. oclif otherwise loads whatever `<dataDir>/package.json` lists.
 */
function loadCliCommandConfig(): Promise<Config> {
  return Config.load({root: fileURLToPath(import.meta.url), userPlugins: false})
}

let cachedConfig: Promise<Config> | undefined

export function cachedCliCommandConfig(): Promise<Config> {
  return (cachedConfig ??= loadCliCommandConfig())
}
