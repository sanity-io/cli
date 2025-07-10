import {type ConfigEnv, type InlineConfig} from 'vite'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  extendViteConfigWithUserConfig,
  finalizeViteConfig,
  getViteConfig,
} from '../getViteConfig.js'

// Mock all external dependencies
vi.mock('debug', () => ({
  default: vi.fn(() => vi.fn()),
}))

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(),
}))

vi.mock('@vitejs/plugin-react', () => ({
  default: vi.fn(() => ({name: 'react-plugin'})),
}))

vi.mock('vite', () => ({
  mergeConfig: vi.fn((base, override) => ({...base, ...override})),
}))

vi.mock('../createExternalFromImportMap.js', () => ({
  createExternalFromImportMap: vi.fn(() => ['external1', 'external2']),
}))

vi.mock('../getBrowserAliases.js', () => ({
  getSanityPkgExportAliases: vi.fn(() => Promise.resolve({alias1: 'path1', alias2: 'path2'})),
}))

vi.mock('../getStudioEnvironmentVariables.js', () => ({
  getAppEnvironmentVariables: vi.fn(() => ({
    'process.env.APP_VAR': '"app-value"',
  })),
  getStudioEnvironmentVariables: vi.fn(() => ({
    'process.env.STUDIO_VAR': '"studio-value"',
  })),
}))

vi.mock('../normalizeBasePath.js', () => ({
  normalizeBasePath: vi.fn((path) => `/${path}/`.replace(/^\/+/, '/').replace(/\/+$/, '/')),
}))

vi.mock('../vite/plugin-sanity-build-entries.js', () => ({
  sanityBuildEntries: vi.fn(() => ({name: 'sanity-build-entries'})),
}))

vi.mock('../vite/plugin-sanity-favicons.js', () => ({
  sanityFaviconsPlugin: vi.fn(() => ({name: 'sanity-favicons'})),
}))

vi.mock('../vite/plugin-sanity-runtime-rewrite.js', () => ({
  sanityRuntimeRewritePlugin: vi.fn(() => ({name: 'sanity-runtime-rewrite'})),
}))

describe('#getViteConfig', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    delete process.env.SANITY_INTERNAL_ENV

    // Setup default mock for readPackageUp
    const {readPackageUp} = await import('read-package-up')
    vi.mocked(readPackageUp).mockResolvedValue({
      packageJson: {name: 'sanity'},
      path: '/mock/path/to/sanity/package.json',
    })
  })

  test('should create basic vite config with default options', async () => {
    const options = {
      cwd: '/test/cwd',
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    expect(config).toMatchObject({
      base: '/',
      build: {
        outDir: '/test/cwd/dist',
        sourcemap: true,
      },
      cacheDir: 'node_modules/.sanity/vite',
      configFile: false,
      envPrefix: 'SANITY_STUDIO_',
      logLevel: 'info',
      mode: 'development',
      root: '/test/cwd',
      server: {
        host: undefined,
        port: 3333,
        strictPort: true,
      },
    })

    expect(config.define).toMatchObject({
      __SANITY_STAGING__: false,
      'process.env.MODE': '"development"',
      'process.env.SC_DISABLE_SPEEDY': '"false"',
      'process.env.STUDIO_VAR': '"studio-value"',
    })

    expect(config.plugins).toHaveLength(4)
    expect(config.resolve?.alias).toEqual({alias1: 'path1', alias2: 'path2'})
    expect(config.resolve?.dedupe).toEqual(['styled-components'])
  })

  test('should create vite config for app mode', async () => {
    const options = {
      cwd: '/test/cwd',
      isApp: true,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    expect(config.envPrefix).toBe('SANITY_APP_')
    expect(config.define).toMatchObject({
      'process.env.APP_VAR': '"app-value"',
    })
  })

  test('should create production config with minification', async () => {
    const options = {
      cwd: '/test/cwd',
      minify: true,
      mode: 'production' as const,
      outputDir: '/custom/output',
      reactCompiler: undefined,
      sourceMap: false,
    }

    const config = await getViteConfig(options)

    expect(config.mode).toBe('production')
    expect(config.logLevel).toBe('silent')
    expect(config.build).toMatchObject({
      assetsDir: 'static',
      emptyOutDir: false,
      minify: 'esbuild',
      outDir: '/custom/output',
      sourcemap: false,
    })

    expect(config.build?.rollupOptions).toMatchObject({
      external: ['external1', 'external2'],
      input: {
        sanity: '/test/cwd/.sanity/runtime/app.js',
      },
    })
  })

  test('should create production config without minification', async () => {
    const options = {
      cwd: '/test/cwd',
      minify: false,
      mode: 'production' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    expect(config.build?.minify).toBe(false)
  })

  test('should normalize base path correctly', async () => {
    const {normalizeBasePath} = await import('../normalizeBasePath.js')

    const options = {
      basePath: 'custom/path',
      cwd: '/test/cwd',
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    await getViteConfig(options)

    expect(normalizeBasePath).toHaveBeenCalledWith('custom/path')
  })

  test('should handle custom server options', async () => {
    const options = {
      cwd: '/test/cwd',
      mode: 'development' as const,
      reactCompiler: undefined,
      server: {
        host: '0.0.0.0',
        port: 8080,
      },
    }

    const config = await getViteConfig(options)

    expect(config.server).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      strictPort: true,
    })
  })

  test('should handle react compiler configuration', async () => {
    const {default: viteReact} = await import('@vitejs/plugin-react')

    const reactCompilerConfig = {
      sources: ['src/**/*.tsx'],
      target: '18' as const,
    }

    const options = {
      cwd: '/test/cwd',
      mode: 'development' as const,
      reactCompiler: reactCompilerConfig,
    }

    await getViteConfig(options)

    expect(viteReact).toHaveBeenCalledWith({
      babel: {
        plugins: [['babel-plugin-react-compiler', reactCompilerConfig]],
      },
    })
  })

  test('should set staging flag when SANITY_INTERNAL_ENV is staging', async () => {
    process.env.SANITY_INTERNAL_ENV = 'staging'

    const options = {
      cwd: '/test/cwd',
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    expect(config.define?.__SANITY_STAGING__).toBe(true)
  })

  test('should handle import map for external dependencies', async () => {
    const importMap = {
      imports: {
        react: 'https://esm.sh/react@18',
        'react-dom': 'https://esm.sh/react-dom@18',
      },
    }

    const options = {
      cwd: '/test/cwd',
      importMap,
      mode: 'production' as const,
      reactCompiler: undefined,
    }

    const {createExternalFromImportMap} = await import('../createExternalFromImportMap.js')
    const {sanityBuildEntries} = await import('../vite/plugin-sanity-build-entries.js')

    await getViteConfig(options)

    expect(createExternalFromImportMap).toHaveBeenCalledWith(importMap)
    expect(sanityBuildEntries).toHaveBeenCalledWith({
      basePath: '/',
      cwd: '/test/cwd',
      importMap,
      isApp: undefined,
    })
  })

  test('should throw error when sanity package path cannot be resolved', async () => {
    const {readPackageUp} = await import('read-package-up')
    vi.mocked(readPackageUp).mockResolvedValue(undefined)

    const options = {
      cwd: '/test/cwd',
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    await expect(getViteConfig(options)).rejects.toThrow('Unable to resolve `sanity` module root')
  })

  test('should configure favicon plugin with correct paths', async () => {
    const {sanityFaviconsPlugin} = await import('../vite/plugin-sanity-favicons.js')

    const options = {
      basePath: '/studio',
      cwd: '/test/cwd',
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    await getViteConfig(options)

    expect(sanityFaviconsPlugin).toHaveBeenCalledWith({
      customFaviconsPath: '/test/cwd/static',
      defaultFaviconsPath: '/mock/path/to/sanity/static/favicons',
      staticUrlPath: '/studio/static',
    })
  })
})

describe('#finalizeViteConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should merge sanity entry into existing config', async () => {
    const {mergeConfig} = await import('vite')

    const inputConfig: InlineConfig = {
      build: {
        rollupOptions: {
          input: {
            main: '/test/main.js',
          },
        },
      },
      root: '/test/root',
    }

    const expectedMerge = {
      build: {
        rollupOptions: {
          input: {
            sanity: '/test/root/.sanity/runtime/app.js',
          },
        },
      },
    }

    vi.mocked(mergeConfig).mockReturnValue({
      ...inputConfig,
      build: {
        rollupOptions: {
          input: {
            main: '/test/main.js',
            sanity: '/test/root/.sanity/runtime/app.js',
          },
        },
      },
    })

    await finalizeViteConfig(inputConfig)

    expect(mergeConfig).toHaveBeenCalledWith(inputConfig, expectedMerge)
  })

  test('should throw error when build.rollupOptions.input is not an object', async () => {
    const inputConfig: InlineConfig = {
      build: {
        rollupOptions: {
          input: '/single/entry.js',
        },
      },
      root: '/test/root',
    }

    await expect(finalizeViteConfig(inputConfig)).rejects.toThrow(
      'Vite config must contain `build.rollupOptions.input`, and it must be an object',
    )
  })

  test('should throw error when root is missing', async () => {
    const inputConfig: InlineConfig = {
      build: {
        rollupOptions: {
          input: {
            main: '/test/main.js',
          },
        },
      },
    }

    await expect(finalizeViteConfig(inputConfig)).rejects.toThrow(
      'Vite config must contain `root` property, and must point to the Sanity root directory',
    )
  })
})

describe('#extendViteConfigWithUserConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should return default config when user config is undefined', async () => {
    const defaultConfig: InlineConfig = {
      mode: 'development',
      root: '/test',
    }
    const env: ConfigEnv = {command: 'build', mode: 'development'}

    const result = await extendViteConfigWithUserConfig(env, defaultConfig, undefined as never)

    expect(result).toBe(defaultConfig)
  })

  test('should merge user config object with default config', async () => {
    const {mergeConfig} = await import('vite')

    const defaultConfig: InlineConfig = {
      mode: 'development',
      root: '/test',
    }
    const userConfig = {
      define: {custom: 'value'},
      server: {port: 4000},
    }
    const env: ConfigEnv = {command: 'build', mode: 'development'}

    const mergedConfig = {
      ...defaultConfig,
      ...userConfig,
    }
    vi.mocked(mergeConfig).mockReturnValue(mergedConfig)

    const result = await extendViteConfigWithUserConfig(env, defaultConfig, userConfig)

    expect(mergeConfig).toHaveBeenCalledWith(defaultConfig, userConfig)
    expect(result).toBe(mergedConfig)
  })

  test('should call user config function with default config and env', async () => {
    const defaultConfig: InlineConfig = {
      mode: 'development',
      root: '/test',
    }
    const modifiedConfig = {
      ...defaultConfig,
      server: {port: 5000},
    }
    const userConfigFn = vi.fn().mockResolvedValue(modifiedConfig)
    const env: ConfigEnv = {command: 'build', mode: 'development'}

    const result = await extendViteConfigWithUserConfig(env, defaultConfig, userConfigFn)

    expect(userConfigFn).toHaveBeenCalledWith(defaultConfig, env)
    expect(result).toBe(modifiedConfig)
  })
})

describe('#onRollupWarn and #suppressUnusedImport helper functions', () => {
  test('should suppress useDebugValue unused import warnings', async () => {
    // Test the internal suppressUnusedImport function by testing its behavior through onRollupWarn
    const mockWarn = vi.fn()

    // Create a warning that should be suppressed
    const warning = {
      code: 'UNUSED_EXTERNAL_IMPORT' as const,
      message: 'useDebugValue is imported from external module "react"',
      names: ['useDebugValue', 'useState'],
    }

    // Access the onRollupWarn function by testing getViteConfig in production mode
    // which includes the onwarn callback
    const options = {
      cwd: '/test/cwd',
      mode: 'production' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)
    const onwarn = config.build?.rollupOptions?.onwarn

    expect(onwarn).toBeDefined()

    // Test that useDebugValue warnings are suppressed
    onwarn?.(warning, mockWarn)

    // Should modify warning.names to remove useDebugValue
    expect(warning.names).toEqual(['useState'])
    // Should still call warn since there are other names
    expect(mockWarn).toHaveBeenCalledWith(warning)
  })

  test('should completely suppress warning when only useDebugValue is present', async () => {
    const mockWarn = vi.fn()

    const warning = {
      code: 'UNUSED_EXTERNAL_IMPORT' as const,
      message: 'useDebugValue is imported from external module "react"',
      names: ['useDebugValue'],
    }

    const config = await getViteConfig({
      cwd: '/test/cwd',
      mode: 'production' as const,
      reactCompiler: undefined,
    })

    const onwarn = config.build?.rollupOptions?.onwarn
    onwarn?.(warning, mockWarn)

    // Should not call warn at all when only useDebugValue was present
    expect(mockWarn).not.toHaveBeenCalled()
  })

  test('should suppress warnings from node_modules', async () => {
    const mockWarn = vi.fn()

    const warning = {
      code: 'UNUSED_EXTERNAL_IMPORT' as const,
      ids: ['/project/node_modules/some-lib/index.js'],
      message: 'Some warning from node_modules',
    }

    const config = await getViteConfig({
      cwd: '/test/cwd',
      mode: 'production' as const,
      reactCompiler: undefined,
    })

    const onwarn = config.build?.rollupOptions?.onwarn
    onwarn?.(warning, mockWarn)

    // Should not call warn for node_modules warnings
    expect(mockWarn).not.toHaveBeenCalled()
  })

  test('should not suppress other warning types', async () => {
    const mockWarn = vi.fn()

    const warning = {
      code: 'CIRCULAR_DEPENDENCY' as const,
      message: 'Circular dependency detected',
    }

    const config = await getViteConfig({
      cwd: '/test/cwd',
      mode: 'production' as const,
      reactCompiler: undefined,
    })

    const onwarn = config.build?.rollupOptions?.onwarn
    onwarn?.(warning, mockWarn)

    // Should call warn for other warning types
    expect(mockWarn).toHaveBeenCalledWith(warning)
  })
})
