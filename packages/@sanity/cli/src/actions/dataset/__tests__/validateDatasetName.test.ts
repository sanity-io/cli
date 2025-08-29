import {describe, expect, test} from 'vitest'

import {validateDatasetName} from '../validateDatasetName'

describe('validateDatasetName', () => {
  test.each([
    ['abc', false],
    ['test-dataset', false],
    ['test_dataset', false],
    ['dataset123', false],
    ['a1', false],
    ['1a', false],
    ['ab', false],
    ['test-123_dataset', false],
    // 64 character name (max length)
    ['abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01', false],
  ])('should return false for valid dataset name: "%s"', (datasetName, expected) => {
    expect(validateDatasetName(datasetName)).toBe(expected)
  })

  test.each([
    ['', 'Dataset name is missing'],
    [null as unknown as string, 'Dataset name is missing'],
    [undefined as unknown as string, 'Dataset name is missing'],
  ])('should return error for missing dataset name: %s', (datasetName, expected) => {
    expect(validateDatasetName(datasetName)).toBe(expected)
  })

  test.each([
    ['Test', 'Dataset name must be all lowercase characters'],
    ['TEST', 'Dataset name must be all lowercase characters'],
    ['tEst', 'Dataset name must be all lowercase characters'],
    ['test-Dataset', 'Dataset name must be all lowercase characters'],
  ])('should return error for non-lowercase names: "%s"', (datasetName, expected) => {
    expect(validateDatasetName(datasetName)).toBe(expected)
  })

  test.each([
    ['a', 'Dataset name must be at least two characters long'],
    ['1', 'Dataset name must be at least two characters long'],
    ['-', 'Dataset name must be at least two characters long'],
  ])('should return error for names shorter than 2 characters: "%s"', (datasetName, expected) => {
    expect(validateDatasetName(datasetName)).toBe(expected)
  })

  test('should return error for names longer than 64 characters', () => {
    const longName = 'a'.repeat(65)
    expect(validateDatasetName(longName)).toBe('Dataset name must be at most 64 characters')
  })

  test.each([
    ['-abc', 'Dataset name must start with a letter or a number'],
    ['_abc', 'Dataset name must start with a letter or a number'],
    ['-123', 'Dataset name must start with a letter or a number'],
    ['_test', 'Dataset name must start with a letter or a number'],
  ])(
    'should return error for names not starting with letter or number: "%s"',
    (datasetName, expected) => {
      expect(validateDatasetName(datasetName)).toBe(expected)
    },
  )

  test.each([
    ['test!', 'Dataset name must only contain letters, numbers, dashes and underscores'],
    ['test@name', 'Dataset name must only contain letters, numbers, dashes and underscores'],
    ['test name', 'Dataset name must only contain letters, numbers, dashes and underscores'],
    ['test.name', 'Dataset name must only contain letters, numbers, dashes and underscores'],
    ['test#123', 'Dataset name must only contain letters, numbers, dashes and underscores'],
    ['test$', 'Dataset name must only contain letters, numbers, dashes and underscores'],
  ])('should return error for names with invalid characters: "%s"', (datasetName, expected) => {
    expect(validateDatasetName(datasetName)).toBe(expected)
  })

  test.each([
    ['test-', 'Dataset name must not end with a dash or an underscore'],
    ['test_', 'Dataset name must not end with a dash or an underscore'],
    ['dataset123-', 'Dataset name must not end with a dash or an underscore'],
    ['dataset123_', 'Dataset name must not end with a dash or an underscore'],
  ])(
    'should return error for names ending with dash or underscore: "%s"',
    (datasetName, expected) => {
      expect(validateDatasetName(datasetName)).toBe(expected)
    },
  )

  test('should handle edge case: exactly 64 characters', () => {
    // Test exactly 64 characters - should be valid
    const maxLengthName = 'a'.repeat(64)
    expect(validateDatasetName(maxLengthName)).toBe(false)
  })

  test('should handle edge case: 2 characters starting with number', () => {
    expect(validateDatasetName('1a')).toBe(false)
  })

  test('should handle edge case: 2 characters starting with letter', () => {
    expect(validateDatasetName('a1')).toBe(false)
  })
})
