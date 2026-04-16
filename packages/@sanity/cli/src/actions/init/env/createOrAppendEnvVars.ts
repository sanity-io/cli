import {styleText} from 'node:util'

import {Output} from '@sanity/cli-core'

import {InitError} from '../initError.js'
import {VersionedFramework} from '../types.js'
import {writeEnvVarsToFile} from './writeEnvVarsToFile.js'

interface CreateOrAppendEnvVarsOptions {
  envVars: Record<string, string>
  filename: string
  framework: VersionedFramework | null
  log: boolean
  output: Output
  outputPath: string
}

export async function createOrAppendEnvVars({
  envVars,
  filename,
  framework,
  log,
  output,
  outputPath,
}: CreateOrAppendEnvVarsOptions) {
  try {
    if (framework && framework.envPrefix && log) {
      output.log(
        `\nDetected framework ${styleText('blue', framework?.name ?? '')}, using prefix '${
          framework.envPrefix
        }'`,
      )
    }

    await writeEnvVarsToFile({
      envVars,
      filename,
      framework,
      log,
      output,
      outputPath,
    })
  } catch (err) {
    output.error(err)
    throw new InitError('An error occurred while creating .env')
  }
}
