import {stat} from 'node:fs/promises'

import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    stat: vi.fn(),
  }
})

const mockTrace = vi.hoisted(() => ({
  complete: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  start: vi.fn(),
}))

const mockRunTypegenGenerate = vi.hoisted(() => vi.fn())
const mockRunTypegenWatcher = vi.hoisted(() => vi.fn())
const mockReadConfig = vi.hoisted(() => vi.fn())
const mockConfigDefinitionParse = vi.hoisted(() => vi.fn())

const {MockedSanityCommand: BaseMockedSanityCommand, mocks} = createMockSanityCommand()

class MockedSanityCommand extends BaseMockedSanityCommand {
  protected telemetry = {
    trace: vi.fn().mockReturnValue(mockTrace),
  }
}

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, SanityCommand: MockedSanityCommand}
})
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

vi.mock('@sanity/codegen', () => ({
  configDefinition: {parse: mockConfigDefinitionParse},
  readConfig: mockReadConfig,
  runTypegenGenerate: mockRunTypegenGenerate,
  runTypegenWatcher: mockRunTypegenWatcher,
  TypegenWatchModeTrace: {name: 'TypegenWatchModeTrace'},
  TypesGeneratedTrace: {name: 'TypesGeneratedTrace'},
}))

const {TypegenGenerateCommand} = await import('../generate.js')
const mockStat = vi.mocked(stat)

const defaultConfig = {
  formatGeneratedCode: true,
  generates: './sanity.types.ts',
  overloadClientMethods: true,
  path: './src/**/*.{ts,tsx}',
  schema: './schema.json',
}

describe('typegen generate command', () => {
  beforeEach(() => {
    mocks.SanityCmdGetProjectRoot.mockResolvedValue({
      directory: '/project',
      path: '/project/sanity.cli.ts',
      type: 'studio',
    })
    mocks.SanityCmdGetCliConfig.mockResolvedValue({typegen: {}})
    mockConfigDefinitionParse.mockReturnValue(defaultConfig)
    mockRunTypegenGenerate.mockResolvedValue({
      code: '',
      duration: 10,
      emptyUnionTypeNodesGenerated: 0,
      filesWithErrors: 0,
      outputSize: 1,
      queriesCount: 1,
      queryFilesCount: 1,
      schemaTypesCount: 1,
      typeNodesGenerated: 1,
      unknownTypeNodesGenerated: 0,
      unknownTypeNodesRatio: 0,
    })
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))
    uxMocks.spinner.mockClear()
    uxMocks.spinnerStart.mockClear()
    uxMocks.spinnerSucceed.mockClear()
    uxMocks.spinner.mockImplementation(() => {
      const mockSpin = {
        fail: vi.fn(),
        isSpinning: true,
        start: uxMocks.spinnerStart,
        stop: vi.fn(),
        succeed: uxMocks.spinnerSucceed,
        warn: vi.fn(),
      }
      Object.defineProperty(mockSpin, 'text', {
        configurable: true,
        set: uxMocks.spinnerText,
      })
      uxMocks.spinnerStart.mockReturnValue(mockSpin)
      return mockSpin
    })
    mockTrace.complete.mockClear()
    mockTrace.error.mockClear()
    mockTrace.log.mockClear()
    mockTrace.start.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('loads CLI config and runs a single generation', async () => {
    await TypegenGenerateCommand.run([])

    expect(uxMocks.spinnerStart).toHaveBeenCalledWith('Loading config…')
    expect(uxMocks.spinnerSucceed).toHaveBeenCalledWith('Config loaded from sanity.cli.ts')
    expect(mockRunTypegenGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: defaultConfig,
        workDir: '/project',
      }),
    )
    expect(mockRunTypegenGenerate.mock.calls[0]?.[0].onProgress).toBeTypeOf('function')
    expect(mockTrace.start).toHaveBeenCalled()
    expect(mockTrace.complete).toHaveBeenCalled()
  })

  test('starts watch mode when --watch is passed', async () => {
    const stop = vi.fn().mockResolvedValue(undefined)
    const getStats = vi.fn().mockReturnValue({
      averageGenerationDuration: 1,
      generationFailedCount: 0,
      generationSuccessfulCount: 1,
      watcherDuration: 2,
    })
    mockRunTypegenWatcher.mockReturnValue({getStats, stop, watcher: {}})

    // Resolve the SIGINT handler immediately so the command can finish
    const onSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      listener: (...args: unknown[]) => void,
    ) => {
      if (event === 'SIGINT') {
        queueMicrotask(() => listener())
      }
      return process
    }) as typeof process.on)

    await TypegenGenerateCommand.run(['--watch'])

    expect(mockRunTypegenWatcher).toHaveBeenCalledWith(
      expect.objectContaining({
        config: defaultConfig,
        workDir: '/project',
      }),
    )
    expect(stop).toHaveBeenCalled()
    expect(mockTrace.log).toHaveBeenCalledWith(expect.objectContaining({step: 'stopped'}))

    onSpy.mockRestore()
  })

  test('errors when an explicit config path is missing', async () => {
    await expect(TypegenGenerateCommand.run(['--config-path', 'missing.json'])).rejects.toThrow(
      'Typegen config file not found: missing.json',
    )
    expect(mockRunTypegenGenerate).not.toHaveBeenCalled()
  })

  test('uses legacy sanity-typegen.json when present', async () => {
    mockStat.mockResolvedValue({isFile: () => true} as Awaited<ReturnType<typeof stat>>)
    mocks.SanityCmdGetCliConfig.mockResolvedValue({})
    mockReadConfig.mockResolvedValue(defaultConfig)

    await TypegenGenerateCommand.run([])

    expect(mockReadConfig).toHaveBeenCalledWith('sanity-typegen.json')
    expect(mockRunTypegenGenerate).toHaveBeenCalled()
  })

  test('propagates generation failures', async () => {
    mockRunTypegenGenerate.mockRejectedValue(new Error('Schema file not found'))

    await expect(TypegenGenerateCommand.run([])).rejects.toThrow('Schema file not found')
    expect(mockTrace.error).toHaveBeenCalled()
  })
})
