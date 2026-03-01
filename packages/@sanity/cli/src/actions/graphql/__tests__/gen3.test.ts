import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {extractFromSanitySchema} from '../extractFromSanitySchema.js'
import generateSchema from '../gen3/index.js'
import manySelfRefsSchema from './fixtures/many-self-refs.js'
import testStudioSchema from './fixtures/test-studio.js'
import unionRefsSchema from './fixtures/union-refs.js'
import {sortGraphQLSchema} from './helpers.js'

describe('GraphQL - Generation 3', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Should be able to generate graphql schema', () => {
    const extracted = extractFromSanitySchema(testStudioSchema, {
      nonNullDocumentFields: false,
    })

    const schema = generateSchema(extracted)

    expect(schema.generation).toBe('gen3')
    expect(sortGraphQLSchema(schema)).toMatchSnapshot()
  })

  it('Should be able to generate graphql schema with filterType prefix', () => {
    const extracted = extractFromSanitySchema(testStudioSchema, {
      nonNullDocumentFields: false,
    })

    const suffix = 'CustomFilterSuffix'

    const schema = generateSchema(extracted, {filterSuffix: suffix})

    expect(schema.types.filter((type) => type.name.endsWith(suffix))).not.toHaveLength(0)
    expect(sortGraphQLSchema(schema)).toMatchSnapshot()
  })

  describe.each([
    {name: 'testStudioSchema', sanitySchema: testStudioSchema},
    {name: 'manySelfRefsSchema', sanitySchema: manySelfRefsSchema},
    {name: 'unionRefsSchema', sanitySchema: unionRefsSchema},
  ])(`Union cache: sanitySchema: $name`, ({sanitySchema}) => {
    it.each([true, false])(
      'Should be able to generate graphql schema, withUnionCache: %p',
      (withUnionCache) => {
        const extracted = extractFromSanitySchema(sanitySchema, {
          nonNullDocumentFields: false,
          withUnionCache,
        })

        const schema = generateSchema(extracted)

        expect(schema.generation).toBe('gen3')
        expect(sortGraphQLSchema(schema)).toMatchSnapshot()
      },
    )

    it('Should generate the same schema with and without union cache', () => {
      const extractedWithoutUnionCache = extractFromSanitySchema(sanitySchema, {
        nonNullDocumentFields: false,
        withUnionCache: false,
      })

      const extractedWithUnionCache = extractFromSanitySchema(sanitySchema, {
        nonNullDocumentFields: false,
        withUnionCache: true,
      })

      expect(extractedWithoutUnionCache).toEqual(extractedWithUnionCache)

      const schemaWithoutUnionCache = generateSchema(extractedWithoutUnionCache)
      const schemaWithUnionCache = generateSchema(extractedWithUnionCache)
      expect(sortGraphQLSchema(schemaWithoutUnionCache)).toEqual(
        sortGraphQLSchema(schemaWithUnionCache),
      )
    })
  })
})
