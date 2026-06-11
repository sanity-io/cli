import {join} from 'node:path'

import {noopLogger} from '@sanity/cli-core'
import {convertToSystemPath} from '@sanity/cli-test'
import {type ConfigEnv, type InlineConfig} from 'vite'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {SANITY_CACHE_DIR} from '../../../constants.js'
import {
  extendViteConfigWithUserConfig,
  finalizeViteConfig,
  getViteConfig,
} from '../getViteConfig.js'

const mockExtractSchemaPlugin = vi.hoisted(() => vi.fn())
const mockFederationPlugin = vi.hoisted(() => vi.fn())

// Mock all external dependencies
vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(),
}))

vi.mock('@rolldown/plugin-babel', () => ({
  default: vi.fn(() => ({name: 'babel-plugin'})),
}))

vi.mock('@vitejs/plugin-react', () => ({
  default: vi.fn(() => [{name: 'react-plugin'}]),
  reactCompilerPreset: vi.fn(() => ({name: 'react-compiler-preset'})),
}))

vi.mock('vite', () => ({
  esmExternalRequirePlugin: vi.fn(() => ({name: 'esm-external-require'})),
  mergeConfig: vi.fn((base: InlineConfig, override: InlineConfig) => ({...base, ...override})),
}))

vi.mock('../createExternalFromImportMap.js', () => ({
  createExternalFromImportMap: vi.fn(() => ['external1', 'external2']),
}))

vi.mock('../getBrowserAliases.js', () => ({
  getSanityPkgExportAliases: vi.fn(() => Promise.resolve({alias1: 'path1', alias2: 'path2'})),
}))

vi.mock('../normalizeBasePath.js', () => ({
  normalizeBasePath: vi.fn((path: string) => `/${path}/`.replace(/^\/+/, '/').replace(/\/+$/, '/')),
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

vi.mock('../../../workbench/vite/plugin.js', () => ({
  federation: mockFederationPlugin.mockReturnValue({
    name: 'sanity/federation',
  }),
}))

vi.mock('../../schema/vite/plugin-schema-extraction.js', () => ({
  sanitySchemaExtractionPlugin: mockExtractSchemaPlugin.mockReturnValue({
    name: 'sanity/schema-extraction',
  }),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    findProjectRoot: vi.fn().mockResolvedValue({path: '/mock/config/path'}),
    readPackageJson: vi.fn().mockResolvedValue({name: 'sanity'}),
  }
})

const mockTestCwd = convertToSystemPath('/test/cwd')
const mockSanityPath = convertToSystemPath('/mock/path/to/sanity')
const mockCustomOutput = convertToSystemPath('/custom/output')
const mockEntries = {
  relativeConfigLocation: '../../sanity.config.ts',
  relativeEntry: '../../src/App',
}

function getEnvironmentVariables() {
  return {}
}

describe('#getViteConfig', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    // Setup default mock for readPackageUp
    const {readPackageUp} = await import('read-package-up')
    vi.mocked(readPackageUp).mockResolvedValue({
      packageJson: {name: 'sanity'},
      path: join(mockSanityPath, 'package.json'),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('should create basic vite config with default options', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables() {
        return {'process.env.STUDIO_VAR': '"studio-value"'}
      },
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    expect(config).toMatchObject({
      base: '/',
      build: {
        outDir: join(mockTestCwd, 'dist'),
        sourcemap: true,
      },
      cacheDir: `${SANITY_CACHE_DIR}/vite`,
      configFile: false,
      envPrefix: 'SANITY_STUDIO_',
      logLevel: 'info',
      mode: 'development',
      root: mockTestCwd,
      server: {
        host: undefined,
        port: 3333,
        strictPort: true,
      },
    })

    expect(config.define).toMatchObject({
      __SANITY_STAGING__: false,
      'process.env.MODE': '"development"',
      'process.env.PKG_BUILD_VERSION': undefined,
      'process.env.SC_DISABLE_SPEEDY': '"false"',
      'process.env.STUDIO_VAR': '"studio-value"',
    })

    // Non-Sanity vars must NOT appear in define
    expect(config.define).not.toHaveProperty('process.env.PATH')
    expect(config.define).not.toHaveProperty('process.env.HOME')
    expect(config.define).not.toHaveProperty('process.env.NEXT_PUBLIC_API_URL')
    expect(config.define).not.toHaveProperty('process.env.VITE_CUSTOM_VAR')
    expect(config.define).not.toHaveProperty('process.env.APP_VAR')

    expect(config.plugins).toHaveLength(4)
    expect(config.resolve?.dedupe).toEqual(['react', 'react-dom', 'sanity', 'styled-components'])
  })

  test('should create vite config for app mode', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables() {
        return {'process.env.APP_VAR': '"app-value"'}
      },
      isApp: true,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    expect(config.envPrefix).toBe('SANITY_APP_')
    expect(config.server?.strictPort).toBe(false)
    expect(config.define).toMatchObject({
      'process.env.APP_VAR': '"app-value"',
    })

    // Non-app vars must NOT appear in define
    expect(config.define).not.toHaveProperty('process.env.STUDIO_VAR')
    expect(config.define).not.toHaveProperty('process.env.PATH')
    expect(config.define).not.toHaveProperty('process.env.HOME')
    expect(config.define).not.toHaveProperty('process.env.NEXT_PUBLIC_API_URL')
    expect(config.define).not.toHaveProperty('process.env.VITE_CUSTOM_VAR')
  })

  test('should create production config with minification', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      minify: true,
      mode: 'production' as const,
      outputDir: mockCustomOutput,
      reactCompiler: undefined,
      sourceMap: false,
    }

    const config = await getViteConfig(options)

    expect(config.mode).toBe('production')
    expect(config.logLevel).toBe('silent')
    expect(config.build).toMatchObject({
      assetsDir: 'static',
      emptyOutDir: false,
      minify: 'oxc',
      outDir: mockCustomOutput,
      sourcemap: false,
    })

    expect(config.build?.rolldownOptions).toMatchObject({
      input: {
        sanity: join(mockTestCwd, '.sanity/runtime/app.js'),
      },
    })

    expect(config.build?.rolldownOptions).not.toHaveProperty('external')
  })

  test('should create production config without minification', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
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
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    await getViteConfig(options)

    expect(normalizeBasePath).toHaveBeenCalledWith('custom/path')
  })

  test('should handle custom server options', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
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
    const {default: babel} = await import('@rolldown/plugin-babel')
    const {reactCompilerPreset} = await import('@vitejs/plugin-react')

    const reactCompilerConfig = {
      target: '19' as const,
    }

    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'development' as const,
      reactCompiler: reactCompilerConfig,
    }

    await getViteConfig(options)

    expect(reactCompilerPreset).toHaveBeenCalledWith({
      target: '19',
    })
    expect(babel).toHaveBeenCalledWith({
      presets: [expect.objectContaining({name: 'react-compiler-preset'})],
    })
  })

  test('should set staging flag when SANITY_INTERNAL_ENV is staging', async () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')

    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    expect(config.define?.__SANITY_STAGING__).toBe(true)
  })

  test('should configure auto-updates builds with vendor chunks and import map', async () => {
    const autoUpdates = {
      imports: {sanity: 'https://sanity-cdn.example/sanity'},
      vendor: {
        entries: {'react/index': convertToSystemPath('/pkg/react/index.js')},
        namesByChunkName: {'react/index': ['useState']},
        specifiersByChunkName: {'react/index': 'react'},
      },
    }

    const options = {
      autoUpdates,
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'production' as const,
      reactCompiler: undefined,
    }

    const {sanityBuildEntries} = await import('../vite/plugin-sanity-build-entries.js')
    const {createExternalFromImportMap} = await import('../createExternalFromImportMap.js')
    const {esmExternalRequirePlugin} = await import('vite')

    const config = await getViteConfig(options)

    expect(sanityBuildEntries).toHaveBeenCalledWith({
      autoUpdates,
      basePath: '/',
      cwd: mockTestCwd,
      isApp: undefined,
    })

    // Vendor entries become additional Rolldown inputs of the single build.
    expect(config.build?.rolldownOptions?.input).toMatchObject({
      'react/index': convertToSystemPath('/pkg/react/index.js'),
      sanity: join(mockTestCwd, '.sanity/runtime/app.js'),
    })
    // Vendor entry exports must survive the app-style build.
    expect(config.build?.rolldownOptions?.preserveEntrySignatures).toBe('exports-only')

    // Both the CDN import map specifiers and the vendor specifiers are handed to
    // esmExternalRequirePlugin (so external require() is rewritten to ESM imports),
    // not to rolldownOptions.external.
    expect(createExternalFromImportMap).toHaveBeenCalledWith({
      imports: {react: '', sanity: 'https://sanity-cdn.example/sanity'},
    })
    expect(esmExternalRequirePlugin).toHaveBeenCalledWith({external: ['external1', 'external2']})
    expect(config.plugins).toContainEqual({name: 'esm-external-require'})
    expect(config.build?.rolldownOptions).not.toHaveProperty('external')
  })

  test('should not install esmExternalRequirePlugin when auto-updates are disabled', async () => {
    const {esmExternalRequirePlugin} = await import('vite')

    const config = await getViteConfig({
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'production' as const,
      reactCompiler: undefined,
    })

    expect(esmExternalRequirePlugin).not.toHaveBeenCalled()
    expect(config.build?.rolldownOptions?.input).toEqual({
      sanity: join(mockTestCwd, '.sanity/runtime/app.js'),
    })
  })

  test('should configure favicon plugin with correct paths', async () => {
    const {sanityFaviconsPlugin} = await import('../vite/plugin-sanity-favicons.js')

    const options = {
      basePath: '/studio',
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    await getViteConfig(options)

    expect(sanityFaviconsPlugin).toHaveBeenCalledWith({
      customFaviconsPath: join(mockTestCwd, 'static'),
      defaultFaviconsPath: join(mockSanityPath, 'static/favicons'),
      staticUrlPath: '/studio/static',
    })
  })

  test('should include schema extraction plugin when enabled', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'development' as const,
      reactCompiler: undefined,
      schemaExtraction: {
        enabled: true,
        enforceRequiredFields: true,
        path: 'custom-schema.json',
        watchPatterns: ['custom/**/*.ts'],
        workspace: 'production',
      },
    }

    const config = await getViteConfig(options)

    const schemaPlugin = config.plugins?.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'sanity/schema-extraction',
    )

    expect(mockExtractSchemaPlugin).toHaveBeenCalledWith({
      additionalPatterns: ['custom/**/*.ts'],
      configPath: '/mock/config/path',
      enforceRequiredFields: true,
      outputPath: 'custom-schema.json',
      telemetryLogger: noopLogger,
      workDir: mockTestCwd,
      workspaceName: 'production',
    })
    expect(schemaPlugin).toBeDefined()
  })

  test('should not include schema extraction plugin when disabled', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'development' as const,
      reactCompiler: undefined,
      schemaExtraction: {
        enabled: false,
        path: 'schema.json',
      },
    }

    const config = await getViteConfig(options)

    const schemaPlugin = config.plugins?.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'sanity/schema-extraction',
    )

    expect(mockExtractSchemaPlugin).not.toHaveBeenCalled()
    expect(schemaPlugin).toBeUndefined()
  })

  test('should include additional plugins when provided', async () => {
    const options = {
      additionalPlugins: [
        {
          name: 'sanity/typegen',
        },
      ],
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    const typegenPlugin = config.plugins?.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'sanity/typegen',
    )

    expect(typegenPlugin).toBeDefined()
  })

  test('should include additional plugins for workbench apps', async () => {
    const options = {
      additionalPlugins: [
        {
          name: 'sanity/typegen',
        },
      ],
      cwd: mockTestCwd,
      entries: {relativeConfigLocation: '../../sanity.config.ts', relativeEntry: '../../src/App'},
      getEnvironmentVariables,
      isWorkbenchApp: true,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    const typegenPlugin = config.plugins?.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'sanity/typegen',
    )

    expect(typegenPlugin).toBeDefined()
  })

  test('should include federation plugin when enabled', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: {relativeConfigLocation: '../../sanity.config.ts', relativeEntry: '../../src/App'},
      getEnvironmentVariables,
      isWorkbenchApp: true,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    const federationPlugin = config.plugins?.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'sanity/federation',
    )

    expect(mockFederationPlugin).toHaveBeenCalledWith({
      isApp: false,
      pkgJson: {name: 'sanity'},
      studioConfigPath: '../../sanity.config.ts',
      workDir: mockTestCwd,
    })
    expect(federationPlugin).toBeDefined()
    // Workbench stacks the app server next to the workbench port, so it must
    // be able to drift even when the project is a studio.
    expect(config.server?.strictPort).toBe(false)
  })

  test('should not include federation plugin when disabled', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      isWorkbenchApp: false,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    const federationPlugin = config.plugins?.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'sanity/federation',
    )

    expect(mockFederationPlugin).not.toHaveBeenCalled()
    expect(federationPlugin).toBeUndefined()
  })

  test('should not include federation plugin when federation is undefined', async () => {
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'development' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)

    const federationPlugin = config.plugins?.find(
      (p) => p && typeof p === 'object' && 'name' in p && p.name === 'sanity/federation',
    )

    expect(mockFederationPlugin).not.toHaveBeenCalled()
    expect(federationPlugin).toBeUndefined()
  })
})

describe('#finalizeViteConfig', () => {
  const mockTestRoot = convertToSystemPath('/test/root')
  const mockTestMain = convertToSystemPath('/test/main.js')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('should re-assert the default rolldown options over a userland config', async () => {
    const {mergeConfig} = await import('vite')

    // The pristine config produced by getViteConfig, with the studio entry,
    // vendor entries, and other critical rolldown options.
    const defaultRolldownOptions = {
      input: {
        'react/index': convertToSystemPath('/pkg/react/index.js'),
        sanity: join(mockTestRoot, '.sanity/runtime/app.js'),
      },
      preserveEntrySignatures: 'exports-only' as const,
    }
    const defaultConfig: InlineConfig = {
      build: {rolldownOptions: defaultRolldownOptions},
      root: mockTestRoot,
    }

    // A userland vite hook returned a brand-new `rolldownOptions`, dropping
    // the vendor entries and `preserveEntrySignatures`.
    const userExtendedConfig: InlineConfig = {
      build: {rolldownOptions: {input: {main: mockTestMain}}},
      root: mockTestRoot,
    }

    await finalizeViteConfig(userExtendedConfig, defaultConfig)

    // The defaults are deep-merged back over the userland config: userland
    // additions (like the `main` input) survive the real mergeConfig, while
    // replaced critical options are healed.
    expect(mergeConfig).toHaveBeenCalledWith(userExtendedConfig, {
      build: {rolldownOptions: defaultRolldownOptions},
    })
  })

  test('should throw error when build.rolldownOptions.input is not an object', async () => {
    const inputConfig: InlineConfig = {
      build: {
        rolldownOptions: {
          input: convertToSystemPath('/single/entry.js'),
        },
      },
      root: mockTestRoot,
    }

    await expect(finalizeViteConfig(inputConfig, {})).rejects.toThrow(
      'Vite config must contain `build.rolldownOptions.input`, and it must be an object',
    )
  })

  test('should throw error when root is missing', async () => {
    const inputConfig: InlineConfig = {
      build: {
        rolldownOptions: {
          input: {
            main: mockTestMain,
          },
        },
      },
    }

    await expect(finalizeViteConfig(inputConfig, {})).rejects.toThrow(
      'Vite config must contain `root` property, and must point to the Sanity root directory',
    )
  })
})

describe('#extendViteConfigWithUserConfig', () => {
  const mockTest = convertToSystemPath('/test')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('should return default config when user config is undefined', async () => {
    const defaultConfig: InlineConfig = {
      mode: 'development',
      root: mockTest,
    }
    const env: ConfigEnv = {command: 'build', mode: 'development'}

    const result = await extendViteConfigWithUserConfig(env, defaultConfig, undefined as never)

    expect(result).toBe(defaultConfig)
  })

  test('should merge user config object with default config', async () => {
    const {mergeConfig} = await import('vite')

    const defaultConfig: InlineConfig = {
      mode: 'development',
      root: mockTest,
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
      root: mockTest,
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

describe('#onRolldownWarn and #suppressUnusedImport helper functions', () => {
  test('should suppress useDebugValue unused import warnings', async () => {
    const mockWarn = vi.fn()

    // Create a warning that should be suppressed
    const warning = {
      code: 'UNUSED_EXTERNAL_IMPORT' as const,
      message: 'useDebugValue is imported from external module "react"',
      names: ['useDebugValue', 'useState'],
    }

    // Access the onRolldownWarn function by testing getViteConfig in production mode
    // which includes the onwarn callback
    const options = {
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'production' as const,
      reactCompiler: undefined,
    }

    const config = await getViteConfig(options)
    const onwarn = config.build?.rolldownOptions?.onwarn

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
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'production' as const,
      reactCompiler: undefined,
    })

    const onwarn = config.build?.rolldownOptions?.onwarn
    onwarn?.(warning, mockWarn)

    // Should not call warn at all when only useDebugValue was present
    expect(mockWarn).not.toHaveBeenCalled()
  })

  test('should suppress warnings from node_modules', async () => {
    const mockWarn = vi.fn()

    const warning = {
      code: 'UNUSED_EXTERNAL_IMPORT' as const,
      ids: [join(convertToSystemPath('/project'), 'node_modules/some-lib/index.js')],
      message: 'Some warning from node_modules',
    }

    const config = await getViteConfig({
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'production' as const,
      reactCompiler: undefined,
    })

    const onwarn = config.build?.rolldownOptions?.onwarn
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
      cwd: mockTestCwd,
      entries: mockEntries,
      getEnvironmentVariables,
      mode: 'production' as const,
      reactCompiler: undefined,
    })

    const onwarn = config.build?.rolldownOptions?.onwarn
    onwarn?.(warning, mockWarn)

    // Should call warn for other warning types
    expect(mockWarn).toHaveBeenCalledWith(warning)
  })
})
