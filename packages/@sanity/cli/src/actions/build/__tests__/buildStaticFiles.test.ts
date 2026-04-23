import {convertToSystemPath} from '@sanity/cli-test'
import {type InlineConfig} from 'vite'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildStaticFiles} from '../buildStaticFiles.js'

const mockBuildApp = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockCreateBuilder = vi.hoisted(() => vi.fn().mockResolvedValue({buildApp: mockBuildApp}))
const mockBuild = vi.hoisted(() =>
  vi.fn().mockResolvedValue({output: [{modules: {}, name: 'test', type: 'chunk'}]}),
)
const mockGetViteConfig = vi.hoisted(() => vi.fn())
const mockExtendViteConfigWithUserConfig = vi.hoisted(() => vi.fn())
const mockFinalizeViteConfig = vi.hoisted(() => vi.fn())
const mockWriteSanityRuntime = vi.hoisted(() => vi.fn())
const mockResolveEntries = vi.hoisted(() => vi.fn())

vi.mock('vite', () => ({
  build: mockBuild,
  createBuilder: mockCreateBuilder,
}))

vi.mock('../getViteConfig.js', () => ({
  extendViteConfigWithUserConfig: mockExtendViteConfigWithUserConfig,
  finalizeViteConfig: mockFinalizeViteConfig,
  getViteConfig: mockGetViteConfig,
}))

vi.mock('../writeSanityRuntime.js', () => ({
  resolveEntries: mockResolveEntries,
  writeSanityRuntime: mockWriteSanityRuntime,
}))

vi.mock('../writeFavicons.js', () => ({
  writeFavicons: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../util/copyDir.js', () => ({
  copyDir: vi.fn().mockResolvedValue(undefined),
}))

const cwd = convertToSystemPath('/test/cwd')
const outputDir = convertToSystemPath('/test/cwd/dist')

describe('buildStaticFiles', () => {
  beforeEach(() => {
    const defaultViteConfig: InlineConfig = {plugins: [{name: 'sanity-default'}], root: cwd}
    mockGetViteConfig.mockResolvedValue(defaultViteConfig)
    mockExtendViteConfigWithUserConfig.mockImplementation(async (_env, base, user) =>
      typeof user === 'function' ? user(base, _env) : {...base, ...user},
    )
    mockFinalizeViteConfig.mockImplementation(async (config) => config)
    mockResolveEntries.mockResolvedValue({
      relativeConfigLocation: '../../sanity.config.ts',
      relativeEntry: '../../src/App.tsx',
    })
    mockWriteSanityRuntime.mockResolvedValue({
      entries: {relativeConfigLocation: null, relativeEntry: '../../src/App.tsx'},
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('federation enabled', () => {
    test('applies user vite config so custom plugins run during build', async () => {
      const userPlugin = {name: 'vanilla-extract-plugin'}
      const userVite = vi.fn((config: InlineConfig) => ({
        ...config,
        plugins: [...(config.plugins ?? []), userPlugin],
      }))

      await buildStaticFiles({
        basePath: '/',
        cwd,
        federation: {enabled: true},
        outputDir,
        vite: userVite,
      })

      expect(mockExtendViteConfigWithUserConfig).toHaveBeenCalledWith(
        {command: 'build', mode: 'production'},
        expect.objectContaining({root: cwd}),
        userVite,
      )

      // Config passed to createBuilder must contain the user plugin — otherwise
      // transforms like vanilla-extract never run on `.css.ts` files.
      const builderConfig = mockCreateBuilder.mock.calls[0][0]
      expect(builderConfig.plugins).toContainEqual(userPlugin)

      // Federation builds must not call finalizeViteConfig; it forces a
      // Studio-specific entry the federation environment does not use.
      expect(mockFinalizeViteConfig).not.toHaveBeenCalled()

      expect(mockBuildApp).toHaveBeenCalled()
    })

    test('skips user config merge when no user vite config is provided', async () => {
      await buildStaticFiles({
        basePath: '/',
        cwd,
        federation: {enabled: true},
        outputDir,
      })

      expect(mockExtendViteConfigWithUserConfig).not.toHaveBeenCalled()
      expect(mockBuildApp).toHaveBeenCalled()
    })

    test('does not write sanity runtime or copy static files', async () => {
      await buildStaticFiles({
        basePath: '/',
        cwd,
        federation: {enabled: true},
        outputDir,
      })

      expect(mockWriteSanityRuntime).not.toHaveBeenCalled()
      expect(mockBuild).not.toHaveBeenCalled()
    })
  })

  describe('federation disabled', () => {
    test('still merges user vite config via finalizeViteConfig', async () => {
      const userVite = {define: {CUSTOM: '"value"'}}

      await buildStaticFiles({
        basePath: '/',
        cwd,
        outputDir,
        vite: userVite,
      })

      expect(mockExtendViteConfigWithUserConfig).toHaveBeenCalled()
      expect(mockFinalizeViteConfig).toHaveBeenCalled()
      expect(mockBuild).toHaveBeenCalled()
    })
  })
})
