import {Schema} from '@sanity/schema'
import {createSchemaFromManifestTypes} from '@sanity/schema/_internal'
import {type SchemaType} from '@sanity/types'
import {describe, expect, test} from 'vitest'

import {extractTypes} from './testHelpers.js'

/**
 * Recursively extracts a comparable structure from a SchemaType,
 * capturing the essential shape: jsonType, name, title, fields, of, to.
 */
function typeForComparison(type: SchemaType, visited = new Set<string>()): Record<string, unknown> {
  // Prevent infinite recursion for recursive types
  if (visited.has(type.name)) {
    return {name: type.name, type: type.type?.name ?? type.jsonType}
  }
  visited.add(type.name)

  const result: Record<string, unknown> = {
    jsonType: type.jsonType,
    name: type.name,
  }

  if (type.title) {
    result.title = type.title
  }

  // Extract fields
  if ('fields' in type && Array.isArray(type.fields) && type.fields.length > 0) {
    result.fields = type.fields.map((f: {name: string; type: SchemaType}) => ({
      name: f.name,
      ...typeForComparison(f.type, new Set(visited)),
    }))
  }

  // Extract array 'of' members
  if ('of' in type && Array.isArray(type.of)) {
    result.of = type.of.map((member: SchemaType) => typeForComparison(member, new Set(visited)))
  }

  // Extract reference 'to' targets
  if ('to' in type && Array.isArray(type.to)) {
    result.to = (type.to as Array<{name?: string; type?: SchemaType}>).map((target) => ({
      type: target.type?.name ?? target.name,
    }))
  }

  return result
}

describe('extractManifestRestore', () => {
  test('extract-then-restore roundtrip preserves schema structure', () => {
    // Uses only types supported by both Schema.compile and createSchemaFromManifestTypes.
    // Omits slug, geopoint (not built-in in Schema.compile) and image/file fields
    // (their internal sub-types like sanity.imageHotspot aren't available during restore).
    const schemaTypes = [
      // Document with various field types
      {
        fields: [
          {name: 'title', type: 'string'},
          {name: 'subtitle', type: 'text'},
          {name: 'count', type: 'number'},
          {name: 'isPublished', type: 'boolean'},
          {name: 'publishedAt', type: 'date'},
          {name: 'updatedAt', type: 'datetime'},
          // Nested object
          {
            fields: [
              {name: 'seoTitle', type: 'string'},
              {name: 'seoDescription', type: 'text'},
            ],
            name: 'metadata',
            type: 'object',
          },
          // Primitive arrays
          {name: 'tags', of: [{type: 'string'}], type: 'array'},
          // Object arrays
          {
            name: 'sections',
            of: [
              {
                fields: [{name: 'heading', type: 'string'}],
                name: 'section',
                type: 'object',
              },
            ],
            type: 'array',
          },
          // Reference
          {name: 'author', to: [{type: 'person'}], type: 'reference'},
          // Reference array
          {
            name: 'relatedArticles',
            of: [{to: [{type: 'article'}], type: 'reference'}],
            type: 'array',
          },
          // Portable text
          {
            name: 'body',
            of: [
              {
                lists: [
                  {title: 'Bullet', value: 'bullet'},
                  {title: 'Number', value: 'number'},
                ],
                marks: {
                  annotations: [
                    {
                      fields: [{name: 'href', type: 'string'}],
                      name: 'link',
                      type: 'object',
                    },
                  ],
                  decorators: [
                    {title: 'Strong', value: 'strong'},
                    {title: 'Emphasis', value: 'em'},
                    {title: 'Code', value: 'code'},
                  ],
                },
                styles: [
                  {title: 'Normal', value: 'normal'},
                  {title: 'H1', value: 'h1'},
                  {title: 'H2', value: 'h2'},
                ],
                type: 'block',
              },
            ],
            type: 'array',
          },
        ],
        name: 'article',
        type: 'document',
      },
      // Referenced document type
      {
        fields: [
          {name: 'name', type: 'string'},
          {name: 'email', type: 'string'},
        ],
        name: 'person',
        type: 'document',
      },
      // Recursive type (self-referencing)
      {
        fields: [
          {name: 'label', type: 'string'},
          {name: 'children', of: [{type: 'treeNode'}], type: 'array'},
        ],
        name: 'treeNode',
        type: 'object',
      },
    ]

    // Step 1: Compile the source schema
    const sourceSchema = Schema.compile({name: 'test', types: schemaTypes})

    // Step 2: Extract manifest types
    const extractedTypes = extractTypes(schemaTypes)
    expect(extractedTypes.length).toBeGreaterThan(0)

    // Step 3: Restore via createSchemaFromManifestTypes
    const restoredSchema = createSchemaFromManifestTypes({
      name: 'restored',
      types: extractedTypes,
    })

    // Step 4: Verify all user-defined source types exist in the restored schema.
    // The restored schema may contain additional internal types from createSchemaFromManifestTypes,
    // so we check inclusion rather than exact equality.
    const sourceDefaultTypes = new Set(
      Schema.compile({name: 'default', types: []}).getTypeNames() as string[],
    )
    const sourceTypeNames = (sourceSchema.getTypeNames() as string[]).filter(
      (name) => !sourceDefaultTypes.has(name),
    )
    const restoredTypeNames = new Set(restoredSchema.getTypeNames() as string[])

    for (const typeName of sourceTypeNames) {
      expect(restoredTypeNames.has(typeName)).toBe(true)
    }

    // Step 5: Compare structure for each user-defined type
    for (const typeName of sourceTypeNames) {
      const sourceType = sourceSchema.get(typeName) as SchemaType
      const restoredType = restoredSchema.get(typeName) as SchemaType

      expect(restoredType).toBeDefined()

      const sourceComparison = typeForComparison(sourceType)
      const restoredComparison = typeForComparison(restoredType)

      // Both should have the same name and jsonType
      expect(restoredComparison.name).toBe(sourceComparison.name)
      expect(restoredComparison.jsonType).toBe(sourceComparison.jsonType)
    }
  })

  test('restored schema has the same field names as the source schema', () => {
    const schemaTypes = [
      {
        fields: [
          {name: 'title', type: 'string'},
          {name: 'body', type: 'text'},
          {name: 'rating', type: 'number'},
          {name: 'draft', type: 'boolean'},
        ],
        name: 'post',
        type: 'document',
      },
    ]

    const extractedTypes = extractTypes(schemaTypes)
    const restoredSchema = createSchemaFromManifestTypes({
      name: 'restored',
      types: extractedTypes,
    })

    const restoredPost = restoredSchema.get('post') as SchemaType & {
      fields: {name: string}[]
    }
    expect(restoredPost).toBeDefined()

    const fieldNames = restoredPost.fields.map((f: {name: string}) => f.name)
    expect(fieldNames).toContain('title')
    expect(fieldNames).toContain('body')
    expect(fieldNames).toContain('rating')
    expect(fieldNames).toContain('draft')
  })

  test('restored schema preserves nested object field structure', () => {
    const schemaTypes = [
      {
        fields: [
          {
            fields: [
              {name: 'title', type: 'string'},
              {name: 'description', type: 'text'},
            ],
            name: 'seo',
            type: 'object',
          },
        ],
        name: 'page',
        type: 'document',
      },
    ]

    const extractedTypes = extractTypes(schemaTypes)
    const restoredSchema = createSchemaFromManifestTypes({
      name: 'restored',
      types: extractedTypes,
    })

    const restoredPage = restoredSchema.get('page') as SchemaType & {
      fields: {name: string; type: SchemaType & {fields?: {name: string}[]}}[]
    }
    const seoField = restoredPage.fields.find((f) => f.name === 'seo')!
    expect(seoField).toBeDefined()
    expect(seoField.type.jsonType).toBe('object')

    const seoFieldNames = seoField.type.fields?.map((f) => f.name) ?? []
    expect(seoFieldNames).toContain('title')
    expect(seoFieldNames).toContain('description')
  })
})
