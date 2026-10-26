import {CLIError} from '@oclif/core/errors'
import {type FunctionStackOptions} from '@sanity/runtime-cli/functions/stack'

import {createAppFunctionTransport} from './appFunctionTransport.js'

type Identity = Pick<FunctionStackOptions, 'appId' | 'organizationId' | 'stackId'>

/** Adapt runtime-cli's cleanup operations to the CLI's authenticated transport. */
export async function createAppFunctionCleanupClient(log: (message: string) => void) {
  // Package export; doImport accepts filesystem paths.
  // eslint-disable-next-line no-restricted-syntax
  const runtime = await import('@sanity/runtime-cli/functions/stack')
  const transport = await createAppFunctionTransport()
  return {
    async destroy(identity: Identity & {stackId: string}) {
      const result = await runtime.destroyFunctionStack({...identity, ...transport, log})
      if (!result.success) {
        throw new CLIError(`App function cleanup: ${result.error}`, {exit: result.exitCode ?? 1})
      }
    },
    inspect: (identity: Identity) => runtime.inspectFunctionStack({...identity, ...transport}),
  }
}
