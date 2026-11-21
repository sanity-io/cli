import {type ExtractOptions} from '@sanity/cli-build/_internal/extract'
import {type CliConfig, type ProjectRootResult} from '@sanity/cli-core'

import {type ExtractSchemaCommand} from '../../commands/schemas/extract.js'
import {loadCliBuild} from '../../util/loadCliBuild.js'

interface GetExtractionOptions {
  flags: ExtractSchemaCommand['flags']
  projectRoot: ProjectRootResult
  schemaExtraction: CliConfig['schemaExtraction']
}

export async function getExtractOptions({
  flags,
  projectRoot,
  schemaExtraction,
}: GetExtractionOptions): Promise<ExtractOptions> {
  const {getExtractOptions: internalExtractOptions} = await loadCliBuild('extract')
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
