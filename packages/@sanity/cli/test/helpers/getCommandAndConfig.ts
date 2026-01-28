import {resolve} from 'node:path'

import {Config} from '@oclif/core'

/**
 * Gets the command and config for a given command
 *
 * @param cmd - The command to get the command and config for
 * @returns
 */
export async function getCommandAndConfig(cmd: string) {
  // Root of the CLI monorepo
  const config = await Config.load({
    root: resolve(import.meta.dirname, '../../'),
  })
  // Disable auto-transpile. This is injected by oclif core https://github.com/oclif/core/blob/main/src/settings.ts#L40
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oclif = (globalThis as any).oclif
  if (oclif && typeof oclif === 'object') {
    oclif.enableAutoTranspile = false
  } else {
    throw new Error('`globalThis.oclif` not defined - unable to disable auto-transpilation')
  }
  const res = await config.findCommand(cmd)

  if (!res) {
    throw new Error(`Command ${cmd} not found`)
  }

  return {
    Command: await res.load(),
    config,
  }
}
