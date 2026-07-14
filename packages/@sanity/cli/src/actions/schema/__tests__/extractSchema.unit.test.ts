import {type ExtractOptions} from '@sanity/cli-build/_internal/extract'
import {createMockOutput} from '@sanity/cli-test/test/util'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockedSchemaExtraction = vi.hoisted(() => vi.fn())

vi.mock(import('@sanity/cli-build/_internal/extract'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    runSchemaExtraction: mockedSchemaExtraction,
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
const {extractSchema} = await import('../extractSchema.js')

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

describe('extractSchema', () => {
  beforeEach(() => {
    mockedSchemaExtraction.mockResolvedValue([])
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should pass options to runSchemaExtraction', async () => {
    const output = createMockOutput()
    const watchPattern = '**/globs/ahoy/*.coffeescript'
    await extractSchema({
      extractOptions: createMockExtractionOptions({
        enforceRequiredFields: true,
        watchPatterns: [watchPattern],
      }),
      output,
    })
    expect(mockedSchemaExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        enforceRequiredFields: true,
        watchPatterns: expect.arrayContaining([watchPattern]),
      }),
    )
  })
})
