import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type DevServerOptions, startDevServer} from '../devServer.js'

const mockGetViteConfig = vi.hoisted(() => vi.fn())
const mockWriteSanityRuntime = vi.hoisted(() => vi.fn())
const mockExtendViteConfigWithUserConfig = vi.hoisted(() => vi.fn())
const mockCreateServer = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-build/_internal/build', () => ({
  extendViteConfigWithUserConfig: mockExtendViteConfigWithUserConfig,
  getViteConfig: mockGetViteConfig,
  writeSanityRuntime: mockWriteSanityRuntime,
}))

vi.mock('@sanity/cli-build/_internal/env', () => ({
  getAppEnvironmentVariables: vi.fn(() => ({})),
  getStudioEnvironmentVariables: vi.fn(() => ({})),
}))

vi.mock('vite', () => ({
  createServer: mockCreateServer,
}))

// The typegen plugin pulls in @sanity/codegen at load; keep the suite hermetic
// since these tests never enable typegen.
vi.mock('../vite/plugin-typegen.js', () => ({
  sanityTypegenPlugin: vi.fn(),
}))

function baseOptions(overrides: Partial<DevServerOptions> = {}): DevServerOptions {
  return {
    basePath: '/',
    cwd: '/tmp/project',
    httpPort: 3333,
    reactCompiler: undefined,
    reactStrictMode: undefined,
    staticPath: '/tmp/project/static',
    ...overrides,
  }
}

describe('startDevServer', () => {
  beforeEach(() => {
    mockWriteSanityRuntime.mockResolvedValue({entries: {}, watcher: undefined})
    mockGetViteConfig.mockResolvedValue({configFile: false})
    mockCreateServer.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
      config: {logger: {info: vi.fn()}, server: {port: 3333}},
      listen: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('enables experimental.bundledDev on the vite config when bundledDev is set', async () => {
    await startDevServer(baseOptions({bundledDev: true}))

    expect(mockCreateServer).toHaveBeenCalledOnce()
    const passedConfig = mockCreateServer.mock.calls[0][0]
    expect(passedConfig.experimental).toEqual({bundledDev: true})
  })

  test('points the bundler at the runtime HTML entry when bundledDev is set', async () => {
    await startDevServer(baseOptions({bundledDev: true, cwd: '/tmp/project'}))

    const passedConfig = mockCreateServer.mock.calls[0][0]
    // Without an explicit input, Vite bundled dev falls back to <root>/index.html
    // which does not exist in a Sanity project.
    expect(passedConfig.build.rolldownOptions.input).toBe(
      path.join('/tmp/project', '.sanity', 'runtime', 'index.html'),
    )
  })

  test('does not touch experimental or build options when bundledDev is off', async () => {
    await startDevServer(baseOptions({bundledDev: false}))

    const passedConfig = mockCreateServer.mock.calls[0][0]
    expect(passedConfig.experimental).toBeUndefined()
    expect(passedConfig.build?.rolldownOptions).toBeUndefined()
  })

  test('preserves other experimental options while enabling bundledDev', async () => {
    mockGetViteConfig.mockResolvedValue({
      configFile: false,
      experimental: {hmrPartialAccept: true},
    })

    await startDevServer(baseOptions({bundledDev: true}))

    const passedConfig = mockCreateServer.mock.calls[0][0]
    expect(passedConfig.experimental).toEqual({bundledDev: true, hmrPartialAccept: true})
  })

  test('applies user vite config on top of the bundledDev-enabled config', async () => {
    mockExtendViteConfigWithUserConfig.mockResolvedValue({configFile: false, marker: 'user'})

    await startDevServer(baseOptions({bundledDev: true, vite: {}}))

    // The user extension receives the config with bundledDev already enabled...
    expect(mockExtendViteConfigWithUserConfig).toHaveBeenCalledOnce()
    const configPassedToExtend = mockExtendViteConfigWithUserConfig.mock.calls[0][1]
    expect(configPassedToExtend.experimental).toEqual({bundledDev: true})

    // ...and createServer receives the user-extended result.
    const passedConfig = mockCreateServer.mock.calls[0][0]
    expect(passedConfig).toEqual({configFile: false, marker: 'user'})
  })
})
