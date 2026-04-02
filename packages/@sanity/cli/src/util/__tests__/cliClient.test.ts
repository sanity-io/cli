import {type CliConfig} from '@sanity/cli-core'
import {createClient, type SanityClient} from '@sanity/client'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCliClient} from '../cliClient.js'

vi.mock('@sanity/cli-core')
vi.mock('@sanity/client')

describe('getCliClient', () => {
  const mockClient = {withConfig: vi.fn()} as unknown as SanityClient
  const originalAuthToken = process.env.SANITY_AUTH_TOKEN

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockReturnValue(mockClient)
    // Ensure SANITY_AUTH_TOKEN doesn't leak into tests that expect no token
    delete process.env.SANITY_AUTH_TOKEN
  })

  afterEach(() => {
    // Restore original SANITY_AUTH_TOKEN value (may have been set in CI)
    if (originalAuthToken === undefined) {
      delete process.env.SANITY_AUTH_TOKEN
    } else {
      process.env.SANITY_AUTH_TOKEN = originalAuthToken
    }
    vi.unstubAllEnvs()
  })

  test('should throw error if not called from node.js', () => {
    const originalProcess = globalThis.process
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).process = undefined

    expect(() => getCliClient()).toThrow(
      'getCliClient() should only be called from node.js scripts',
    )

    globalThis.process = originalProcess
  })

  test('should use default apiVersion and useCdn when not provided', () => {
    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
    }

    getCliClient(options)

    expect(createClient).toHaveBeenCalledWith({
      apiVersion: '2022-06-06',
      dataset: 'test-dataset',
      projectId: 'test-project',
      token: undefined,
      useCdn: false,
    })
  })

  test('should load config from project root when projectId/dataset not provided', async () => {
    const {findProjectRootSync, getCliConfigSync} = await import('@sanity/cli-core')

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

    vi.mocked(findProjectRootSync).mockReturnValueOnce(mockProjectRoot)
    vi.mocked(getCliConfigSync).mockReturnValueOnce(mockCliConfig)

    getCliClient()

    expect(findProjectRootSync).toHaveBeenCalledWith(process.cwd())
    expect(getCliConfigSync).toHaveBeenCalledWith('/test/project')
    expect(createClient).toHaveBeenCalledWith({
      apiVersion: '2022-06-06',
      dataset: 'config-dataset',
      projectId: 'config-project',
      token: undefined,
      useCdn: false,
    })
  })

  test('should use SANITY_BASE_PATH env var as cwd if set', async () => {
    const {findProjectRootSync, getCliConfigSync} = await import('@sanity/cli-core')

    vi.stubEnv('SANITY_BASE_PATH', '/custom/path')

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

    vi.mocked(findProjectRootSync).mockReturnValueOnce(mockProjectRoot)
    vi.mocked(getCliConfigSync).mockReturnValueOnce(mockCliConfig)

    getCliClient()

    expect(findProjectRootSync).toHaveBeenCalledWith('/custom/path')
  })

  test('should use provided cwd option', async () => {
    const {findProjectRootSync, getCliConfigSync} = await import('@sanity/cli-core')

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

    vi.mocked(findProjectRootSync).mockReturnValueOnce(mockProjectRoot)
    vi.mocked(getCliConfigSync).mockReturnValueOnce(mockCliConfig)

    getCliClient({cwd: '/provided/path'})

    expect(findProjectRootSync).toHaveBeenCalledWith('/provided/path')
  })

  test('should throw error if CLI config is not found', async () => {
    const {findProjectRootSync, getCliConfigSync} = await import('@sanity/cli-core')

    const mockProjectRoot = {
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio' as const,
    }

    vi.mocked(findProjectRootSync).mockReturnValueOnce(mockProjectRoot)
    vi.mocked(getCliConfigSync).mockReturnValueOnce(null as unknown as CliConfig)

    expect(() => getCliClient()).toThrow('Unable to resolve CLI configuration')
  })

  test('should throw error if projectId is missing from config', async () => {
    const {findProjectRootSync, getCliConfigSync} = await import('@sanity/cli-core')

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

    vi.mocked(findProjectRootSync).mockReturnValueOnce(mockProjectRoot)
    vi.mocked(getCliConfigSync).mockReturnValueOnce(mockCliConfig)

    expect(() => getCliClient()).toThrow(
      'Unable to resolve project ID/dataset from CLI configuration',
    )
  })

  test('should throw error if dataset is missing from config', async () => {
    const {findProjectRootSync, getCliConfigSync} = await import('@sanity/cli-core')

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

    vi.mocked(findProjectRootSync).mockReturnValueOnce(mockProjectRoot)
    vi.mocked(getCliConfigSync).mockReturnValueOnce(mockCliConfig)

    expect(() => getCliClient()).toThrow(
      'Unable to resolve project ID/dataset from CLI configuration',
    )
  })

  test('should use token from __internal__getToken', () => {
    getCliClient.__internal__getToken = () => 'internal-token'

    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
    }

    getCliClient(options)

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

  test('should prioritize explicit token option over __internal__getToken', () => {
    getCliClient.__internal__getToken = () => 'internal-token'

    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
      token: 'explicit-token',
    }

    getCliClient(options)

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

  test('should use SANITY_AUTH_TOKEN env var as fallback', () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')

    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
    }

    getCliClient(options)

    expect(createClient).toHaveBeenCalledWith({
      apiVersion: '2022-06-06',
      dataset: 'test-dataset',
      projectId: 'test-project',
      token: 'env-token',
      useCdn: false,
    })
  })

  test('should prioritize __internal__getToken over SANITY_AUTH_TOKEN env var', () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'env-token')
    getCliClient.__internal__getToken = () => 'internal-token'

    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
    }

    getCliClient(options)

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

  test('should pass through additional ClientConfig options', () => {
    const options = {
      dataset: 'test-dataset',
      projectId: 'test-project',
      timeout: 30_000,
      withCredentials: true,
    }

    getCliClient(options)

    expect(createClient).toHaveBeenCalledWith({
      apiVersion: '2022-06-06',
      dataset: 'test-dataset',
      projectId: 'test-project',
      timeout: 30_000,
      token: undefined,
      useCdn: false,
      withCredentials: true,
    })
  })
})
