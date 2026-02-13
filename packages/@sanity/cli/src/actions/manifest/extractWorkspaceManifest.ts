import {resolveLocalPackage} from '@sanity/cli-core'
import {type Schema} from '@sanity/types'
import {type Workspace} from 'sanity'

import {resolveIcon} from './iconResolver.js'
import {type SchemaIconProps} from './SchemaIcon.js'
import {transformType} from './schemaTypeTransformer.js'
import {type CreateWorkspaceManifest, type ManifestSchemaType, type ManifestTool} from './types.js'

/**
 * Extracts manifest data from an array of workspaces
 */
export function extractWorkspaceManifest(
  workspaces: Workspace[],
  workDir: string,
): Promise<CreateWorkspaceManifest[]> {
  return Promise.all(
    workspaces.map(async (workspace) => {
      const [icon, serializedSchema, serializedTools] = await Promise.all([
        resolveIcon({
          icon: workspace.icon,
          subtitle: workspace.subtitle,
          title: workspace.title,
          workDir,
        }),
        extractManifestSchemaTypes(workspace.schema as Schema, workDir),
        extractManifestTools(workspace.tools, workDir),
      ])

      return {
        basePath: workspace.basePath,
        dataset: workspace.dataset,
        icon,
        mediaLibrary: workspace.mediaLibrary,
        name: workspace.name,
        projectId: workspace.projectId,
        schema: serializedSchema,
        subtitle: workspace.subtitle,
        title: workspace.title,
        tools: serializedTools,
      }
    }),
  )
}

/**
 * Extracts all serializable properties from userland schema types,
 * so they best-effort can be used as definitions for Schema.compile.
 *
 * @internal
 */
export async function extractManifestSchemaTypes(
  schema: Schema,
  workDir: string,
): Promise<ManifestSchemaType[]> {
  const typeNames = schema.getTypeNames()
  const context = {schema}

  const {createSchema} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)

  const studioDefaultTypeNames = createSchema({name: 'default', types: []}).getTypeNames()

  return typeNames
    .filter((typeName) => !studioDefaultTypeNames.includes(typeName))
    .map((typeName) => schema.get(typeName))
    .filter((type): type is NonNullable<typeof type> => type !== undefined)
    .map((type) => transformType(type, context))
}

/**
 * Extracts tool information from workspace tools
 */
const extractManifestTools = async (
  tools: Workspace['tools'],
  workDir: string,
): Promise<ManifestTool[]> =>
  Promise.all(
    tools.map(async (tool) => {
      const {
        __internalApplicationType: type,
        icon,
        name,
        title,
      } = tool as Workspace['tools'][number] & {__internalApplicationType: string}
      return {
        icon: await resolveIcon({
          icon: icon as SchemaIconProps['icon'],
          title,
          workDir,
        }),
        name,
        title,
        type: type || null,
      } satisfies ManifestTool
    }),
  )
