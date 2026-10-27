import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {type Output} from '@sanity/cli-core/types'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildApp, type BuildAppEventListener, type BuildOptions} from '../buildApp.js'
import {resolveVendorBuildConfig} from '../resolveVendorBuildConfig.js'

function buildOptions(
  overrides: Partial<BuildOptions> & Pick<BuildOptions, 'output'>,
  eventListenerOverrides?: Partial<BuildAppEventListener>,
): BuildOptions {
  return {
    appId: undefined,
    appTitle: undefined,
    autoUpdatesEnabled: false,
    checkAppId() {},
    async compareDependencyVersions() {
      return {mismatched: [], unresolvedPrerelease: []}
    },
    determineBasePath() {
      return ''
    },
    entry: undefined,
    eventListener: {
      async onPreReleaseInInteractiveAutoUpdate() {},
      onPreReleaseInNonInteractiveAutoUpdate() {},
      ...eventListenerOverrides,
    },
    isWorkbenchApp: false,
    minify: true,
    outDir: '/tmp/dist',
    reactCompiler: undefined,
    schemaExtraction: undefined,
    sourceMap: true,
    stats: true,
    unattendedMode: false,
    vite: undefined,
    workDir: '/tmp',
    ...overrides,
  }
}

const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedSpinner = vi.hoisted(() => vi.fn())
const mockGetAppEnvironmentVariables = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockedIsInteractive = vi.hoisted(() => vi.fn(() => true))
const mockedBuildStaticFiles = vi.hoisted(() => vi.fn())
const mockedGetLocalPackageVersion = vi.hoisted(() => vi.fn())
const mockedResolveWorkbenchApp = vi.hoisted(() => vi.fn())

vi.mock(import('../buildStaticFiles.js'), () => ({
  buildStaticFiles: mockedBuildStaticFiles,
}))

vi.mock(import('../resolveVendorBuildConfig.js'), () => ({
  resolveVendorBuildConfig: vi.fn(),
}))

vi.mock('../buildDebug', () => ({
  buildDebug: vi.fn(),
}))

vi.mock(import('../getEnvironmentVariables.js'), () => ({
  getAppEnvironmentVariables: mockGetAppEnvironmentVariables,
}))

vi.mock(import('../getAutoUpdatesImportMap'), () => ({
  getAutoUpdatesCssUrls: vi.fn(),
  getAutoUpdatesImportMap: vi.fn(),
}))

vi.mock(import('@sanity/cli-core/package-manager'), () => ({
  getLocalPackageVersion: mockedGetLocalPackageVersion,
}))

vi.mock(import('@sanity/cli-core/util'), () => ({
  isInteractive: mockedIsInteractive,
}))

vi.mock(import('@sanity/cli-core/ux'), async (importOriginal) => {
  const original = await importOriginal()
  mockedSpinner.mockImplementation(original.spinner)
  return {
    ...original,
    confirm: mockedConfirm,
    spinner: mockedSpinner,
  }
})

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('#buildApp', () => {
  beforeEach(() => {
    mockedBuildStaticFiles.mockResolvedValue({chunks: []})
    mockedIsInteractive.mockReturnValue(true)
    mockedConfirm.mockResolvedValue(true)
    mockedGetLocalPackageVersion.mockResolvedValue('1.0.0')
    mockedResolveWorkbenchApp.mockReturnValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test.each([
    {isApp: false, styledComponents: '6.1.18'},
    {isApp: true, styledComponents: undefined},
  ])(
    'provides styled-components as a vendor package when installed ($styledComponents)',
    async ({isApp, styledComponents}) => {
      mockedGetLocalPackageVersion.mockImplementation(async (name) =>
        name === 'styled-components' ? styledComponents : '1.0.0',
      )

      await buildApp(buildOptions({autoUpdatesEnabled: true, output: createMockOutput()}))

      expect(resolveVendorBuildConfig).toHaveBeenCalledWith({cwd: expect.any(String), isApp})
    },
  )

  test('outputs included environment variables', async () => {
    const output = createMockOutput()

    mockGetAppEnvironmentVariables.mockImplementation(() => ({
      SANITY_APP_TEST_VAR: 'test-value',
    }))

    await buildApp(buildOptions({output, unattendedMode: true}))

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('SANITY_APP_TEST_VAR'))
  })

  test('should error when @sanity/sdk-react is not installed', async () => {
    const output = createMockOutput()

    mockedGetLocalPackageVersion.mockImplementation((moduleName) =>
      moduleName === '@sanity/sdk-react' ? null : '1.0.0',
    )

    await buildApp(buildOptions({output, unattendedMode: true}))

    expect(output.error).toHaveBeenCalledWith(
      'Failed to find installed @sanity/sdk-react version',
      {exit: exitCodes.RUNTIME_ERROR},
    )
  })

  // A workbench config (the Media Library) ships no SDK application — its
  // island runtime comes from `sanity` — so the scaffolded template installs
  // `sanity` but not `@sanity/sdk-react`, and the build must accept that.
  describe('config-only build', () => {
    const configExposes: BuildOptions['exposes'] = {
      config: {appType: 'media-library', fields: []},
    }

    let outDir: string
    beforeEach(async () => {
      outDir = await mkdtemp(join(tmpdir(), 'build-app-config-'))
      // A workbench build reads the mf-manifest.json its bundle writes.
      mockedBuildStaticFiles.mockImplementation(async ({outputDir}) => {
        await mkdir(outputDir, {recursive: true})
        await writeFile(join(outputDir, 'mf-manifest.json'), '{"id":"my-config"}')
        return {chunks: []}
      })
    })
    afterEach(async () => {
      await rm(outDir, {force: true, recursive: true})
    })

    test('does not require @sanity/sdk-react', async () => {
      const output = createMockOutput()

      mockedGetLocalPackageVersion.mockImplementation((moduleName) =>
        moduleName === '@sanity/sdk-react' ? null : '1.0.0',
      )

      await buildApp(
        buildOptions({
          exposes: configExposes,
          isWorkbenchApp: true,
          outDir,
          output,
          unattendedMode: true,
        }),
      )

      expect(output.error).not.toHaveBeenCalled()
      expect(mockedBuildStaticFiles).toHaveBeenCalled()
    })

    test('requires sanity (its island-runtime provider) instead', async () => {
      const output = createMockOutput()

      mockedGetLocalPackageVersion.mockImplementation((moduleName) =>
        moduleName === 'sanity' ? null : '1.0.0',
      )

      await buildApp(
        buildOptions({
          exposes: configExposes,
          isWorkbenchApp: true,
          outDir,
          output,
          unattendedMode: true,
        }),
      )

      expect(output.error).toHaveBeenCalledWith('Failed to find installed sanity version', {
        exit: exitCodes.RUNTIME_ERROR,
      })
      expect(mockedBuildStaticFiles).not.toHaveBeenCalled()
    })

    test('skips the SDK auto-update machinery', async () => {
      const output = createMockOutput()
      const compareDependencyVersions = vi
        .fn()
        .mockResolvedValue({mismatched: [], unresolvedPrerelease: []})

      await buildApp(
        buildOptions({
          autoUpdatesEnabled: true,
          compareDependencyVersions,
          exposes: configExposes,
          isWorkbenchApp: true,
          outDir,
          output,
          unattendedMode: true,
        }),
      )

      expect(compareDependencyVersions).not.toHaveBeenCalled()
      expect(output.error).not.toHaveBeenCalled()
      expect(mockedBuildStaticFiles).toHaveBeenCalled()
    })

    // The scaffolded template's real-world shape: auto-updates on by default,
    // `@sanity/sdk-react` never installed. Without the appType gate this path
    // fell through to parsing the missing SDK version.
    test('builds with auto-updates enabled and no @sanity/sdk-react installed', async () => {
      const output = createMockOutput()

      mockedGetLocalPackageVersion.mockImplementation((moduleName) =>
        moduleName === '@sanity/sdk-react' ? null : '1.0.0',
      )

      await buildApp(
        buildOptions({
          autoUpdatesEnabled: true,
          exposes: configExposes,
          isWorkbenchApp: true,
          outDir,
          output,
          unattendedMode: true,
        }),
      )

      expect(output.error).not.toHaveBeenCalled()
      expect(mockedBuildStaticFiles).toHaveBeenCalled()
    })

    // The gate keys on `appType`, not on being a workbench build: a workbench
    // *views* app (no config) still ships the SDK runtime and must keep
    // requiring @sanity/sdk-react.
    test('a workbench app without a config still requires @sanity/sdk-react', async () => {
      const output = createMockOutput()

      mockedGetLocalPackageVersion.mockImplementation((moduleName) =>
        moduleName === '@sanity/sdk-react' ? null : '1.0.0',
      )

      await buildApp(
        buildOptions({
          isWorkbenchApp: true,
          outDir,
          output,
          unattendedMode: true,
        }),
      )

      expect(output.error).toHaveBeenCalledWith(
        'Failed to find installed @sanity/sdk-react version',
        {exit: exitCodes.RUNTIME_ERROR},
      )
      expect(mockedBuildStaticFiles).not.toHaveBeenCalled()
    })
  })

  test('should handle build errors gracefully', async () => {
    const output = createMockOutput()

    mockedBuildStaticFiles.mockRejectedValue(new Error('build static files error'))

    await buildApp(buildOptions({output, unattendedMode: true}))

    expect(output.error).toHaveBeenCalledWith(
      'Failed to build Sanity application: build static files error',
      {exit: exitCodes.RUNTIME_ERROR},
    )
  })

  test('should prompt for directory cleanup with custom output dir and confirm', async () => {
    const output = createMockOutput()

    const customDir = 'custom-output'
    await buildApp(buildOptions({outDir: customDir, output}))

    expect(mockedConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Do you want to delete the existing directory'),
      }),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Clean output folder')
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should skip cleanup when user declines directory cleanup prompt', async () => {
    const output = createMockOutput()

    mockedConfirm.mockResolvedValue(false)

    const customDir = 'custom-output'
    await buildApp(buildOptions({outDir: customDir, output}))

    expect(mockedSpinner).not.toHaveBeenCalledWith('Clean output folder')
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  })

  test('should exit when user declines version diff prompt', async () => {
    const output = createMockOutput()

    mockedConfirm.mockResolvedValue(false)

    await buildApp(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
      }),
    )

    expect(output.error).toHaveBeenCalledWith('Declined to continue with build', {
      exit: exitCodes.RUNTIME_ERROR,
    })
  })

  test('should continue build when user confirms version diff prompt', async () => {
    const output = createMockOutput()

    mockedConfirm.mockResolvedValue(true)

    await buildApp(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
      }),
    )

    expect(mockedConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('different from the versions currently served'),
      }),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should error in unattended mode when prerelease versions are detected', async () => {
    const output = createMockOutput()

    const onPreReleaseInInteractiveAutoUpdate = vi.fn()
    const onPreReleaseInNonInteractiveAutoUpdate = vi.fn()

    await buildApp(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [],
            unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
          }),
          output,
          unattendedMode: true,
        },
        {
          onPreReleaseInInteractiveAutoUpdate,
          onPreReleaseInNonInteractiveAutoUpdate,
        },
      ),
    )

    expect(onPreReleaseInNonInteractiveAutoUpdate).toHaveBeenCalledWith({
      message: expect.stringContaining('prerelease versions'),
    })
    expect(onPreReleaseInInteractiveAutoUpdate).not.toHaveBeenCalled()
  })

  test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
    const output = createMockOutput()

    const onPreReleaseInInteractiveAutoUpdate = vi.fn()

    await buildApp(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [],
            unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
          }),
          output,
        },
        {
          onPreReleaseInInteractiveAutoUpdate,
        },
      ),
    )

    expect(onPreReleaseInInteractiveAutoUpdate).toHaveBeenCalled()
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
    const output = createMockOutput()

    const onPreReleaseInInteractiveAutoUpdate = vi.fn()

    await buildApp(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk', remote: '1.1.0'}],
            unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
          }),
          output,
        },
        {
          onPreReleaseInInteractiveAutoUpdate,
        },
      ),
    )

    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
    expect(onPreReleaseInInteractiveAutoUpdate).toHaveBeenCalled()
    // confirm for version mismatch should not have been called
    expect(mockedConfirm).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('different from the versions currently served'),
      }),
    )
  })

  test('should skip version diff prompt in unattended mode', async () => {
    const output = createMockOutput()

    await buildApp(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
        unattendedMode: true,
      }),
    )

    expect(mockedConfirm).not.toHaveBeenCalled()
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  })

  test('should skip version diff prompt in non-interactive mode and show warning', async () => {
    const output = createMockOutput()

    mockedIsInteractive.mockReturnValue(false)

    await buildApp(
      buildOptions({
        autoUpdatesEnabled: true,
        compareDependencyVersions: async () => ({
          mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
          unresolvedPrerelease: [],
        }),
        output,
      }),
    )

    expect(mockedConfirm).not.toHaveBeenCalled()
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('@sanity/sdk-react (local version: 1.0.0, runtime version: 1.1.0)'),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  })

  test('should error in non-interactive mode when prerelease versions are detected', async () => {
    const output = createMockOutput()

    mockedIsInteractive.mockReturnValue(false)

    const onPreReleaseInInteractiveAutoUpdate = vi.fn()
    const onPreReleaseInNonInteractiveAutoUpdate = vi.fn()

    await buildApp(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [],
            unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
          }),
          output,
        },
        {
          onPreReleaseInInteractiveAutoUpdate,
          onPreReleaseInNonInteractiveAutoUpdate,
        },
      ),
    )

    expect(onPreReleaseInNonInteractiveAutoUpdate).toHaveBeenCalledWith({
      message: expect.stringContaining('prerelease versions'),
    })
    expect(onPreReleaseInInteractiveAutoUpdate).not.toHaveBeenCalled()
  })

  test('should check appId when auto-updates are ebnabled', async () => {
    const output = createMockOutput()

    const mockCheckAppId = vi.fn()

    await buildApp(buildOptions({autoUpdatesEnabled: true, checkAppId: mockCheckAppId, output}))

    expect(mockCheckAppId).toHaveBeenCalled()
  })

  test('should not check appId when auto-updates are disabled', async () => {
    const output = createMockOutput()

    const mockCheckAppId = vi.fn()

    await buildApp(buildOptions({checkAppId: mockCheckAppId, output}))

    expect(mockCheckAppId).not.toHaveBeenCalled()
  })
  describe('federation manifest', () => {
    let outDir: string
    beforeEach(async () => {
      outDir = await mkdtemp(join(tmpdir(), 'build-app-'))
    })
    afterEach(async () => {
      await rm(outDir, {force: true, recursive: true})
    })

    test('resolves to the mf-manifest.json a federated build writes', async () => {
      const output = createMockOutput()
      mockedBuildStaticFiles.mockImplementation(async ({outputDir}) => {
        await mkdir(outputDir, {recursive: true})
        await writeFile(join(outputDir, 'mf-manifest.json'), '{"id":"my-app"}')
        return {chunks: []}
      })

      await expect(
        buildApp(buildOptions({isWorkbenchApp: true, outDir, output, unattendedMode: true})),
      ).resolves.toEqual({mfManifest: {id: 'my-app'}})
    })

    test('resolves to no manifest for a build that is not federated', async () => {
      const output = createMockOutput()

      await expect(buildApp(buildOptions({outDir, output, unattendedMode: true}))).resolves.toEqual(
        {mfManifest: undefined},
      )
      expect(output.error).not.toHaveBeenCalled()
    })

    test('fails a federated build whose output lacks mf-manifest.json, naming the file', async () => {
      const output = createMockOutput()
      mockedBuildStaticFiles.mockImplementation(async ({outputDir}) => {
        await mkdir(outputDir, {recursive: true})
        return {chunks: []}
      })

      await buildApp(buildOptions({isWorkbenchApp: true, outDir, output, unattendedMode: true}))

      expect(output.error).toHaveBeenCalledWith(
        `Failed to build Sanity application: "${join(outDir, 'mf-manifest.json')}" does not exist; a federation build created with "sanity build" writes it.`,
        {exit: exitCodes.RUNTIME_ERROR},
      )
    })
  })
})
