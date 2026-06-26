import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'

// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks} = createMockSanityCommand()
// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, SanityCommand: MockedSanityCommand}
})

// Third: mock extract schema command imports
const mockExtractSchema = vi.hoisted(() => vi.fn())
const mockWatchExtractSchema = vi.hoisted(() => vi.fn())
const mockExtractOptions = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/schema/extractSchema.js', () => ({extractSchema: mockExtractSchema}))
vi.mock('../../../actions/schema/getExtractOptions.js', () => ({
  getExtractOptions: mockExtractOptions,
}))
vi.mock('../../../actions/schema/watchExtractSchema.js', () => ({
  watchExtractSchema: mockWatchExtractSchema,
}))

// Finally, import the module under test: extract schema command
const {ExtractSchemaCommand} = await import('../extract.js')

describe('schema extract command', () => {
  beforeEach(() => {
    mocks.SanityCmdGetProjectRoot.mockResolvedValue('/some/dir')
    mocks.SanityCmdGetProjectId.mockResolvedValue('1337newb')
    mocks.SanityCmdGetCliConfig.mockResolvedValue({schemaExtraction: {}})
    mockExtractSchema.mockResolvedValue(undefined)
    mockWatchExtractSchema.mockResolvedValue(undefined)
    mockExtractOptions.mockReturnValue({})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('schema command with no args should invoke extractSchema module', async () => {
    await ExtractSchemaCommand.run([])
    expect(mockExtractSchema).toHaveBeenCalledOnce()
  })
  test('schema command with watch flag should invoke watchExtractSchema module', async () => {
    await ExtractSchemaCommand.run(['--watch'])
    expect(mockWatchExtractSchema).toHaveBeenCalledOnce()
  })
  test('schema command bad flags', async () => {
    await expect(ExtractSchemaCommand.run(['--poop'])).rejects.toThrow('Nonexistent flag')
  })
})
