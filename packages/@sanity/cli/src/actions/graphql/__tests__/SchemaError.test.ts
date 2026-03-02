import {type Output} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {SchemaError} from '../SchemaError.js'

const mockFormatSchemaValidation = vi.hoisted(() => vi.fn())

vi.mock('../../schema/formatSchemaValidation.js', () => ({
  formatSchemaValidation: mockFormatSchemaValidation,
}))

describe('SchemaError', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('stores problemGroups and sets name', () => {
    const groups: SchemaValidationProblemGroup[] = [
      {
        path: [{kind: 'type', name: 'post', type: 'document'}],
        problems: [{message: 'Unknown type: "nonExistent"', severity: 'error'}],
      },
    ]

    const error = new SchemaError(groups)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SchemaError')
    expect(error.message).toBe('Schema errors encountered')
    expect(error.problemGroups).toBe(groups)
  })

  test('print() warns with header and logs formatted validation', () => {
    const groups: SchemaValidationProblemGroup[] = [
      {
        path: [{kind: 'type', name: 'post', type: 'document'}],
        problems: [{message: 'Unknown type: "nonExistent"', severity: 'error'}],
      },
    ]
    mockFormatSchemaValidation.mockReturnValue('<formatted output>')

    const output: Output = {
      error: vi.fn() as unknown as Output['error'],
      log: vi.fn(),
      warn: vi.fn(),
    }

    const error = new SchemaError(groups)
    error.print(output)

    expect(output.warn).toHaveBeenCalledWith('Found errors in schema:\n')
    expect(mockFormatSchemaValidation).toHaveBeenCalledWith(groups)
    expect(output.log).toHaveBeenCalledWith('<formatted output>')
  })
})
