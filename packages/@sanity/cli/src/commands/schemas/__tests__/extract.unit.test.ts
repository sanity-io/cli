import { Command } from '@oclif/core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  const SanityCommand = vi.fn(class MockSanityCommand extends Command {
    // Same implementation as SanityCommand's, minus telemetry
    init = vi.fn(async() => {
      const {args, flags} = await this.parse({
        args: this.ctor.args,
        baseFlags: (super.ctor as typeof SanityCommand).baseFlags,
        enableJsonFlag: this.ctor.enableJsonFlag,
        flags: this.ctor.flags,
        strict: this.ctor.strict,
      })

      this.args = args as Args<T>
      this.flags = flags as Flags<T>

      await super.init()
    })
  })
  return { ...actual, SanityCommand }
})

// Mock extract module dependencies
const mockExtractSchema = vi.hoisted(() => vi.fn())
const mockWatchExtractSchema = vi.hoisted(() => vi.fn())
const mockExtractOptions = vi.hoisted(() => vi.fn())


vi.mock('../../../actions/schema/extractSchema.js', () => ({extractSchema: mockExtractSchema}))
vi.mock('../../../actions/schema/getExtractOptions.js', () => ({getExtractOptions: mockExtractOptions}))
vi.mock('../../../actions/schema/watchExtractSchema.js', () => ({extractSchema: mockWatchExtractSchema}))

// Finally import the module
const {ExtractSchemaCommand} = await import('../extract.js')

describe('schema extract command', () => {
  beforeEach(() => {
    mockCliCmdGetProjectRoot.mockResolvedValue('/some/dir')
    mockCliCmdGetProjectId.mockResolvedValue('1337newb')
    mockCliCmdGetCliConfig.mockResolvedValue({schemaExtraction: {}})
    mockExtractSchema.mockResolvedValue(undefined)
    mockWatchExtractSchema.mockResolvedValue(undefined)
    mockExtractOptions.mockReturnValue({})
  })
  afterEach(() => { vi.clearAllMocks() })

  test('schema command with no args should invoke extractSchema module', async () => {
    await ExtractSchemaCommand.run([])
    expect(mockExtractSchema).toHaveBeenCalledOnce()
  })
})


