import {access} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'

vi.mock('node:fs/promises')

// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks} = createMockSanityCommand()
const mockGetCliConfig = vi.hoisted(() => vi.fn())
// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getCliConfig: mockGetCliConfig, SanityCommand: MockedSanityCommand}
})
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

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
const {NotFoundError} = await import('@sanity/cli-core')
const {ExtractSchemaCommand} = await import('../extract.js')
const mockAccess = vi.mocked(access)

describe('schema extract command', () => {
  beforeEach(() => {
    mocks.SanityCmdGetProjectRoot.mockResolvedValue({
      directory: '/some/dir',
      path: '/some/dir/sanity.config.ts',
      type: 'studio',
    })
    mocks.SanityCmdGetProjectId.mockResolvedValue('1337newb')
    mockGetCliConfig.mockResolvedValue({schemaExtraction: {}})
    mockExtractSchema.mockResolvedValue(undefined)
    mockWatchExtractSchema.mockResolvedValue(undefined)
    mockAccess.mockRejectedValue(new Error('ENOENT'))
    mockExtractOptions.mockReturnValue({outputPath: '/some/dir/schema.json'})
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
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
  test('uses an explicit Studio config without discovering a project root', async () => {
    const configPath = join('build-artifacts', 'studio', 'sanity.config.js')
    const resolvedConfigPath = resolve(configPath)

    await ExtractSchemaCommand.run(['--config-path', configPath])

    expect(mocks.SanityCmdGetProjectRoot).not.toHaveBeenCalled()
    expect(mockGetCliConfig).toHaveBeenCalledWith(dirname(resolvedConfigPath))
    expect(mockExtractOptions).toHaveBeenCalledWith({
      flags: expect.objectContaining({
        'config-path': configPath,
      }),
      projectRoot: {
        directory: dirname(resolvedConfigPath),
        path: resolvedConfigPath,
        type: 'studio',
      },
      schemaExtraction: {},
    })
  })
  test('does not require a CLI config when using an explicit Studio config', async () => {
    mockGetCliConfig.mockRejectedValue(new NotFoundError('No CLI config found'))

    await ExtractSchemaCommand.run(['--config-path', join('build-artifacts', 'sanity.config.js')])

    expect(mockExtractOptions).toHaveBeenCalledWith(
      expect.objectContaining({schemaExtraction: undefined}),
    )
    expect(mockExtractSchema).toHaveBeenCalledOnce()
  })
  test('still requires a CLI config when discovering the project root', async () => {
    const error = new NotFoundError('No CLI config found')
    mockGetCliConfig.mockRejectedValue(error)

    await expect(ExtractSchemaCommand.run([])).rejects.toBe(error)
  })
  test('does not ignore other CLI config loading failures', async () => {
    const error = new Error('Invalid CLI config')
    mockGetCliConfig.mockRejectedValue(error)

    await expect(
      ExtractSchemaCommand.run(['--config-path', join('build-artifacts', 'sanity.config.js')]),
    ).rejects.toBe(error)
  })
  test('redacts the Studio config path from telemetry', () => {
    expect(ExtractSchemaCommand.telemetry.redactedFlags).toEqual([
      {
        canonical: '--config-path',
        flags: ['--config-path'],
      },
      {
        canonical: '--path',
        flags: ['--path'],
      },
      {
        canonical: '--watch-patterns',
        flags: ['--watch-patterns'],
      },
    ])
  })
  test('schema command bad flags', async () => {
    await expect(ExtractSchemaCommand.run(['--poop'])).rejects.toThrow('Nonexistent flag')
  })
  test('requires --force before overwriting an existing schema file in unattended mode', async () => {
    mockAccess.mockResolvedValue(undefined)
    mocks.SanityCmdIsUnattended.mockReturnValue(true)

    await expect(ExtractSchemaCommand.run([])).rejects.toThrow('--force')
    expect(uxMocks.confirm).not.toHaveBeenCalled()
    expect(mockExtractSchema).not.toHaveBeenCalled()
  })

  test('prompts before overwriting an existing schema file in interactive mode', async () => {
    mockAccess.mockResolvedValue(undefined)
    uxMocks.confirm.mockResolvedValue(true)

    await ExtractSchemaCommand.run([])

    expect(uxMocks.confirm).toHaveBeenCalledWith({
      default: false,
      message: 'Schema file already exists at "/some/dir/schema.json". Overwrite it?',
    })
    expect(mockExtractSchema).toHaveBeenCalledOnce()
  })

  test('cancels when overwriting an existing schema file is declined', async () => {
    mockAccess.mockResolvedValue(undefined)
    uxMocks.confirm.mockResolvedValue(false)

    await ExtractSchemaCommand.run([])

    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith('Schema extraction cancelled')
    expect(mocks.OclifCmdExit).toHaveBeenCalledWith(exitCodes.USER_ABORT)
    expect(mockExtractSchema).not.toHaveBeenCalled()
  })

  test('overwrites an existing schema file with --force', async () => {
    mockAccess.mockResolvedValue(undefined)

    await ExtractSchemaCommand.run(['--force'])
    expect(uxMocks.confirm).not.toHaveBeenCalled()
    expect(mockExtractSchema).toHaveBeenCalledOnce()
  })
})
