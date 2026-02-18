import {type Output} from '@sanity/cli-core'
import {testFixture} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {startExtractSchemaWatcher} from '../extractSchemaWatcher.js'

// Mock dependencies
const mockWatcherClose = vi.hoisted(() => vi.fn())
const mockWatcherOn = vi.hoisted(() => vi.fn())
const mockStudioWorkerTask = vi.hoisted(() => vi.fn())

vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    close: mockWatcherClose,
    on: mockWatcherOn,
  })),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, studioWorkerTask: mockStudioWorkerTask}
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    spinner: vi.fn(() => ({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
      text: '',
    })),
  }
})

const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

const getExtractOptions = (cwd: string) => ({
  configPath: `${cwd}/sanity.config.ts`,
  enforceRequiredFields: false,
  format: 'groq-type-nodes' as const,
  outputPath: `${cwd}/schema.json`,
  watchPatterns: ['**/*.ts'],
  workspace: undefined,
})

describe('extractSchemaWatcher', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('continues watching after validation errors', async () => {
    const cwd = await testFixture('basic-studio')
    mockStudioWorkerTask.mockResolvedValue({
      error: 'Validation failed',
      type: 'error',
      validation: [
        {
          path: [{kind: 'type' as const, name: 'post', type: 'document'}],
          problems: [{message: 'Test validation error', severity: 'error' as const}],
        },
      ],
    })

    const {watcher} = await startExtractSchemaWatcher({
      extractOptions: getExtractOptions(cwd),
      onExtraction: vi.fn(),
      output,
      watchPatterns: ['**/*.ts'],
    })

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Test validation error'))
    expect(output.error).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({exit: 1}),
    )
    expect(watcher).toBeDefined()
  })

  test('exits process on non-validation errors', async () => {
    const cwd = await testFixture('basic-studio')
    mockStudioWorkerTask.mockResolvedValue({error: 'Fatal error', type: 'error', validation: []})

    await startExtractSchemaWatcher({
      extractOptions: getExtractOptions(cwd),
      onExtraction: vi.fn(),
      output,
      watchPatterns: ['**/*.ts'],
    })

    expect(output.error).toHaveBeenCalledWith('Fatal error', {exit: 1})
  })

  test('close function closes the watcher', async () => {
    const cwd = await testFixture('basic-studio')
    mockStudioWorkerTask.mockResolvedValue({schema: [], type: 'success'})

    const {close} = await startExtractSchemaWatcher({
      extractOptions: getExtractOptions(cwd),
      onExtraction: vi.fn(),
      output,
      watchPatterns: ['**/*.ts'],
    })

    await close()

    expect(mockWatcherClose).toHaveBeenCalled()
  })
})
