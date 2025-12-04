import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {spinner} from '@sanity/cli-core'
import {extractSchema} from '@sanity/schema/_internal'
import {type Schema} from '@sanity/types'
import {Workspace} from 'sanity'

import {type ExtractSchemaCommand} from '../../commands/schema/extract'
import {importStudioConfig} from '../../util/importStudioConfig.js'

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

    const outputDir = path || join(process.cwd(), 'schema.json')

    spin.text = `Writing schema to ${outputDir}`

    await writeFile(outputDir, `${JSON.stringify(schema, null, 2)}\n`)

    spin.succeed(
      enforceRequiredFields
        ? `Extracted schema to ${outputDir} with enforced required fields`
        : `Extracted schema to ${outputDir}`,
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

function getWorkspace(workspaces: Workspace[], workspaceName?: string) {
  if (workspaces.length === 0) {
    throw new Error('No workspaces found')
  }

  if (workspaces.length === 1) {
    return workspaces[0]
  }

  if (!workspaceName) {
    throw new Error(
      `Multiple workspaces found. Please specify which workspace to use with '--workspace'. Available workspaces: ${workspaces.map((w) => w.name).join(', ')}`,
    )
  }
  const workspace = workspaces.find((w) => w.name === workspaceName)

  if (!workspace) {
    throw new Error(
      `Could not find "${workspaceName}" workspace. Available workspaces: ${workspaces.map((w) => w.name).join(', ')}`,
    )
  }

  return workspace
}
