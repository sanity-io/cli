import path from 'node:path'

import {input} from '@sanity/cli-core/ux'

import {absolutify, validateEmptyPath} from '../../../util/fsUtils.js'

export async function getProjectOutputPath({
  initFramework,
  outputPath,
  sluggedName,
  unattended,
  useEnv,
  workDir,
}: {
  initFramework: boolean
  outputPath: string | undefined
  sluggedName: string
  unattended: boolean
  useEnv: boolean
  workDir: string
}): Promise<string> {
  const specifiedPath = outputPath && path.resolve(outputPath)
  if (unattended || specifiedPath || useEnv || initFramework) {
    return specifiedPath || workDir
  }

  const inputPath = await input({
    default: path.join(workDir, sluggedName),
    message: 'Project output path:',
    validate: validateEmptyPath,
  })

  return absolutify(inputPath)
}
