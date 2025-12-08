import {mkdir, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {spinner} from '@sanity/cli-core'
import {extractSchema} from '@sanity/schema/_internal'
import {type Schema} from '@sanity/types'

import {type ExtractSchemaCommand} from '../../commands/schema/extract'
import {importStudioConfig} from '../../util/importStudioConfig.js'
import {getWorkspace} from './getWorkspace.js'

const FILENAME = 'schema.json'

interface ExtractSchemaOptions {
  flags: ExtractSchemaCommand['flags']
  workDir: string
}

export async function extract(options: ExtractSchemaOptions): Promise<void> {
  const {flags, workDir} = options
  const {
    'enforce-required-fields': enforceRequiredFields,
    format,
    path,
    workspace: workspaceName,
  } = flags
  const spin = spinner(
    enforceRequiredFields ? 'Extracting schema with enforced required fields' : 'Extracting schema',
  ).start()

  try {
    if (format !== 'groq-type-nodes') {
      throw new Error(`Unsupported format: "${format}"`)
    }

    const workspaces = await importStudioConfig(workDir)
    const workspace = getWorkspace(workspaces, workspaceName)

    const schema = extractSchema(workspace.schema as Schema, {
      enforceRequiredFields,
    })

    const outputDir = `.${resolve(path || workDir)}`
    const outputPath = join(outputDir, FILENAME)
    await mkdir(outputDir, {recursive: true})

    spin.text = `Writing schema to ${outputPath}`

    await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`)

    spin.succeed(
      enforceRequiredFields
        ? `Extracted schema to ${outputPath} with enforced required fields`
        : `Extracted schema to ${outputPath}`,
    )
  } catch (err) {
    spin.fail(
      enforceRequiredFields
        ? 'Failed to extract schema with enforced required fields'
        : 'Failed to extract schema',
    )

    throw err
  }
}
