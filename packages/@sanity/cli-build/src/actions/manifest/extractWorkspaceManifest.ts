import {doImport, resolveLocalPackage} from '@sanity/cli-core'
import {type Schema} from '@sanity/types'
import {type Workspace} from 'sanity'

import {type resolveIcon as resolveIconFn} from './iconResolver.js'
import {type SchemaIconProps} from './resolveSchemaIcon.js'
import {transformType} from './schemaTypeTransformer.js'
import {type CreateWorkspaceManifest, type ManifestSchemaType, type ManifestTool} from './types.js'

const iconResolverPath = new URL('iconResolver.js', import.meta.url).href

async function lazyResolveIcon(): Promise<typeof resolveIconFn> {
  const mod = await doImport(iconResolverPath)
  return mod.resolveIcon
}

/**
 * Extracts manifest data from an array of workspaces
 */
export async function extractWorkspaceManifest(
  workspaces: Workspace[],
  workDir: string,
): Promise<CreateWorkspaceManifest[]> {
  const resolveIcon = await lazyResolveIcon()
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
        extractManifestTools(workspace.tools, workDir, resolveIcon),
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

  const {createSchema} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)

  const defaultSchema = createSchema({name: 'default', types: []})
  const studioDefaultTypeNames = defaultSchema.getTypeNames()
  // A schema's local types include a built-in type it redefines, like an extended
  // `sanity.releaseMetadata`. A root schema also lists the core types as local.
  const localTypeNames = new Set(schema.parent ? schema.getLocalTypeNames() : [])
  const context = {coreFieldNames: getCoreFieldNames(defaultSchema, localTypeNames), schema}

  return typeNames
    .filter(
      (typeName) => localTypeNames.has(typeName) || !studioDefaultTypeNames.includes(typeName),
    )
    .map((typeName) => schema.get(typeName))
    .filter((type): type is NonNullable<typeof type> => type !== undefined)
    .map((type) => transformType(type, context))
}

function getCoreFieldNames(
  defaultSchema: Schema,
  localTypeNames: ReadonlySet<string>,
): Map<string, Set<string>> {
  const coreFieldNames = new Map<string, Set<string>>()
  for (const typeName of localTypeNames) {
    const defaultType = defaultSchema.get(typeName)
    if (defaultType && 'fields' in defaultType && Array.isArray(defaultType.fields)) {
      coreFieldNames.set(typeName, new Set(defaultType.fields.map((field) => field.name)))
    }
  }
  return coreFieldNames
}

/**
 * Extracts tool information from workspace tools
 */
const extractManifestTools = async (
  tools: Workspace['tools'],
  workDir: string,
  resolveIcon: typeof resolveIconFn,
): Promise<ManifestTool[]> => {
  return Promise.all(
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
}
