import {type ensureFunctionStack as ensureRuntimeFunctionStack} from '@sanity/runtime-cli/functions/stack'

import {createAppFunctionTransport} from './appFunctionTransport.js'

/** Use runtime-cli's stack lifecycle with the CLI's authentication and API environment. */
export async function ensureAppFunctionStackResource(
  options: Omit<Parameters<typeof ensureRuntimeFunctionStack>[0], 'fetchFn' | 'token'>,
): ReturnType<typeof ensureRuntimeFunctionStack> {
  // Package export; doImport accepts filesystem paths.
  // eslint-disable-next-line no-restricted-syntax
  const {ensureFunctionStack} = await import('@sanity/runtime-cli/functions/stack')
  const transport = await createAppFunctionTransport()
  return ensureFunctionStack({...options, ...transport})
}
