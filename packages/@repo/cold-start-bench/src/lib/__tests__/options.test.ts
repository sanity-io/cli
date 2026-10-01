import {describe, expect, test, vi} from 'vitest'

import {benchOptions} from '../options.ts'

vi.mock('../measure.ts', () => ({ENTRY_POINTS: ['npx-sanity-init', 'npm-create-sanity']}))

describe('benchOptions', () => {
  test('defaults to both measurements and entry points with an explicit fixture scenario', () => {
    expect(benchOptions([])).toEqual({
      dataset: 'production',
      entries: ['npx-sanity-init', 'npm-create-sanity'],
      mode: 'all',
      project: 'bench123',
      runs: 3,
      template: 'clean',
      timeoutMs: 600_000,
    })
  })
  test('accepts scenario and measurement parameters', () => {
    expect(
      benchOptions([
        '--runs',
        '1',
        '--mode',
        'setup',
        '--entry',
        'npm-create-sanity',
        '--project',
        'test123',
        '--dataset',
        'staging',
        '--template',
        'blog',
        '--timeout-ms',
        '1000',
      ]),
    ).toMatchObject({
      dataset: 'staging',
      entries: ['npm-create-sanity'],
      mode: 'setup',
      project: 'test123',
      runs: 1,
      template: 'blog',
      timeoutMs: 1000,
    })
  })
  test.each([
    ['--runs', '0'],
    ['--runs', '1.5'],
    ['--timeout-ms', 'NaN'],
    ['--mode', 'unknown'],
    ['--entry', 'unknown'],
    ['--template', '../clean'],
    ['--project', 'invalid/id'],
    ['--dataset', ''],
  ])('rejects %s %s', (flag, value) => {
    expect(() => benchOptions([flag, value])).toThrow()
  })
})
