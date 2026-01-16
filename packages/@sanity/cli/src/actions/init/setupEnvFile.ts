import {Output} from '@sanity/cli-core'

import {createOrAppendEnvVars} from './env/createOrAppendEnvVars.js'
import {VersionedFramework} from './types.js'

interface SetupEnvFileOptions {
  datasetName: string
  detectedFramework: VersionedFramework | null
  envFilename: string
  isNextJs: boolean
  output: Output
  outputPath: string
  projectId: string
  workDir: string
}

export async function setupEnvFile({
  datasetName,
  detectedFramework,
  envFilename,
  isNextJs,
  output,
  outputPath,
  projectId,
  workDir,
}: SetupEnvFileOptions) {
  const envVars = {
    DATASET: datasetName,
    PROJECT_ID: projectId,
  }

  await createOrAppendEnvVars({
    envVars,
    filename: envFilename,
    framework: detectedFramework,
    log: isNextJs,
    output: output,
    outputPath: isNextJs ? workDir : outputPath,
  })
}
