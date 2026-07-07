import {mocks} from '@sanity/cli-test/mocks'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ExtractSchemaCommand} from '../extract.js'

vi.mock('@sanity/cli-core/SanityCommand', async () => {
  const actual = await import('@sanity/cli-test/mocks')
  return {SanityCommand: actual.MockedSanityCommand}
})

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
