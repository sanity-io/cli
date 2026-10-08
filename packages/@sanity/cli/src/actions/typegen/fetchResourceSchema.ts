import {type TypeGenResource} from '@sanity/cli-core/types'
import {type RunTypegenOptions} from '@sanity/codegen'
import {convertToDefinition, type SchemaSummary} from '@sanity/schema-descriptor-utils'
import {createSchemaFromManifestTypes, extractSchema} from '@sanity/schema/_internal'

import {getDatasetSchemaBinding, getSchemaDescriptor} from '../../services/schemas.js'
import {getResourceKey} from './parseTypegenResources.js'

/** A schema in the format `sanity schema extract` writes. */
export type ExtractedSchema = NonNullable<RunTypegenOptions['extractedSchema']>

/**
 * The schema bound to a resource's dataset.
 */
export interface FetchedResourceSchema {
  schema: ExtractedSchema
  /** The Lexicon descriptor ID the dataset's binding points at. */
  schemaVersion: string
}

/**
 * Fetches the schema bound to a resource's dataset and extracts it for typegen.
 *
 * Throws when the dataset has no binding, naming the resource so the user can set a local
 * `schema` for it instead.
 */
export async function fetchResourceSchema(
  resource: Pick<TypeGenResource, 'dataset' | 'enforceRequiredFields' | 'projectId'>,
): Promise<FetchedResourceSchema> {
  const key = getResourceKey(resource)

  // The binding's own `types` are hydrated for display and do not compile, so only its
  // descriptor ID is used.
  const binding = await getDatasetSchemaBinding(resource.projectId, resource.dataset)
  if (!binding) {
    throw new Error(
      `No schema is bound to dataset "${key}", or the dataset does not exist. Check its projectId and dataset, or set "schema" for this resource to a file extracted with "sanity schema extract".`,
    )
  }

  const {schemaVersion} = binding._meta
  const descriptor = await getSchemaDescriptor(schemaVersion)

  return {
    schema: extractDescriptorSchema(descriptor, {
      enforceRequiredFields: resource.enforceRequiredFields ?? false,
    }),
    schemaVersion,
  }
}

/**
 * Compiles a schema descriptor and extracts it.
 *
 * Uses the `manifest` format because it keeps validation, which `enforceRequiredFields` reads.
 * The `createSchema` format drops validation, so every field would come out optional.
 * `createSchemaFromManifestTypes` compiles on the built-in types, which descriptors omit.
 */
export function extractDescriptorSchema(
  descriptor: SchemaSummary,
  options: {enforceRequiredFields: boolean},
): ExtractedSchema {
  const definition = convertToDefinition(descriptor, {format: 'manifest'})
  return extractSchema(createSchemaFromManifestTypes(definition), options)
}
