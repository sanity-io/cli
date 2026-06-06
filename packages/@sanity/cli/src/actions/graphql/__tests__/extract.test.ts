import orderBy from 'lodash-es/orderBy.js'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {extractFromSanitySchema} from '../extractFromSanitySchema.js'
import {type ApiSpecification} from '../types.js'
import nativeUnionsSchema from './fixtures/native-unions.js'
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

  it('Should fall back to effective naming for a union mixed with a reference', () => {
    const extracted = extractFromSanitySchema(nativeUnionsSchema, {
      nonNullDocumentFields: false,
    })

    const campaign = extracted.types.find((type) => type.name === 'Campaign')
    if (!campaign || !('fields' in campaign)) {
      throw new Error('Expected a Campaign type with fields')
    }

    // `mixedRef` is an array combining the `promotion` union with a reference. That is not
    // nameable from the declared view, so the name falls back to the effective concatenation
    // (the union's concrete members plus the reference target), not a declared union name.
    const mixedRef = campaign.fields.find((f) => f.fieldName === 'mixedRef')
    expect(mixedRef?.kind).toBe('List')
    if (!mixedRef || !('children' in mixedRef)) {
      throw new Error('Expected mixedRef to be a list field')
    }
    expect(mixedRef.children.type).toBe('ArticlePromotionOrBookOrProductPromotion')

    const union = extracted.types.find(
      (type) => type.kind === 'Union' && type.name === 'ArticlePromotionOrBookOrProductPromotion',
    )
    if (!union || union.kind !== 'Union') {
      throw new Error('Expected the effective-named union to be registered')
    }
    expect(union.types).toEqual(['ArticlePromotion', 'Book', 'ProductPromotion'])
  })

  it('Should emit the authored name for a direct named-union field', () => {
    const extracted = extractFromSanitySchema(nativeUnionsSchema, {
      nonNullDocumentFields: false,
    })

    const promotion = extracted.types.find(
      (type) => type.kind === 'Union' && type.name === 'Promotion',
    )
    if (!promotion || promotion.kind !== 'Union') {
      throw new Error('Expected a Promotion union to be registered')
    }
    expect(promotion.types).toEqual(['ArticlePromotion', 'ProductPromotion'])

    const campaign = extracted.types.find((type) => type.name === 'Campaign')
    if (!campaign || !('fields' in campaign)) {
      throw new Error('Expected a Campaign type with fields')
    }
    const field = campaign.fields.find((f) => f.fieldName === 'featuredPromotion')
    expect(field?.type).toBe('Promotion')
  })

  it('Should not emit native union declarations as top-level object types', () => {
    const extracted = extractFromSanitySchema(nativeUnionsSchema, {
      nonNullDocumentFields: false,
    })

    // Every top-level entry must be a well-formed definition with a string `kind`.
    for (const type of extracted.types) {
      expect(typeof type.kind).toBe('string')
    }

    // The union declarations must not leak in as malformed entries keyed by their original name.
    const leaked = extracted.types.filter(
      (type) =>
        'originalName' in type &&
        ['editorialTarget', 'pageBlock', 'promotion'].includes(type.originalName ?? ''),
    )
    expect(leaked).toEqual([])
  })

  it('Should flatten a direct union-of-union field to concrete members', () => {
    const extracted = extractFromSanitySchema(nativeUnionsSchema, {
      nonNullDocumentFields: false,
    })

    const campaign = extracted.types.find((type) => type.name === 'Campaign')
    if (!campaign || !('fields' in campaign)) {
      throw new Error('Expected a Campaign type with fields')
    }
    const field = campaign.fields.find((f) => f.fieldName === 'featuredBlock')
    expect(field?.type).toBe('PageBlock')

    const pageBlock = extracted.types.find(
      (type) => type.kind === 'Union' && type.name === 'PageBlock',
    )
    if (!pageBlock || pageBlock.kind !== 'Union') {
      throw new Error('Expected a PageBlock union')
    }
    // pageBlock reuses the `promotion` union, so its compiled `of` is already flattened
    // to the concrete members. The GraphQL union must list only concrete object types.
    expect(pageBlock.types).toEqual(['ArticlePromotion', 'Gallery', 'ProductPromotion'])
  })

  it('Should name array unions from the declared view', () => {
    const extracted = extractFromSanitySchema(nativeUnionsSchema, {
      nonNullDocumentFields: false,
    })

    const campaign = extracted.types.find((type) => type.name === 'Campaign')
    if (!campaign || !('fields' in campaign)) {
      throw new Error('Expected a Campaign type with fields')
    }

    // Single declared union -> bare union name; members are the effective flattened set
    const content = campaign.fields.find((f) => f.fieldName === 'content')
    expect(content?.kind).toBe('List')
    if (!content || !('children' in content)) {
      throw new Error('Expected the content field to be a List with children')
    }
    expect(content.children.type).toBe('PageBlock')
    const pageBlock = extracted.types.find(
      (type) => type.kind === 'Union' && type.name === 'PageBlock',
    )
    if (!pageBlock || pageBlock.kind !== 'Union') {
      throw new Error('Expected a PageBlock union')
    }
    expect(pageBlock.types).toEqual(['ArticlePromotion', 'Gallery', 'ProductPromotion'])

    // Mixed union + concrete -> stable declared-name join, effective members
    const mixed = campaign.fields.find((f) => f.fieldName === 'mixed')
    if (!mixed || !('children' in mixed)) {
      throw new Error('Expected the mixed field to be a List with children')
    }
    expect(mixed.children.type).toBe('GalleryOrPromotion')
    const galleryOrPromotion = extracted.types.find(
      (type) => type.kind === 'Union' && type.name === 'GalleryOrPromotion',
    )
    if (!galleryOrPromotion || galleryOrPromotion.kind !== 'Union') {
      throw new Error('Expected a GalleryOrPromotion union')
    }
    expect(galleryOrPromotion.types).toEqual(['ArticlePromotion', 'Gallery', 'ProductPromotion'])
  })

  it('Should name reference unions from the declared document union', () => {
    const extracted = extractFromSanitySchema(nativeUnionsSchema, {
      nonNullDocumentFields: false,
    })

    const campaign = extracted.types.find((type) => type.name === 'Campaign')
    if (!campaign || !('fields' in campaign)) {
      throw new Error('Expected a Campaign type with fields')
    }

    const target = campaign.fields.find((f) => f.fieldName === 'target')
    expect(target?.type).toBe('EditorialTarget')
    expect(target?.isReference).toBe(true)

    const editorialTarget = extracted.types.find(
      (type) => type.kind === 'Union' && type.name === 'EditorialTarget',
    )
    if (!editorialTarget || editorialTarget.kind !== 'Union') {
      throw new Error('Expected an EditorialTarget union')
    }
    expect(editorialTarget.types).toEqual(['Author', 'Book'])

    // Array of references to a document union -> list child uses the declared name
    const relatedRefs = campaign.fields.find((f) => f.fieldName === 'relatedRefs')
    expect(relatedRefs?.kind).toBe('List')
    if (!relatedRefs || !('children' in relatedRefs)) {
      throw new Error('Expected relatedRefs to be a list field')
    }
    expect(relatedRefs.children.type).toBe('EditorialTarget')
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
