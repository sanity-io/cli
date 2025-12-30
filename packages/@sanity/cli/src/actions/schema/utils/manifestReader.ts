import {type Stats} from 'node:fs'
import {readFile, stat} from 'node:fs/promises'
import path, {join, resolve} from 'node:path'

import {type Output} from '@sanity/cli-core'
import {chalk} from '@sanity/cli-core/ux'

import {MANIFEST_FILENAME} from '../../manifest/extractManifest.js'
import {type CreateManifest, type ManifestSchemaType} from '../../manifest/types.js'
import {type DeploySchemasFlags} from './schemaStoreValidation.js'

export type ManifestJsonReader = <T>(
  filePath: string,
) => Promise<JsonFileParseSuccess<T> | undefined>

export type CreateManifestReaderFactory = (args: {
  jsonReader?: <T>(filePath: string) => Promise<JsonFileParseSuccess<T> | undefined>
  manifestDir: string
  output: Output
  workDir: string
}) => CreateManifestReader

export interface CreateManifestReader {
  getManifest: () => Promise<CreateManifest>
  getWorkspaceSchema: (workspaceName: string) => Promise<ManifestSchemaType[]>
}

interface JsonFileParseSuccess<T> {
  lastModified: string
  parsedJson: T
  path: string
}

/**
 * The manifest reader will try to read manifest and workspace schema files _once_ and cache a successful result.
 * If you need to re-read the manifest from disk, create a new instance.
 */
export const createManifestReader: CreateManifestReaderFactory = ({
  jsonReader = parseJsonFile,
  manifestDir,
  output,
  workDir,
}) => {
  let parsedManifest: JsonFileParseSuccess<CreateManifest>
  const parsedWorkspaces: Record<string, JsonFileParseSuccess<ManifestSchemaType[]> | undefined> =
    {}

  const getManifest: CreateManifestReader['getManifest'] = async () => {
    if (parsedManifest) {
      return parsedManifest?.parsedJson
    }

    const staticPath = resolve(join(workDir, manifestDir))
    const manifestFile = path.join(staticPath, MANIFEST_FILENAME)

    const result = await jsonReader<CreateManifest>(manifestFile)
    if (!result) {
      throw new Error(
        `Manifest does not exist at ${manifestFile}. To create the manifest file, omit --no-${'extract-manifest' satisfies keyof DeploySchemasFlags} or run "sanity manifest extract" first.`,
      )
    }

    output.log(
      chalk.gray(`↳ Read manifest from ${manifestFile} (last modified: ${result.lastModified})`),
    )

    parsedManifest = result
    return result.parsedJson
  }

  const getWorkspaceSchema: CreateManifestReader['getWorkspaceSchema'] = async (workspaceName) => {
    if (parsedWorkspaces[workspaceName]) {
      return parsedWorkspaces[workspaceName]?.parsedJson
    }
    const manifest = await getManifest()
    if (!manifest) {
      throw new Error('Manifest is required to read workspace schema.')
    }

    const workspaceManifest = manifest.workspaces.find(
      (workspace) => workspace.name === workspaceName,
    )

    if (!workspaceManifest) {
      throw new Error(`No workspace named "${workspaceName}" found in manifest.`)
    }

    const workspaceSchemaFile = path.join(manifestDir, workspaceManifest.schema)
    const result = await jsonReader<ManifestSchemaType[]>(workspaceSchemaFile)
    if (!result) {
      throw new Error(`Workspace schema file at "${workspaceSchemaFile}" does not exist.`)
    }
    parsedWorkspaces[workspaceName] = result
    return result.parsedJson
  }
  return {
    getManifest,
    getWorkspaceSchema,
  }
}

async function parseJsonFile<T>(filePath: string): Promise<JsonFileParseSuccess<T> | undefined> {
  let stats: Stats
  try {
    stats = await stat(filePath)
  } catch {
    // file does not exist
    return undefined
  }
  const content = await readFile(filePath, 'utf8')
  const lastModified = stats.mtime.toISOString()
  const json = JSON.parse(content) as T
  if (!json) {
    throw new Error(`JSON file "${filePath}" was empty.`)
  }
  return {
    lastModified,
    parsedJson: json,
    path: filePath,
  }
}
