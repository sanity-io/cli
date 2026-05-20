import {existsSync, statSync} from 'node:fs'
import {extname, join, resolve} from 'node:path'

import {ProjectRootResult} from '@sanity/cli-core'

export interface ExtractOptions {
  configPath: string
  enforceRequiredFields: boolean
  format: string
  outputPath: string
  watchPatterns: string[]
  workspace: string | undefined
}

interface GetExtractOptions {
  enforceRequiredFields: boolean | undefined
  format: string
  path: string | undefined
  projectRoot: ProjectRootResult
  watchPatterns: string[] | undefined
  workspace: string | undefined
}

export function getExtractOptions(options: GetExtractOptions): ExtractOptions {
  const {
    enforceRequiredFields,
    format,
    path: pathFlag,
    projectRoot,
    watchPatterns,
    workspace,
  } = options
  let outputPath: string
  if (pathFlag) {
    const resolved = resolve(join(projectRoot.directory, pathFlag))
    const isExistingDirectory = existsSync(resolved) && statSync(resolved).isDirectory()

    outputPath =
      isExistingDirectory || !extname(resolved) ? join(resolved, 'schema.json') : resolved
  } else {
    outputPath = resolve(join(projectRoot.directory, 'schema.json'))
  }

  return {
    configPath: projectRoot.path,
    enforceRequiredFields: enforceRequiredFields ?? false,
    format: format ?? 'groq-type-nodes',
    outputPath,
    watchPatterns: watchPatterns ?? [],
    workspace,
  }
}
