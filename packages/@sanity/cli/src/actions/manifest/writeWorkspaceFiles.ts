import {createHash} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {type CreateWorkspaceManifest, type ManifestWorkspaceFile} from '@sanity/schema/_internal'

const SCHEMA_FILENAME_SUFFIX = '.create-schema.json'
const TOOLS_FILENAME_SUFFIX = '.create-tools.json'

export function writeWorkspaceFiles(
  manifestWorkspaces: CreateWorkspaceManifest[],
  staticPath: string,
): Promise<ManifestWorkspaceFile[]> {
  const output = manifestWorkspaces.map((workspace) => writeWorkspaceFile(workspace, staticPath))

  return Promise.all(output)
}

async function writeWorkspaceFile(
  workspace: CreateWorkspaceManifest,
  staticPath: string,
): Promise<ManifestWorkspaceFile> {
  const [schemaFilename, toolsFilename] = await Promise.all([
    createFile(staticPath, workspace.schema, SCHEMA_FILENAME_SUFFIX),
    createFile(staticPath, workspace.tools, TOOLS_FILENAME_SUFFIX),
  ])

  return {
    ...workspace,
    schema: schemaFilename,
    tools: toolsFilename,
  }
}

async function createFile(path: string, content: unknown, filenameSuffix: string) {
  const stringifiedContent = JSON.stringify(content, null, 2)
  const hash = createHash('sha1').update(stringifiedContent).digest('hex')
  const filename = `${hash.slice(0, 8)}${filenameSuffix}`

  // workspaces with identical data will overwrite each others file. This is ok, since they are identical and can be shared
  await writeFile(join(path, filename), stringifiedContent)

  return filename
}
