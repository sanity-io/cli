import orderBy from 'lodash-es/orderBy.js'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {extractFromSanitySchema} from '../extractFromSanitySchema.js'
import {type ApiSpecification} from '../types.js'
import testStudioSchema from './fixtures/test-studio.js'
import unionRefsSchema from './fixtures/union-refs.js'

describe('GraphQL - Schema extraction', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Should be able to extract a simple schema', () => {
    const extracted = extractFromSanitySchema(testStudioSchema, {
      nonNullDocumentFields: false,
    })

    expect(sortExtracted(extracted)).toMatchSnapshot()
  })

  it('Should be able to extract schema with union refs', () => {
    const extracted = extractFromSanitySchema(unionRefsSchema, {
      nonNullDocumentFields: false,
    })

    expect(sortExtracted(extracted)).toMatchSnapshot()
  })
})

function sortExtracted(schema: ApiSpecification) {
  const interfaces = orderBy(schema.interfaces, (iface) => iface.name).map((iface) => ({
    ...iface,
    fields: orderBy(iface.fields, (field) => field.fieldName),
  }))

  const types = orderBy(schema.types, (type) => type.name).map((type) => ({
    ...type,
    fields: orderBy((type as {fields?: {fieldName: string}[]}).fields, (field) => field.fieldName),
  }))

  return {interfaces, types}
}
