import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'

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
const {createCmdInstance, mocks} = await createMockSanityCommand(ExtractSchemaCommand)

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
    await createCmdInstance([]).run()
    expect(mockExtractSchema).toHaveBeenCalledOnce()
  })
  test('schema command with watch flag should invoke watchExtractSchema module', async () => {
    await createCmdInstance(['--watch']).run()
    expect(mockWatchExtractSchema).toHaveBeenCalledOnce()
  })
  test('schema command bad flags', async () => {
    await expect(createCmdInstance(['--poop']).run()).rejects.toThrow('Nonexistent flag')
  })
})
