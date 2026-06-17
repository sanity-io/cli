import {type ExtractOptions} from '@sanity/cli-build/_internal/extract'
import {Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockedStartExtractWatcher = vi.hoisted(() => vi.fn())

vi.mock(import('../extractSchemaWatcher.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    startExtractSchemaWatcher: mockedStartExtractWatcher,
  }
})

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getCliTelemetry: vi.fn().mockReturnValue({
      trace: vi.fn().mockReturnValue({complete: vi.fn(), log: vi.fn(), start: vi.fn()}),
    }),
  }
})

// Import module under test after mocks are set up
const {watchExtractSchema} = await import('../watchExtractSchema.js')

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}
function createMockExtractionOptions(overrides?: Partial<ExtractOptions>): ExtractOptions {
  return {
    configPath: 'doesntmatter/sanity.config.ts',
    enforceRequiredFields: false,
    format: 'groq-type-nodes' as const,
    outputPath: 'whocares/schema.json',
    watchPatterns: ['**/*.ts'],
    workspace: undefined,
    ...overrides,
  }
}

describe('watchExtractSchema', () => {
  beforeEach(() => {
    mockedStartExtractWatcher.mockResolvedValue({close: async () => {}})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should pass custom watch patterns to startExtractSchemaWatcher', async () => {
    const output = createMockOutput()
    const watchPattern = '**/globs/ahoy/*.coffeescript'
    await watchExtractSchema({
      extractOptions: createMockExtractionOptions({watchPatterns: [watchPattern]}),
      output,
    })
    expect(output.log).toHaveBeenCalledWith('Watching for changes in:')
    expect(output.log).toHaveBeenCalledWith(`  - ${watchPattern}`)
    expect(mockedStartExtractWatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        extractOptions: expect.objectContaining({
          watchPatterns: expect.arrayContaining([watchPattern]),
        }),
      }),
    )
  })
})
