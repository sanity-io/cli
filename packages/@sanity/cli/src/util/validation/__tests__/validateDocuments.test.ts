import {type SanityDocument} from '@sanity/client'
import {describe, expect, test} from 'vitest'

import {
  DOCUMENT_VALIDATION_TIMEOUT,
  getReferenceIds,
  isValidId,
  levelValues,
  MAX_VALIDATION_CONCURRENCY,
  REFERENCE_INTEGRITY_BATCH_SIZE,
  shouldIncludeDocument,
} from '../validateDocumentsUtils'

describe('validateDocumentsUtils', () => {
  describe('constants', () => {
    test('should have correct values', () => {
      expect(DOCUMENT_VALIDATION_TIMEOUT).toBe(30_000)
      expect(MAX_VALIDATION_CONCURRENCY).toBe(100)
      expect(REFERENCE_INTEGRITY_BATCH_SIZE).toBe(100)
      expect(levelValues).toEqual({error: 0, info: 2, warning: 1})
    })
  })

  describe('getReferenceIds', () => {
    test('should extract reference IDs from various document structures', () => {
      const testCases = [
        {
          doc: {author: {_ref: 'author-123', _type: 'reference'}},
          expected: ['author-123'],
          name: 'simple reference',
        },
        {
          doc: {
            author: {_ref: 'author-123', _type: 'reference'},
            editor: {_ref: 'editor-456', _type: 'reference'},
          },
          expected: ['author-123', 'editor-456'],
          name: 'multiple references',
        },
        {
          doc: {
            authors: [
              {_ref: 'author-1', _type: 'reference'},
              {_ref: 'author-2', _type: 'reference'},
            ],
          },
          expected: ['author-1', 'author-2'],
          name: 'array of references',
        },
        {
          doc: {
            content: {
              sections: [{author: {_ref: 'nested-author', _type: 'reference'}}],
            },
          },
          expected: ['nested-author'],
          name: 'nested references',
        },
        {
          doc: {
            author: {_ref: 'same-id', _type: 'reference'},
            editor: {_ref: 'same-id', _type: 'reference'},
          },
          expected: ['same-id'],
          name: 'duplicate references',
        },
        {
          doc: {content: 'Some content', title: 'Test'},
          expected: [],
          name: 'no references',
        },
      ]

      for (const {doc, expected, name} of testCases) {
        const ids = getReferenceIds(doc)
        expect(ids.size, `Failed for: ${name}`).toBe(expected.length)
        for (const id of expected) {
          expect(ids.has(id), `Missing ID ${id} for: ${name}`).toBe(true)
        }
      }
    })

    test.each([
      ['empty object', {}],
      ['empty array', []],
      ['null', null],
      ['undefined', undefined],
      ['string', 'string'],
      ['number', 123],
      ['boolean', true],
    ])('should return empty set for %s', (_, value) => {
      expect(getReferenceIds(value).size).toBe(0)
    })
  })

  describe('isValidId', () => {
    test.each([
      ['abc123', true],
      ['ABC123', true],
      ['doc-123', true],
      ['doc_123', true],
      ['doc.123', true],
      ['doc_123-456.789', true],
      ['a', true],
      ['-invalid', false],
      ['', false],
      [123, false],
      [null, false],
      [undefined, false],
      [{}, false],
      [[], false],
    ])('isValidId(%s) should return %s', (id, expected) => {
      expect(isValidId(id)).toBe(expected)
    })
  })

  describe('shouldIncludeDocument', () => {
    test.each([
      ['article', true],
      ['myCustomType', true],
      ['my-custom_type', true],
      ['systemConfig', true],
      ['sanityConfig', true],
      ['insanity', true],
      ['system.settings', false],
      ['system.config', false],
      ['system.user', false],
      ['sanity.imageAsset', false],
      ['sanity.fileAsset', false],
      ['sanity.dashboard', false],
    ])('document type "%s" should be included: %s', (type, expected) => {
      const doc = {_id: '123', _rev: 'v1', _type: type} as SanityDocument
      expect(shouldIncludeDocument(doc)).toBe(expected)
    })
  })
})
