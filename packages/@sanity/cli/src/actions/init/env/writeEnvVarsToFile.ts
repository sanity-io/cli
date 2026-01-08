import fs from 'node:fs/promises'
import path from 'node:path'

import {Output, subdebug} from '@sanity/cli-core'
import {chalk} from '@sanity/cli-core/ux'

import {VersionedFramework} from '../types.js'
import {parseAndUpdateEnvVars} from './parseAndUpdateEnvVars.js'

const debug = subdebug('init:writeEnvVarsToFile')

interface WriteEnvVarsToFileOptions {
  envVars: Record<string, string>
  filename: string
  framework: VersionedFramework | null
  log: boolean
  output: Output
  outputPath: string
}

export async function writeEnvVarsToFile({
  envVars,
  filename,
  framework,
  log,
  output,
  outputPath,
}: WriteEnvVarsToFileOptions) {
  const envPrefix = framework?.envPrefix || ''
  const keyPrefix = envPrefix.includes('SANITY') ? envPrefix : `${envPrefix}SANITY_`
  const fileOutputPath = path.join(outputPath, filename)

  // prepend framework and sanity prefix to envVars
  for (const key of Object.keys(envVars)) {
    envVars[`${keyPrefix}${key}`] = envVars[key]
    delete envVars[key]
  }

  // make folder if not exists (if output path is specified)
  await fs
    .mkdir(outputPath, {recursive: true})
    .catch(() => debug('Error creating folder %s', outputPath))

  // time to update or create the file
  const existingEnv = await fs
    .readFile(fileOutputPath, {encoding: 'utf8'})
    .catch((err) => (err.code === 'ENOENT' ? '' : Promise.reject(err)))

  const updatedEnv = parseAndUpdateEnvVars({
    envVars,
    fileContents: existingEnv,
    log,
    output,
  })

  const warningComment = [
    '# Warning: Do not add secrets (API keys and similar) to this file, as it source controlled!',
    '# Use `.env.local` for any secrets, and ensure it is not added to source control',
  ].join('\n')
  const shouldPrependWarning = filename !== '.env.local' && !existingEnv.includes(warningComment)
  if (shouldPrependWarning) {
    await fs.writeFile(fileOutputPath, `${warningComment}\n\n${updatedEnv}`, {
      encoding: 'utf8',
    })
    return
  }

  await fs.writeFile(fileOutputPath, updatedEnv, {
    encoding: 'utf8',
  })

  if (!log) {
    output.log(`\n${chalk.green('Success!')} Environment variables written to ${fileOutputPath}`)
  }
}
