import {join, resolve} from 'node:path'

import {type CliConfig, ProjectRootResult} from '@sanity/cli-core'

import {type ExtractSchemaCommand} from '../../commands/schema/extract.js'

export interface ExtractOptions {
  configPath: string
  enforceRequiredFields: boolean
  format: string
  outputPath: string
  watchPatterns: string[]
  workspace: string | undefined
}

interface GetExtractionOptions {
  flags: ExtractSchemaCommand['flags']
  projectRoot: ProjectRootResult
  schemaExtraction: CliConfig['schemaExtraction']
}

export function getExtractOptions({
  flags,
  projectRoot,
  schemaExtraction,
}: GetExtractionOptions): ExtractOptions {
  const pathFlag = flags.path ?? schemaExtraction?.path
  const outputDir = pathFlag
    ? resolve(join(projectRoot.directory, pathFlag))
    : projectRoot.directory
  const outputPath = join(outputDir, 'schema.json')

  return {
    configPath: projectRoot.path,
    enforceRequiredFields:
      flags['enforce-required-fields'] ?? schemaExtraction?.enforceRequiredFields ?? false,
    format: flags.format ?? 'groq-type-nodes',
    outputPath,
    watchPatterns: flags['watch-patterns'] ?? schemaExtraction?.watchPatterns ?? [],
    workspace: flags.workspace ?? schemaExtraction?.workspace,
  }
}
