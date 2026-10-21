import path from 'node:path'

import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'

import {createAppFunctionTransport} from '../../services/appFunctionTransport.js'
import {type AppFunctionManifest} from './appFunctionManifest.js'

export async function deployAppFunctions({
  manifest,
  output,
  stackId,
  workDir,
}: {
  manifest: AppFunctionManifest
  output: Output
  stackId: string
  workDir: string
}): Promise<void> {
  // This is a package export; doImport only accepts filesystem paths.
  // eslint-disable-next-line no-restricted-syntax
  const {deployFunctions} = await import('@sanity/runtime-cli/functions/deploy')
  const transport = await createAppFunctionTransport()
  const result = await deployFunctions({
    ...transport,
    appId: manifest.appId,
    functions: manifest.functions.map(({name}) => ({
      name,
      src: path.join('.sanity', 'functions', name),
    })),
    log: (message) => output.log(message),
    organizationId: manifest.organizationId,
    stackId,
    workDir,
  })
  if (!result.success) {
    throw new CLIError(
      `App function deployment: ${result.error}\nInspect stack ${stackId} with sanity blueprints info --stack-id ${stackId} --organization-id ${manifest.organizationId}.`,
      {exit: result.exitCode ?? 1},
    )
  }
}
