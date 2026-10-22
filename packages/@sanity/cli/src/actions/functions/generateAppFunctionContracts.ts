import {existsSync} from 'node:fs'
import path from 'node:path'

import {type FunctionContract} from '@sanity/runtime-cli/functions/contracts'

import {readAppFunctionState} from './appFunctionState.js'
import {discoverAppFunctions} from './discoverAppFunctions.js'

/** Generate app-local types and validators without authenticating or executing handlers. */
export async function generateAppFunctionContracts(
  workDir: string,
  checkTypes = false,
): Promise<FunctionContract[]> {
  const functions = await discoverAppFunctions(workDir)
  if (
    functions.length === 0 &&
    !existsSync(path.join(workDir, 'sanity.functions.d.ts')) &&
    !(await readAppFunctionState(workDir))
  ) {
    return []
  }
  // Package export; doImport accepts filesystem paths.
  // eslint-disable-next-line no-restricted-syntax
  const runtime = await import('@sanity/runtime-cli/functions/contracts')
  const {checkFunctionTypes, generateFunctionContracts, writeFunctionContracts} = runtime
  const contracts = await generateFunctionContracts({functions, workDir})
  await writeFunctionContracts(workDir, contracts)
  if (checkTypes) checkFunctionTypes(workDir)
  return contracts
}
