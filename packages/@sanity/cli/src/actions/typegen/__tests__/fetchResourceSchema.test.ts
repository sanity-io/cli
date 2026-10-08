import {readFileSync} from 'node:fs'

import {type SchemaSummary} from '@sanity/schema-descriptor-utils'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {extractDescriptorSchema, fetchResourceSchema} from '../fetchResourceSchema.js'

const mockGetDatasetSchemaBinding = vi.hoisted(() => vi.fn())
const mockGetSchemaDescriptor = vi.hoisted(() => vi.fn())

vi.mock(import('../../../services/schemas.js'), () => ({
  getDatasetSchemaBinding: mockGetDatasetSchemaBinding,
  getSchemaDescriptor: mockGetSchemaDescriptor,
}))

/**
 * A descriptor read from the schema API for a test project. Its `book.title` and `author.name`
 * fields have a required rule; no other field does.
 */
const descriptor: SchemaSummary = JSON.parse(
  readFileSync(
    new URL('../../../../test/__fixtures__/typegen/schema-descriptor.json', import.meta.url),
    'utf8',
  ),
)

const resource = {dataset: 'production', projectId: 'abc123'}

function getAttributes(schema: ReturnType<typeof extractDescriptorSchema>, typeName: string) {
  const type = schema.find((entry) => entry.name === typeName)
  if (type?.type !== 'document') throw new Error(`Expected a document type named ${typeName}`)
  return type.attributes
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('extractDescriptorSchema', () => {
  test('includes the built-in types, which descriptors omit', () => {
    const names = extractDescriptorSchema(descriptor, {enforceRequiredFields: false}).map(
      (type) => type.name,
    )

    expect(names).toEqual(expect.arrayContaining(['author', 'book', 'seo', 'slug', 'geopoint']))
    expect(names).toEqual(expect.arrayContaining(['sanity.imageAsset', 'sanity.fileAsset']))
  })

  test('marks fields with a required rule as non-optional when enforcing required fields', () => {
    const schema = extractDescriptorSchema(descriptor, {enforceRequiredFields: true})

    expect(getAttributes(schema, 'book').title.optional).toBe(false)
    expect(getAttributes(schema, 'author').name.optional).toBe(false)
    expect(getAttributes(schema, 'book').author.optional).toBe(true)
  })

  test('leaves every field optional when not enforcing required fields', () => {
    const schema = extractDescriptorSchema(descriptor, {enforceRequiredFields: false})

    expect(getAttributes(schema, 'book').title.optional).toBe(true)
    expect(getAttributes(schema, 'author').name.optional).toBe(true)
  })
})

describe('fetchResourceSchema', () => {
  test('reads the descriptor the binding points at', async () => {
    mockGetDatasetSchemaBinding.mockResolvedValue({_meta: {schemaVersion: 'uEiB-version'}})
    mockGetSchemaDescriptor.mockResolvedValue(descriptor)

    const result = await fetchResourceSchema({...resource, enforceRequiredFields: true})

    expect(mockGetDatasetSchemaBinding).toHaveBeenCalledWith('abc123', 'production')
    expect(mockGetSchemaDescriptor).toHaveBeenCalledWith('uEiB-version')
    expect(result.schemaVersion).toBe('uEiB-version')
    expect(getAttributes(result.schema, 'book').title.optional).toBe(false)
  })

  test('does not enforce required fields by default', async () => {
    mockGetDatasetSchemaBinding.mockResolvedValue({_meta: {schemaVersion: 'uEiB-version'}})
    mockGetSchemaDescriptor.mockResolvedValue(descriptor)

    const result = await fetchResourceSchema(resource)

    expect(getAttributes(result.schema, 'book').title.optional).toBe(true)
  })

  test('names the resource when its dataset has no binding', async () => {
    mockGetDatasetSchemaBinding.mockResolvedValue(null)

    await expect(fetchResourceSchema(resource)).rejects.toThrow(
      'No schema is bound to dataset "abc123.production", or the dataset does not exist.',
    )
    expect(mockGetSchemaDescriptor).not.toHaveBeenCalled()
  })
})
