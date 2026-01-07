import {describe, expect, test} from 'vitest'

import {parseStringFlag} from '../parseStringFlag.js'

describe('parseStringFlag', () => {
  test.each([
    {
      desc: 'returns undefined when input is undefined',
      expected: undefined,
      flagName: 'dataset',
      input: undefined,
    },
    {
      desc: 'returns valid string when input is non-empty',
      expected: 'my-workspace',
      flagName: 'workspace',
      input: 'my-workspace',
    },
    {
      desc: 'returns string with spaces',
      expected: 'test value',
      flagName: 'tag',
      input: 'test value',
    },
  ])('$desc', async ({expected, flagName, input}) => {
    const result = await parseStringFlag(flagName, input)
    expect(result).toBe(expected)
  })

  test.each([
    {
      desc: 'empty string',
      expectedError: 'dataset argument is empty',
      flagName: 'dataset',
      input: '',
    },
  ])('throws error when $desc', async ({expectedError, flagName, input}) => {
    await expect(parseStringFlag(flagName, input)).rejects.toThrow(expectedError)
  })

  test('returns whitespace string as-is (no trimming)', async () => {
    const result = await parseStringFlag('workspace', '   ')
    expect(result).toBe('   ')
  })
})
