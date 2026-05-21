import {
  type ExtractOptions,
  getExtractOptions as internalExtractOptions,
} from '@sanity/cli-build/_internal'
import {type CliConfig, type ProjectRootResult} from '@sanity/cli-core'

import {type ExtractSchemaCommand} from '../../commands/schemas/extract.js'

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
  return internalExtractOptions({
    enforceRequiredFields:
      flags['enforce-required-fields'] ?? schemaExtraction?.enforceRequiredFields,
    format: flags.format,
    path: flags.path ?? schemaExtraction?.path,
    projectRoot: projectRoot,
    watchPatterns: flags['watch-patterns'] ?? schemaExtraction?.watchPatterns,
    workspace: flags.workspace ?? schemaExtraction?.workspace,
  })
}
