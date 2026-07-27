import {type SpinnerInstance} from '@sanity/cli-core/ux'
import {type GenerationResult} from '@sanity/codegen'
import {describe, expect, test, vi} from 'vitest'

import {
  count,
  createTypegenProgressReporter,
  formatPath,
  percent,
} from '../reportTypegenProgress.js'

function createSpinMock({isSpinning = true}: {isSpinning?: boolean} = {}) {
  const spin = {
    fail: vi.fn(),
    isSpinning,
    start: vi.fn(),
    succeed: vi.fn(),
    text: '',
    warn: vi.fn(),
  }
  spin.start.mockReturnValue(spin)
  return spin as unknown as SpinnerInstance & {
    fail: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    succeed: ReturnType<typeof vi.fn>
    text: string
    warn: ReturnType<typeof vi.fn>
  }
}

const completeResult: GenerationResult = {
  code: '',
  duration: 42,
  emptyUnionTypeNodesGenerated: 0,
  filesWithErrors: 0,
  outputSize: 100,
  queriesCount: 2,
  queryFilesCount: 1,
  schemaTypesCount: 3,
  typeNodesGenerated: 5,
  unknownTypeNodesGenerated: 0,
  unknownTypeNodesRatio: 0,
}

describe('reportTypegenProgress helpers', () => {
  test('formatPath normalizes backslashes', () => {
    expect(formatPath('foo\\bar\\baz.ts')).toBe('foo/bar/baz.ts')
  })

  test('count picks singular/plural', () => {
    expect(count(1, 'files')).toBe('1 file')
    expect(count(2, 'files')).toBe('2 files')
    expect(count(1, 'queries', 'query')).toBe('1 query')
  })

  test('percent formats ratios', () => {
    expect(percent(0.5)).toBe('50.0%')
  })
})

describe('createTypegenProgressReporter', () => {
  test('renders schema load, generation progress, and success', () => {
    const spin = createSpinMock()
    const onProgress = createTypegenProgressReporter(spin, {
      generates: './sanity.types.ts',
      schemaPath: './schema.json',
    })

    onProgress({type: 'schemaLoaded'})
    expect(spin.succeed).toHaveBeenCalledWith('Schema loaded from ./schema.json')
    expect(spin.start).toHaveBeenCalledWith('Generating schema types…')

    onProgress({expectedFileCount: 4, type: 'typegenStarted'})
    expect(spin.text).toBe('Generating query types…')

    onProgress({schemaTypesCount: 3, type: 'schemaTypesGenerated'})

    onProgress({
      errors: [],
      evaluatedFiles: 2,
      expectedFileCount: 4,
      queriesCount: 2,
      queryFilesCount: 1,
      type: 'moduleEvaluated',
    })
    expect(spin.text).toContain('50.0%')
    expect(spin.text).toContain('Processed 2 of 4 files')

    onProgress({formatterName: 'prettier', type: 'formatting'})
    expect(spin.text).toContain('prettier')

    onProgress({result: completeResult, type: 'complete'})
    expect(spin.succeed).toHaveBeenCalledWith(
      expect.stringContaining('Successfully generated types to ./sanity.types.ts in 42ms'),
    )
    expect(spin.succeed).toHaveBeenCalledWith(
      expect.stringContaining('formatted the generated code with prettier'),
    )
  })

  test('surfaces per-file errors and formatting failures', () => {
    const spin = createSpinMock({isSpinning: false})
    const onProgress = createTypegenProgressReporter(spin, {
      generates: './out.ts',
      schemaPath: './schema.json',
    })

    onProgress({
      errors: ['bad query'],
      evaluatedFiles: 1,
      expectedFileCount: 1,
      queriesCount: 0,
      queryFilesCount: 0,
      type: 'moduleEvaluated',
    })
    expect(spin.fail).toHaveBeenCalledWith('bad query')
    expect(spin.start).toHaveBeenCalled()

    onProgress({
      formatterName: 'oxfmt',
      message: 'boom',
      type: 'formatFailed',
    })
    expect(spin.warn).toHaveBeenCalledWith('Failed to format generated types with oxfmt: boom')

    onProgress({
      result: {...completeResult, filesWithErrors: 2},
      type: 'complete',
    })
    expect(spin.warn).toHaveBeenCalledWith('Encountered errors in 2 files while generating types')
    expect(spin.succeed).toHaveBeenCalledWith(
      expect.stringContaining('an error occurred during formatting'),
    )
  })
})
