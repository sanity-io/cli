import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {extractFromSanitySchema} from '../extractFromSanitySchema.js'
import generateSchema from '../gen2/index.js'
import testStudioSchema from './fixtures/test-studio.js'
import {sortGraphQLSchema} from './helpers.js'

describe('GraphQL - Generation 2', () => {
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

    expect(schema.generation).toBe('gen2')
    expect(sortGraphQLSchema(schema)).toMatchSnapshot()
  })
})
