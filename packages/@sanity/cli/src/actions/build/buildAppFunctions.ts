import {rm} from 'node:fs/promises'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {isStaging} from '@sanity/cli-core/util'
import {spinner} from '@sanity/cli-core/ux'
import {type FunctionContract} from '@sanity/runtime-cli/functions/contracts'

import {writeAppFunctionManifest} from '../functions/appFunctionManifest.js'
import {readAppFunctionState} from '../functions/appFunctionState.js'

/**
 * Compile app functions separately from the frontend bundle. Deployment can
 * package these directories in memory without exposing ZIPs in the app output.
 */
export async function buildAppFunctions({
  appId,
  contracts,
  dryRun,
  organizationId,
  output,
  stackId,
  workDir,
}: {
  appId: string | undefined
  contracts: FunctionContract[]
  dryRun: boolean
  organizationId: string | undefined
  output: Output
  stackId?: string
  workDir: string
}): Promise<void> {
  const outputDir = path.join(workDir, '.sanity', 'functions')
  const functions = contracts

  // Clear removed functions and any output left by a previous failed build.
  await rm(outputDir, {force: true, recursive: true})
  const saved = await readAppFunctionState(workDir)
  const hasBinding =
    saved?.appId === appId &&
    saved?.organizationId === organizationId &&
    saved?.environment === (isStaging() ? 'staging' : 'production')
  if (functions.length === 0 && !hasBinding) return
  if ((!appId || !organizationId) && !dryRun) {
    throw new Error(
      'App function setup is missing. Run sanity build to register the app and stack.',
    )
  }

  if (functions.length === 0) {
    if (appId && organizationId) {
      await writeAppFunctionManifest(workDir, {appId, functions: [], organizationId, stackId})
    }
    return
  }

  // Load the builder only for apps with functions. `doImport` accepts file paths,
  // whereas this import uses the runtime CLI's package export.
  // eslint-disable-next-line no-restricted-syntax
  const {buildFunction} = await import('@sanity/runtime-cli/functions/build')
  const spin = spinner('Building app functions').start()
  try {
    for (const contract of functions) {
      const {name, src} = contract
      spin.text = `Building app function ${name}`
      try {
        await buildFunction({
          contract,
          name,
          outDir: path.join(outputDir, name),
          src,
          workDir,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to build app function "${name}": ${message}`, {cause: error})
      }
    }
    if (appId && organizationId) {
      await writeAppFunctionManifest(workDir, {
        appId,
        functions: functions.map(({name}) => ({name})),
        organizationId,
        stackId,
      })
    }
    spin.succeed(`Built ${functions.length} app function${functions.length === 1 ? '' : 's'}`)
    output.log(`Function output: ${path.relative(workDir, outputDir)}`)
  } catch (error) {
    spin.fail()
    await rm(outputDir, {force: true, recursive: true})
    throw error
  }
}
