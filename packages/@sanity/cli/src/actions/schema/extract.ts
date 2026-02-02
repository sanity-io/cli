import {mkdir, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {spinner} from '@sanity/cli-core/ux'

import {type ExtractSchemaCommand} from '../../commands/schema/extract'
import {extractSanitySchema} from './extractSanitySchema.js'
import {schemasExtractDebug} from './utils/debug.js'

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

  // TODO: Add telemetry
  // const trace = telemetry.trace(ExtractSchemaTrace)
  // trace.start()

  try {
    if (format !== 'groq-type-nodes') {
      throw new Error(`Unsupported format: "${format}"`)
    }

    const schema = await extractSanitySchema({
      enforceRequiredFields,
      workDir,
      workspaceName: workspaceName ?? 'default',
    })

    const outputDir = path ? resolve(join(workDir, path)) : workDir
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
    schemasExtractDebug('Failed to extract schema', err)
    spin.fail(
      enforceRequiredFields
        ? 'Failed to extract schema with enforced required fields'
        : 'Failed to extract schema',
    )

    throw err
  }
}
