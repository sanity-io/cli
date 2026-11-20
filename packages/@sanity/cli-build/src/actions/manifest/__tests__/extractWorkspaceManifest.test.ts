import {Schema as SchemaBuilder} from '@sanity/schema'
import {builtinTypes} from '@sanity/schema/_internal'
import {type Schema} from '@sanity/types'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {extractManifestSchemaTypes} from '../extractWorkspaceManifest.js'

const mockResolveLocalPackage = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    resolveLocalPackage: mockResolveLocalPackage,
  }
})

const workDir = '/studio'

const releaseMetadataCoreFields = [
  {name: 'title', type: 'string'},
  {name: 'description', type: 'text'},
  {name: 'releaseType', type: 'string'},
  {name: 'intendedPublishAt', type: 'datetime'},
  {name: 'cardinality', type: 'string'},
]

const releaseMetadata = {
  fields: releaseMetadataCoreFields,
  name: 'sanity.releaseMetadata',
  type: 'object',
}

const releaseDocument = {
  fields: [{name: 'metadata', type: 'sanity.releaseMetadata'}],
  name: 'system.release',
  type: 'document',
}

const article = {
  fields: [{name: 'headline', type: 'string'}],
  name: 'article',
  type: 'document',
}

const addedReleaseFields = [
  {name: 'legalReview', type: 'string'},
  {fields: [{name: 'reviewer', type: 'string'}], name: 'signOff', type: 'object'},
]

type SchemaDef = {name: string; types: unknown[]}

/** `sanity` before parent schemas: every schema is a root schema. */
function rootCreateSchema({name, types}: SchemaDef): Schema {
  return SchemaBuilder.compile({name, types: [...builtinTypes, ...types]}) as unknown as Schema
}

const oldBuiltinSchema = SchemaBuilder.compile({name: 'studio', types: builtinTypes})

/** `sanity` with parent schemas, but without extendable types. */
function oldCreateSchema({name, types}: SchemaDef): Schema {
  return SchemaBuilder.compile({name, parent: oldBuiltinSchema, types}) as unknown as Schema
}

const newBuiltinSchema = SchemaBuilder.compile({
  name: 'studio',
  types: [...builtinTypes, releaseMetadata, releaseDocument],
})

/** `sanity` with extendable types, for a schema that doesn't extend one. */
function newCreateSchema({name, types}: SchemaDef): Schema {
  return SchemaBuilder.compile({name, parent: newBuiltinSchema, types}) as unknown as Schema
}

/**
 * A schema that reports `localTypeNames` as its local types, the way `sanity` with
 * extendable types reports a schema that extends one: the extension replaces the
 * built-in type and is local, while a system document compiled again to use it
 * stays inherited.
 */
function schemaWithLocalTypes(types: unknown[], localTypeNames: string[]): Schema {
  const compiled = SchemaBuilder.compile({name: 'default', parent: oldBuiltinSchema, types})
  return Object.assign(Object.create(compiled), {
    getLocalTypeNames: () => localTypeNames,
  }) as Schema
}

function extendedReleaseMetadataSchema(
  types: (typeof article)[],
  extension: {fields: unknown[]; title?: string},
): Schema {
  return schemaWithLocalTypes(
    [
      ...types,
      {
        ...extension,
        fields: [...releaseMetadataCoreFields, ...extension.fields],
        name: 'sanity.releaseMetadata',
        type: 'object',
      },
      releaseDocument,
    ],
    [...types.map((type) => type.name), 'sanity.releaseMetadata'],
  )
}

function useSanity(createSchema: (def: SchemaDef) => Schema) {
  mockResolveLocalPackage.mockImplementation(async (pkg: string) => {
    if (pkg === 'sanity') return {createSchema}
    throw new Error(`Unexpected resolveLocalPackage call: ${pkg}`)
  })
}

describe('extractManifestSchemaTypes', () => {
  beforeEach(() => {
    mockResolveLocalPackage.mockReset()
  })

  test('writes nothing for a schema without types', async () => {
    useSanity(newCreateSchema)

    const types = await extractManifestSchemaTypes(
      newCreateSchema({name: 'default', types: []}),
      workDir,
    )

    expect(types).toEqual([])
  })

  test('writes the declared types with sanity without parent schemas', async () => {
    useSanity(rootCreateSchema)

    const types = await extractManifestSchemaTypes(
      rootCreateSchema({name: 'default', types: [article]}),
      workDir,
    )

    expect(types.map((type) => type.name)).toEqual(['article'])
  })

  test('writes the declared types with sanity without extendable types', async () => {
    useSanity(oldCreateSchema)

    const types = await extractManifestSchemaTypes(
      oldCreateSchema({name: 'default', types: [article]}),
      workDir,
    )

    expect(types.map((type) => type.name)).toEqual(['article'])
  })

  test('leaves out a declared type that reuses a built-in name', async () => {
    useSanity(oldCreateSchema)
    const imageAsset = {
      fields: [{name: 'caption', type: 'string'}],
      name: 'sanity.imageAsset',
      type: 'document',
    }

    const types = await extractManifestSchemaTypes(
      oldCreateSchema({name: 'default', types: [article, imageAsset]}),
      workDir,
    )

    expect(types.map((type) => type.name)).toEqual(['article'])
  })

  test('leaves out extendable and system document types that are not extended', async () => {
    useSanity(newCreateSchema)

    const types = await extractManifestSchemaTypes(
      newCreateSchema({name: 'default', types: [article]}),
      workDir,
    )

    expect(types.map((type) => type.name)).toEqual(['article'])
  })

  test('writes an extended type with only the fields the schema added', async () => {
    useSanity(newCreateSchema)

    const types = await extractManifestSchemaTypes(
      extendedReleaseMetadataSchema([article], {fields: addedReleaseFields}),
      workDir,
    )

    expect(types.map((type) => type.name)).toEqual(['article', 'sanity.releaseMetadata'])
    const metadata = types.find((type) => type.name === 'sanity.releaseMetadata')
    expect(metadata).toMatchObject({type: 'object'})
    expect(metadata?.fields?.map((field) => field.name)).toEqual(['legalReview', 'signOff'])
  })

  test('writes an extension that only changes type options, without fields', async () => {
    useSanity(newCreateSchema)

    const types = await extractManifestSchemaTypes(
      extendedReleaseMetadataSchema([], {fields: [], title: 'Release details'}),
      workDir,
    )

    expect(types).toEqual([
      {name: 'sanity.releaseMetadata', title: 'Release details', type: 'object'},
    ])
  })

  test('writes any extended built-in type, not only release metadata', async () => {
    const variantMetadata = {
      fields: [{name: 'title', type: 'string'}],
      name: 'sanity.variantMetadata',
      type: 'object',
    }
    const builtinSchema = SchemaBuilder.compile({
      name: 'studio',
      types: [...builtinTypes, variantMetadata],
    })
    useSanity(
      ({name, types}) =>
        SchemaBuilder.compile({name, parent: builtinSchema, types}) as unknown as Schema,
    )
    const schema = schemaWithLocalTypes(
      [{...variantMetadata, fields: [...variantMetadata.fields, {name: 'market', type: 'string'}]}],
      ['sanity.variantMetadata'],
    )

    const types = await extractManifestSchemaTypes(schema, workDir)

    expect(types).toEqual([
      {fields: [{name: 'market', type: 'string'}], name: 'sanity.variantMetadata', type: 'object'},
    ])
  })
})
