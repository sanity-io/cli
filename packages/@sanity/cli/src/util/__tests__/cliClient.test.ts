import {type CliConfig} from '@sanity/cli-core'
import {createClient, type SanityClient} from '@sanity/client'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCliClient} from '../cliClient.js'

vi.mock('@sanity/cli-core')
vi.mock('@sanity/client')

describe('getCliClient', () => {
  const mockClient = {withConfig: vi.fn()} as unknown as SanityClient
  let originalProcessEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockReturnValue(mockClient)
    originalProcessEnv = process.env
  })

  afterEach(() => {
    process.env = originalProcessEnv
  })

  test('should throw error if not called from node.js', async () => {
    const originalProcess = globalThis.process
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).process = undefined

    await expect(getCliClient()).rejects.toThrow(
      'getCliClient() should only be called from node.js scripts',
    )

    globalThis.process = originalProcess
  })

  test('should use default apiVersion and useCdn when not provided', async () => {
    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
    }

    await getCliClient(options)

    expect(createClient).toHaveBeenCalledWith({
      apiVersion: '2022-06-06',
      dataset: 'test-dataset',
      projectId: 'test-project',
      token: undefined,
      useCdn: false,
    })
  })

  test('should load config from project root when projectId/dataset not provided', async () => {
    const {findProjectRoot, getCliConfig} = await import('@sanity/cli-core')

    const mockProjectRoot = {
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio' as const,
    }

    const mockCliConfig: CliConfig = {
      api: {
        dataset: 'config-dataset',
        projectId: 'config-project',
      },
    }

    vi.mocked(findProjectRoot).mockResolvedValueOnce(mockProjectRoot)
    vi.mocked(getCliConfig).mockResolvedValueOnce(mockCliConfig)

    await getCliClient()

    expect(findProjectRoot).toHaveBeenCalledWith(process.cwd())
    expect(getCliConfig).toHaveBeenCalledWith('/test/project')
    expect(createClient).toHaveBeenCalledWith({
      apiVersion: '2022-06-06',
      dataset: 'config-dataset',
      projectId: 'config-project',
      token: undefined,
      useCdn: false,
    })
  })

  test('should use SANITY_BASE_PATH env var as cwd if set', async () => {
    const {findProjectRoot, getCliConfig} = await import('@sanity/cli-core')

    process.env.SANITY_BASE_PATH = '/custom/path'

    const mockProjectRoot = {
      directory: '/custom/path',
      path: '/custom/path/sanity.cli.ts',
      type: 'studio' as const,
    }

    const mockCliConfig: CliConfig = {
      api: {
        dataset: 'config-dataset',
        projectId: 'config-project',
      },
    }

    vi.mocked(findProjectRoot).mockResolvedValueOnce(mockProjectRoot)
    vi.mocked(getCliConfig).mockResolvedValueOnce(mockCliConfig)

    await getCliClient()

    expect(findProjectRoot).toHaveBeenCalledWith('/custom/path')
  })

  test('should use provided cwd option', async () => {
    const {findProjectRoot, getCliConfig} = await import('@sanity/cli-core')

    const mockProjectRoot = {
      directory: '/provided/path',
      path: '/provided/path/sanity.cli.ts',
      type: 'studio' as const,
    }

    const mockCliConfig: CliConfig = {
      api: {
        dataset: 'config-dataset',
        projectId: 'config-project',
      },
    }

    vi.mocked(findProjectRoot).mockResolvedValueOnce(mockProjectRoot)
    vi.mocked(getCliConfig).mockResolvedValueOnce(mockCliConfig)

    await getCliClient({cwd: '/provided/path'})

    expect(findProjectRoot).toHaveBeenCalledWith('/provided/path')
  })

  test('should throw error if CLI config is not found', async () => {
    const {findProjectRoot, getCliConfig} = await import('@sanity/cli-core')

    const mockProjectRoot = {
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio' as const,
    }

    vi.mocked(findProjectRoot).mockResolvedValueOnce(mockProjectRoot)
    vi.mocked(getCliConfig).mockResolvedValueOnce(null as unknown as CliConfig)

    await expect(getCliClient()).rejects.toThrow('Unable to resolve CLI configuration')
  })

  test('should throw error if projectId is missing from config', async () => {
    const {findProjectRoot, getCliConfig} = await import('@sanity/cli-core')

    const mockProjectRoot = {
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio' as const,
    }

    const mockCliConfig: CliConfig = {
      api: {
        dataset: 'config-dataset',
      },
    }

    vi.mocked(findProjectRoot).mockResolvedValueOnce(mockProjectRoot)
    vi.mocked(getCliConfig).mockResolvedValueOnce(mockCliConfig)

    await expect(getCliClient()).rejects.toThrow(
      'Unable to resolve project ID/dataset from CLI configuration',
    )
  })

  test('should throw error if dataset is missing from config', async () => {
    const {findProjectRoot, getCliConfig} = await import('@sanity/cli-core')

    const mockProjectRoot = {
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio' as const,
    }

    const mockCliConfig: CliConfig = {
      api: {
        projectId: 'config-project',
      },
    }

    vi.mocked(findProjectRoot).mockResolvedValueOnce(mockProjectRoot)
    vi.mocked(getCliConfig).mockResolvedValueOnce(mockCliConfig)

    await expect(getCliClient()).rejects.toThrow(
      'Unable to resolve project ID/dataset from CLI configuration',
    )
  })

  test('should use token from __internal__getToken', async () => {
    getCliClient.__internal__getToken = () => 'internal-token'

    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
    }

    await getCliClient(options)

    expect(createClient).toHaveBeenCalledWith({
      apiVersion: '2022-06-06',
      dataset: 'test-dataset',
      projectId: 'test-project',
      token: 'internal-token',
      useCdn: false,
    })

    // Reset
    getCliClient.__internal__getToken = () => undefined
  })

  test('should prioritize explicit token option over __internal__getToken', async () => {
    getCliClient.__internal__getToken = () => 'internal-token'

    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
      token: 'explicit-token',
    }

    await getCliClient(options)

    expect(createClient).toHaveBeenCalledWith({
      apiVersion: '2022-06-06',
      dataset: 'test-dataset',
      projectId: 'test-project',
      token: 'explicit-token',
      useCdn: false,
    })

    // Reset
    getCliClient.__internal__getToken = () => undefined
  })
})
