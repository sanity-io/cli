import {describe, expect, test} from 'vitest'

import {isSchemaError} from '../isSchemaError.js'

describe('isSchemaError', () => {
  test('returns true for error with schema._validation', () => {
    const err = {
      message: 'Schema error',
      schema: {
        _validation: [
          {
            path: [{kind: 'type', name: 'post', type: 'document'}],
            problems: [{message: 'Unknown type', severity: 'error'}],
          },
        ],
      },
    }
    expect(isSchemaError(err)).toBe(true)
  })

  test('returns true for schema with only warnings', () => {
    const err = {
      message: 'Schema warning',
      schema: {
        _validation: [
          {
            path: [{kind: 'type', name: 'post', type: 'document'}],
            problems: [{message: 'Deprecated type usage', severity: 'warning'}],
          },
        ],
      },
    }
    expect(isSchemaError(err)).toBe(true)
  })

  test('returns true for schema with empty _validation array', () => {
    const err = {schema: {_validation: []}}
    expect(isSchemaError(err)).toBe(true)
  })

  test('returns false for null', () => {
    expect(isSchemaError(null)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isSchemaError(undefined)).toBe(false)
  })

  test('returns false for plain Error', () => {
    expect(isSchemaError(new Error('plain error'))).toBe(false)
  })

  test('returns false for object without schema property', () => {
    expect(isSchemaError({message: 'no schema'})).toBe(false)
  })

  test('returns false for object with null schema', () => {
    expect(isSchemaError({schema: null})).toBe(false)
  })

  test('returns false for object with schema missing _validation', () => {
    expect(isSchemaError({schema: {name: 'test'}})).toBe(false)
  })
})
