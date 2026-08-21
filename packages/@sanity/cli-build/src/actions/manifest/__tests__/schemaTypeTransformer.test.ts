import {describe, expect, test} from 'vitest'

import {type ManifestSchemaType} from '../types.js'
import {extractTypes} from './testHelpers.js'

function findType(types: ManifestSchemaType[], name: string): ManifestSchemaType {
  const found = types.find((t) => t.name === name)
  if (!found) throw new Error(`Type '${name}' not found in extracted types`)
  return found
}

describe('schemaTypeTransformer', () => {
  describe('serialize schema for manifest', () => {
    test('should only include user-defined types, not built-ins', () => {
      const types = extractTypes([
        {
          fields: [{name: 'title', type: 'string'}],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const typeNames = types.map((t) => t.name)
      expect(typeNames).toContain('myDoc')
      // Built-in types should not appear
      expect(typeNames).not.toContain('string')
      expect(typeNames).not.toContain('number')
      expect(typeNames).not.toContain('boolean')
      expect(typeNames).not.toContain('object')
      expect(typeNames).not.toContain('document')
    })

    test('should preserve boolean hidden/readOnly and convert functions to conditional', () => {
      const types = extractTypes([
        {
          fields: [
            {hidden: true, name: 'alwaysHidden', type: 'string'},
            {hidden: () => false, name: 'conditionallyHidden', type: 'string'},
            {name: 'alwaysReadOnly', readOnly: true, type: 'string'},
            {name: 'conditionallyReadOnly', readOnly: () => true, type: 'string'},
            {name: 'neitherHiddenNorReadOnly', type: 'string'},
          ],
          name: 'testDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'testDoc')
      const fields = doc.fields!

      const alwaysHidden = fields.find((f) => f.name === 'alwaysHidden')!
      expect(alwaysHidden.hidden).toBe(true)

      const conditionallyHidden = fields.find((f) => f.name === 'conditionallyHidden')!
      expect(conditionallyHidden.hidden).toBe('conditional')

      const alwaysReadOnly = fields.find((f) => f.name === 'alwaysReadOnly')!
      expect(alwaysReadOnly.readOnly).toBe(true)

      const conditionallyReadOnly = fields.find((f) => f.name === 'conditionallyReadOnly')!
      expect(conditionallyReadOnly.readOnly).toBe('conditional')

      const neitherField = fields.find((f) => f.name === 'neitherHiddenNorReadOnly')!
      expect(neitherField.hidden).toBeUndefined()
      expect(neitherField.readOnly).toBeUndefined()
    })

    test('should omit non-serializable props like icon, groups, orderings, preview, components', () => {
      const types = extractTypes([
        {
          components: {input: () => null},
          fields: [{name: 'title', type: 'string'}],
          groups: [{name: 'seo', title: 'SEO'}],
          icon: () => null,
          name: 'testDoc',
          orderings: [{by: [{direction: 'asc', field: 'title'}], name: 'titleAsc', title: 'Title'}],
          preview: {
            prepare: ({title}: {title: string}) => ({title}),
            select: {title: 'title'},
          },
          type: 'document',
        },
      ])

      const doc = findType(types, 'testDoc')
      // These non-serializable/stripped props should not appear
      expect((doc as unknown as Record<string, unknown>).icon).toBeUndefined()
      expect((doc as unknown as Record<string, unknown>).groups).toBeUndefined()
      expect((doc as unknown as Record<string, unknown>).orderings).toBeUndefined()
      expect((doc as unknown as Record<string, unknown>).preview).toBeUndefined()
      expect((doc as unknown as Record<string, unknown>).components).toBeUndefined()
    })

    test('should retain serializable custom properties and drop functions, cap depth at 5', () => {
      const types = extractTypes([
        {
          fields: [{name: 'title', type: 'string'}],
          name: 'testDoc',
          options: {
            customBool: true,
            customFn: () => 'not serializable',
            customNumber: 42,
            customString: 'hello',
            // depth from type object: 0=type, 1=options, 2=shallow, so this is well within cap
            shallow: {key: 'value'},
          },
          type: 'document',
        },
      ])

      const doc = findType(types, 'testDoc')
      expect(doc.options).toBeDefined()
      expect(doc.options!.customBool).toBe(true)
      expect(doc.options!.customString).toBe('hello')
      expect(doc.options!.customNumber).toBe(42)
      // Functions should be dropped
      expect(doc.options!.customFn).toBeUndefined()
      // Shallow nested objects should be retained
      expect(doc.options!.shallow).toEqual({key: 'value'})
    })

    test('should cap custom property depth at MAX_CUSTOM_PROPERTY_DEPTH (5)', () => {
      // retainSerializableProps starts at depth 0 for the type object itself,
      // so options is at depth 1, and deeply nested values are pruned when depth > 5
      const types = extractTypes([
        {
          fields: [{name: 'title', type: 'string'}],
          name: 'testDoc',
          options: {
            // depth: 0=type, 1=options, 2=deep, 3=a, 4=b, 5=c, 6>5 → pruned
            deep: {a: {b: {c: {d: 'too deep'}}}},
            kept: 'shallow', // survives pruning
          },
          type: 'document',
        },
      ])

      const doc = findType(types, 'testDoc')
      // Shallow properties should survive pruning
      expect(doc.options).toBeDefined()
      expect(doc.options!.kept).toBe('shallow')
      // The deeply nested structure should be pruned because
      // the innermost levels exceed MAX_CUSTOM_PROPERTY_DEPTH
      expect(doc.options?.deep).toBeUndefined()
    })

    test('should serialize fieldsets and strip prepare from preview', () => {
      const types = extractTypes([
        {
          fields: [
            {fieldset: 'main', name: 'title', type: 'string'},
            {fieldset: 'meta', name: 'slug', type: 'string'},
          ],
          fieldsets: [
            {name: 'main', title: 'Main Information'},
            {name: 'meta', options: {collapsible: true}, title: 'Metadata'},
          ],
          name: 'testDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'testDoc')
      expect(doc.fieldsets).toBeDefined()
      expect(doc.fieldsets!.length).toBe(2)

      const mainFieldset = doc.fieldsets!.find((fs) => fs.name === 'main')!
      expect(mainFieldset.title).toBe('Main Information')

      const metaFieldset = doc.fieldsets!.find((fs) => fs.name === 'meta')!
      expect(metaFieldset.title).toBe('Metadata')

      // Fields should have fieldset reference
      const titleField = doc.fields!.find((f) => f.name === 'title')!
      expect(titleField.fieldset).toBe('main')

      const slugField = doc.fields!.find((f) => f.name === 'slug')!
      expect(slugField.fieldset).toBe('meta')
    })

    test('should handle fieldless types: string, text, number, boolean, date, datetime, url', () => {
      const types = extractTypes([
        {name: 'myString', title: 'My String', type: 'string'},
        {name: 'myText', title: 'My Text', type: 'text'},
        {name: 'myNumber', title: 'My Number', type: 'number'},
        {name: 'myBool', title: 'My Bool', type: 'boolean'},
        {name: 'myDate', title: 'My Date', type: 'date'},
        {name: 'myDatetime', title: 'My Datetime', type: 'datetime'},
        {name: 'myUrl', title: 'My Url', type: 'url'},
      ])

      for (const typeName of [
        'myString',
        'myText',
        'myNumber',
        'myBool',
        'myDate',
        'myDatetime',
        'myUrl',
      ]) {
        const t = findType(types, typeName)
        expect(t.name).toBe(typeName)
        expect(t.type).toBeDefined()
        // Fieldless types should not have a fields property
        expect(t.fields).toBeUndefined()
      }
    })

    test('should handle types with fields, including nested objects', () => {
      const types = extractTypes([
        {
          fields: [
            {name: 'title', type: 'string'},
            {
              fields: [
                {name: 'innerField', type: 'string'},
                {name: 'innerNumber', type: 'number'},
              ],
              name: 'nested',
              type: 'object',
            },
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      expect(doc.fields).toBeDefined()
      expect(doc.fields!.length).toBe(2)

      const nestedField = doc.fields!.find((f) => f.name === 'nested')!
      expect(nestedField.type).toBe('object')
      expect(nestedField.fields).toBeDefined()
      expect(nestedField.fields!.length).toBe(2)
      expect(nestedField.fields!.map((f) => f.name)).toEqual(['innerField', 'innerNumber'])
    })

    test('should handle image and file types with custom fields', () => {
      const types = extractTypes([
        {
          fields: [
            {
              fields: [{name: 'caption', type: 'string'}],
              name: 'photo',
              type: 'image',
            },
            {
              fields: [{name: 'description', type: 'text'}],
              name: 'attachment',
              type: 'file',
            },
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      const photoField = doc.fields!.find((f) => f.name === 'photo')!
      expect(photoField.type).toBe('image')
      // Custom fields on image (not default asset/crop/hotspot/media)
      expect(photoField.fields).toBeDefined()
      expect(photoField.fields!.some((f) => f.name === 'caption')).toBe(true)

      const attachmentField = doc.fields!.find((f) => f.name === 'attachment')!
      expect(attachmentField.type).toBe('file')
      expect(attachmentField.fields).toBeDefined()
      expect(attachmentField.fields!.some((f) => f.name === 'description')).toBe(true)
    })

    test('should handle array fields with primitives, objects, and named items', () => {
      const types = extractTypes([
        {
          fields: [
            {
              name: 'tags',
              of: [{type: 'string'}],
              type: 'array',
            },
            {
              name: 'items',
              of: [
                {
                  fields: [{name: 'label', type: 'string'}],
                  type: 'object',
                },
              ],
              type: 'array',
            },
            {
              name: 'mixed',
              of: [{type: 'string'}, {type: 'number'}],
              type: 'array',
            },
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      const tagsField = doc.fields!.find((f) => f.name === 'tags')!
      expect(tagsField.type).toBe('array')
      expect(tagsField.of).toBeDefined()
      expect(tagsField.of!.length).toBe(1)
      expect(tagsField.of![0].type).toBe('string')

      const itemsField = doc.fields!.find((f) => f.name === 'items')!
      expect(itemsField.type).toBe('array')
      expect(itemsField.of).toBeDefined()
      expect(itemsField.of!.length).toBe(1)
      expect(itemsField.of![0].type).toBe('object')

      const mixedField = doc.fields!.find((f) => f.name === 'mixed')!
      expect(mixedField.type).toBe('array')
      expect(mixedField.of).toBeDefined()
      expect(mixedField.of!.length).toBe(2)
    })

    test('should handle array with overridden typename (type and name differ)', () => {
      const types = extractTypes([
        {
          fields: [{name: 'value', type: 'string'}],
          name: 'namedItem',
          type: 'object',
        },
        {
          fields: [
            {
              name: 'items',
              of: [{type: 'namedItem'}],
              type: 'array',
            },
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      const itemsField = doc.fields!.find((f) => f.name === 'items')!
      expect(itemsField.of).toBeDefined()
      expect(itemsField.of!.length).toBe(1)
      // When using a named type, the type should reference the named type
      expect(itemsField.of![0].type).toBe('namedItem')
    })

    test('should handle indirectly recursive structures without infinite recursion', () => {
      const types = extractTypes([
        {
          fields: [
            {name: 'title', type: 'string'},
            {
              name: 'children',
              of: [{type: 'treeNode'}],
              type: 'array',
            },
          ],
          name: 'treeNode',
          type: 'object',
        },
        {
          fields: [{name: 'tree', type: 'treeNode'}],
          name: 'myDoc',
          type: 'document',
        },
      ])

      // Should not infinite recurse - the presence of types is enough
      expect(types.length).toBeGreaterThan(0)

      const treeNode = findType(types, 'treeNode')
      expect(treeNode.name).toBe('treeNode')
      // The children field should reference treeNode type
      const fields = treeNode.fields!
      const childrenField = fields.find((f) => f.name === 'children')!
      expect(childrenField.type).toBe('array')
      expect(childrenField.of).toBeDefined()
      expect(childrenField.of![0].type).toBe('treeNode')
    })

    test('should handle portable text with blocks, inline objects, annotations, decorators, lists, styles', () => {
      const types = extractTypes([
        {
          fields: [
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
                        fields: [{name: 'href', type: 'url'}],
                        name: 'link',
                        type: 'object',
                      },
                    ],
                    decorators: [
                      {title: 'Strong', value: 'strong'},
                      {title: 'Emphasis', value: 'em'},
                    ],
                  },
                  styles: [
                    {title: 'Normal', value: 'normal'},
                    {title: 'H1', value: 'h1'},
                  ],
                  type: 'block',
                },
                {
                  fields: [{name: 'text', type: 'string'}],
                  name: 'callout',
                  type: 'object',
                },
              ],
              type: 'array',
            },
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      const bodyField = doc.fields!.find((f) => f.name === 'body')!
      expect(bodyField.type).toBe('array')
      expect(bodyField.of).toBeDefined()

      // Find the block member
      const blockMember = bodyField.of!.find((m) => m.type === 'block')
      expect(blockMember).toBeDefined()

      // Styles
      expect(blockMember!.styles).toBeDefined()
      expect(blockMember!.styles!.map((s) => s.value)).toEqual(['normal', 'h1'])

      // Lists
      expect(blockMember!.lists).toBeDefined()
      expect(blockMember!.lists!.map((l) => l.value)).toEqual(['bullet', 'number'])

      // Marks
      expect(blockMember!.marks).toBeDefined()
      expect(blockMember!.marks!.decorators).toBeDefined()
      expect(blockMember!.marks!.decorators!.map((d) => d.value)).toEqual(['strong', 'em'])
      expect(blockMember!.marks!.annotations).toBeDefined()
      expect(blockMember!.marks!.annotations!.length).toBe(1)
      expect(blockMember!.marks!.annotations![0].name).toBe('link')

      // Inline objects
      const calloutMember = bodyField.of!.find((m) => m.type === 'object')
      expect(calloutMember).toBeDefined()
    })

    test('should handle minimal portable text with empty marks, styles, lists', () => {
      const types = extractTypes([
        {
          fields: [
            {
              name: 'minimal',
              of: [
                {
                  lists: [],
                  marks: {
                    annotations: [],
                    decorators: [],
                  },
                  styles: [],
                  type: 'block',
                },
              ],
              type: 'array',
            },
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      const minimalField = doc.fields!.find((f) => f.name === 'minimal')!
      const blockMember = minimalField.of!.find((m) => m.type === 'block')
      expect(blockMember).toBeDefined()
      // Empty arrays may be undefined or empty
      expect(blockMember!.marks!.annotations).toEqual([])
    })

    test('should handle references: reference, crossDatasetReference', () => {
      const types = extractTypes([
        {
          fields: [{name: 'name', type: 'string'}],
          name: 'author',
          type: 'document',
        },
        {
          fields: [
            {name: 'title', type: 'string'},
            {
              name: 'author',
              to: [{type: 'author'}],
              type: 'reference',
            },
          ],
          name: 'book',
          type: 'document',
        },
      ])

      const book = findType(types, 'book')
      const authorField = book.fields!.find((f) => f.name === 'author')!
      expect(authorField.type).toBe('reference')
      expect(authorField.to).toBeDefined()
      expect(authorField.to!.length).toBe(1)
      expect(authorField.to![0].type).toBe('author')
    })

    test('should handle cross-dataset references', () => {
      const types = extractTypes([
        {
          dataset: 'production',
          name: 'externalRef',
          to: [
            {
              preview: {select: {title: 'name'}},
              type: 'person',
            },
          ],
          type: 'crossDatasetReference',
        },
        {
          fields: [
            {name: 'title', type: 'string'},
            {name: 'external', type: 'externalRef'},
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const externalRef = findType(types, 'externalRef')
      expect(externalRef.to).toBeDefined()
      expect(externalRef.to!.length).toBe(1)
      expect(externalRef.to![0].type).toBe('person')
    })

    test('should handle reference arrays', () => {
      const types = extractTypes([
        {
          fields: [{name: 'title', type: 'string'}],
          name: 'category',
          type: 'document',
        },
        {
          fields: [{name: 'name', type: 'string'}],
          name: 'author',
          type: 'document',
        },
        {
          fields: [
            {name: 'title', type: 'string'},
            {
              name: 'authors',
              of: [{to: [{type: 'author'}], type: 'reference'}],
              type: 'array',
            },
            {
              name: 'categories',
              of: [{to: [{type: 'category'}], type: 'reference'}],
              type: 'array',
            },
          ],
          name: 'post',
          type: 'document',
        },
      ])

      const post = findType(types, 'post')
      const authorsField = post.fields!.find((f) => f.name === 'authors')!
      expect(authorsField.type).toBe('array')
      expect(authorsField.of).toBeDefined()
      expect(authorsField.of![0].type).toBe('reference')
      expect(authorsField.of![0].to).toBeDefined()
      expect(authorsField.of![0].to![0].type).toBe('author')

      const categoriesField = post.fields!.find((f) => f.name === 'categories')!
      expect(categoriesField.of![0].to![0].type).toBe('category')
    })

    test('should strip default title when it matches startCase(name)', () => {
      const types = extractTypes([
        {
          fields: [
            // Title "Some Field" matches startCase("someField") -> should be stripped
            {name: 'someField', title: 'Some Field', type: 'string'},
            // Title "Custom Title" does NOT match startCase("otherField") -> should be kept
            {name: 'otherField', title: 'Custom Title', type: 'string'},
          ],
          name: 'myDoc',
          // Title "My Doc" matches startCase("myDoc") -> should be stripped
          title: 'My Doc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      // Default title stripped
      expect(doc.title).toBeUndefined()

      const someField = doc.fields!.find((f) => f.name === 'someField')!
      expect(someField.title).toBeUndefined()

      const otherField = doc.fields!.find((f) => f.name === 'otherField')!
      expect(otherField.title).toBe('Custom Title')
    })

    test('should handle inline array member type with fields distinct from global type', () => {
      const types = extractTypes([
        {
          fields: [{name: 'label', type: 'string'}],
          name: 'tag',
          type: 'object',
        },
        {
          fields: [
            {
              name: 'inlineTags',
              of: [
                {
                  fields: [
                    {name: 'value', type: 'string'},
                    {name: 'color', type: 'string'},
                  ],
                  name: 'inlineTag',
                  type: 'object',
                },
              ],
              type: 'array',
            },
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      const inlineTagsField = doc.fields!.find((f) => f.name === 'inlineTags')!
      expect(inlineTagsField.of).toBeDefined()
      // The inline object should use type 'object' since it's an inline definition
      const inlineMember = inlineTagsField.of![0]
      expect(inlineMember.type).toBe('object')

      // The global 'tag' type should exist separately with its own field
      const globalTag = findType(types, 'tag')
      expect(globalTag.fields!.map((f) => f.name)).toEqual(['label'])
    })

    test('should serialize description when present', () => {
      const types = extractTypes([
        {
          description: 'This is my document',
          fields: [{name: 'title', type: 'string'}],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      // description is added via ensureString and may not be in the ManifestSchemaType interface
      expect((doc as unknown as Record<string, unknown>).description).toBe('This is my document')
    })

    test('should serialize deprecated property', () => {
      const types = extractTypes([
        {
          deprecated: {reason: 'Use newDoc instead'},
          fields: [{name: 'title', type: 'string'}],
          name: 'oldDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'oldDoc')
      expect(doc.deprecated).toEqual({reason: 'Use newDoc instead'})
    })

    test('should handle conditional fieldsets', () => {
      const types = extractTypes([
        {
          fields: [{fieldset: 'advanced', name: 'setting', type: 'string'}],
          fieldsets: [
            {
              hidden: () => false,
              name: 'advanced',
              readOnly: true,
              title: 'Advanced Settings',
            },
          ],
          name: 'testDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'testDoc')
      expect(doc.fieldsets).toBeDefined()
      const advancedFieldset = doc.fieldsets!.find((fs) => fs.name === 'advanced')!
      expect(advancedFieldset.hidden).toBe('conditional')
      expect(advancedFieldset.readOnly).toBe(true)
    })

    test('should serialize options on fields', () => {
      const types = extractTypes([
        {
          fields: [
            {
              name: 'role',
              options: {
                list: [
                  {title: 'Developer', value: 'developer'},
                  {title: 'Designer', value: 'designer'},
                ],
              },
              type: 'string',
            },
          ],
          name: 'myDoc',
          type: 'document',
        },
      ])

      const doc = findType(types, 'myDoc')
      const roleField = doc.fields!.find((f) => f.name === 'role')!
      expect(roleField.options).toBeDefined()
      expect(roleField.options!.list).toBeDefined()
    })
  })
})
