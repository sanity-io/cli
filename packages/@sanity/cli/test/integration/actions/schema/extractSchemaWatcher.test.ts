import {exitCodes, type Output} from '@sanity/cli-core'
import {testFixture} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {startExtractSchemaWatcher} from '../../../../src/actions/schema/extractSchemaWatcher.js'

// Mock dependencies
const mockWatcherClose = vi.hoisted(() => vi.fn())
const mockWatcherOn = vi.hoisted(() => vi.fn())
const mockRunSchemaExtraction = vi.hoisted(() => vi.fn())

vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    close: mockWatcherClose,
    on: mockWatcherOn,
  })),
}))

vi.mock(import('@sanity/cli-build/_internal/extract'), async (importOriginal) => {
  return {...(await importOriginal()), runSchemaExtraction: mockRunSchemaExtraction}
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
    const {SchemaExtractionError} = await import('@sanity/cli-build/_internal/extract')
    mockRunSchemaExtraction.mockRejectedValue(
      new SchemaExtractionError('Validation failed', [
        {
          path: [{kind: 'type' as const, name: 'post', type: 'document'}],
          problems: [{message: 'Test validation error', severity: 'error' as const}],
        },
      ]),
    )

    const {watcher} = await startExtractSchemaWatcher({
      extractOptions: getExtractOptions(cwd),
      onExtraction: vi.fn(),
      output,
      watchPatterns: ['**/*.ts'],
    })

    expect(output.error).not.toHaveBeenCalled()
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Test validation error'))
    expect(watcher).toBeDefined()
  })

  test('exits process on non-validation errors', async () => {
    const cwd = await testFixture('basic-studio')
    mockRunSchemaExtraction.mockRejectedValue(new Error('Fatal error'))

    await startExtractSchemaWatcher({
      extractOptions: getExtractOptions(cwd),
      onExtraction: vi.fn(),
      output,
      watchPatterns: ['**/*.ts'],
    })

    expect(output.error).toHaveBeenCalledWith('Fatal error', {exit: exitCodes.RUNTIME_ERROR})
  })

  test('close function closes the watcher', async () => {
    const cwd = await testFixture('basic-studio')
    mockRunSchemaExtraction.mockResolvedValue([])

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
