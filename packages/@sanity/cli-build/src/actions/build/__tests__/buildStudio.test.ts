import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type Output} from '@sanity/cli-core/types'
import {DefinedTelemetryTrace} from '@sanity/telemetry'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type BuildOptions, buildStudio, BuildStudioEventListener} from '../buildStudio.js'
import {getAutoUpdatesCssUrls, getAutoUpdatesImportMap} from '../getAutoUpdatesImportMap.js'
import {getInstalledBucketEntries, getPinnedImportMap} from '../getPinnedImportMap.js'

function buildOptions(
  overrides: Partial<BuildOptions> & Pick<BuildOptions, 'output'>,
  eventListenerOverrides?: Partial<BuildStudioEventListener>,
): BuildOptions {
  return {
    appId: undefined,
    autoUpdatesEnabled: false,
    checkAppId() {},
    async compareDependencyVersions() {
      return {mismatched: [], unresolvedPrerelease: []}
    },
    determineBasePath() {
      return ''
    },
    eventListener: {
      onBuildEnd() {},
      onBuildFail() {},
      onBuildStart() {},
      onCleanOutputDirEnd() {},
      onCleanOutputDirStart() {},
      onIncompatibleDeclaredStyledComponentsVersionRange() {},
      onIncompatibleInstalledStyledComponentsVersionRange() {},
      async onInteractiveNonDefaultOutputDir() {
        return {shouldClean: false}
      },
      onInvalidStyledComponentsVersionRange() {},
      onNoDeclaredStyledComponentsVersion() {},
      onNoInstalledSanityVersion() {},
      onNoInstalledStyledComponentsVersion() {},
      async onPreReleaseInInteractiveAutoUpdate() {},
      onPreReleaseInNonInteractiveAutoUpdate() {},
      async onVersionMismatchInInteractiveAutoUpdate() {
        return {stopBuild: false}
      },
      onVersionMismatchInNonInteractiveAutoUpdate() {},
      ...eventListenerOverrides,
    },
    isApp: false,
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

const mockGetStudioEnvironmentVariables = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockedIsInteractive = vi.hoisted(() => vi.fn())
const mockedBuildStaticFiles = vi.hoisted(() => vi.fn())
const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())

vi.mock(import('../buildStaticFiles.js'), () => ({
  buildStaticFiles: mockedBuildStaticFiles,
}))

vi.mock(import('../checkRequiredDependencies.js'), () => ({
  checkRequiredDependencies: vi.fn().mockResolvedValue({installedSanityVersion: '3.0.0'}),
}))

vi.mock(import('../checkStudioDependencyVersions.js'), () => ({
  checkStudioDependencyVersions: vi.fn().mockResolvedValue(undefined),
}))

vi.mock(import('../getAutoUpdatesImportMap.js'), () => ({
  getAutoUpdatesCssUrls: vi.fn(),
  getAutoUpdatesImportMap: vi.fn(),
}))

vi.mock(import('../getPinnedImportMap.js'), () => ({
  getInstalledBucketEntries: vi.fn().mockResolvedValue(['index']),
  getPinnedImportMap: vi.fn().mockReturnValue({
    cssUrls: ['https://modules.sanity-cdn.com/modules/v1/sanity/3.0.0/bare/index.css'],
    imports: {sanity: 'https://modules.sanity-cdn.com/modules/v1/sanity/3.0.0/bare/index.mjs'},
  }),
}))

vi.mock(import('../resolveVendorBuildConfig.js'), () => ({
  resolveVendorBuildConfig: vi.fn().mockResolvedValue({
    entries: {},
    namesByChunkName: {},
    specifiersByChunkName: {},
  }),
}))

vi.mock(import('../../../telemetry/build.telemetry.js'), () => ({
  StudioBuildTrace: {} as DefinedTelemetryTrace<
    {
      outputSize: number
    },
    void
  >,
}))

vi.mock(import('../getEnvironmentVariables.js'), () => ({
  getStudioEnvironmentVariables: mockGetStudioEnvironmentVariables,
}))

vi.mock(import('@sanity/cli-core/package-manager'), () => ({
  getLocalPackageVersion: mockGetLocalPackageVersion,
}))
vi.mock(import('@sanity/cli-core/util'), () => ({
  isInteractive: mockedIsInteractive,
}))

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('#buildStudio', () => {
  beforeEach(() => {
    mockedBuildStaticFiles.mockResolvedValue({chunks: []})
    mockedIsInteractive.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should handle build errors gracefully', async () => {
    const output = createMockOutput()

    mockedBuildStaticFiles.mockImplementation(() => {
      throw new Error('build static files error')
    })
    const onBuildFail = vi.fn()

    await buildStudio(buildOptions({output, unattendedMode: true}, {onBuildFail}))

    expect(onBuildFail).toHaveBeenCalledWith({
      message: expect.stringContaining('Failed to build Sanity Studio'),
    })
  })

  test('should prompt for directory cleanup with custom output dir and confirm', async () => {
    const output = createMockOutput()

    const onInteractiveNonDefaultOutputDir = vi.fn().mockResolvedValue({shouldClean: true})
    const onCleanOutputDirStart = vi.fn()

    const customDir = 'custom-output'
    await buildStudio(
      buildOptions(
        {outDir: customDir, output},
        {
          onCleanOutputDirStart,
          onInteractiveNonDefaultOutputDir,
        },
      ),
    )

    expect(onInteractiveNonDefaultOutputDir).toHaveBeenCalledWith({
      message: expect.stringContaining('Do you want to delete the existing directory'),
    })
    expect(onCleanOutputDirStart).toHaveBeenCalledWith({message: 'Clean output folder'})
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should skip cleanup when user declines directory cleanup prompt', async () => {
    const output = createMockOutput()

    const onCleanOutputDirStart = vi.fn()
    const onInteractiveNonDefaultOutputDir = vi.fn().mockResolvedValue({shouldClean: false})

    const customDir = 'custom-output'
    await buildStudio(
      buildOptions(
        {outDir: customDir, output},
        {onCleanOutputDirStart, onInteractiveNonDefaultOutputDir},
      ),
    )

    expect(onCleanOutputDirStart).not.toHaveBeenCalled()
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should exit when user selects "cancel" for version diff', async () => {
    const output = createMockOutput()

    const onBuildStart = vi.fn()
    const onVersionMismatchInInteractiveAutoUpdate = vi.fn().mockResolvedValue({stopBuild: true})

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
            unresolvedPrerelease: [],
          }),
          output,
        },
        {
          onBuildStart,
          onVersionMismatchInInteractiveAutoUpdate,
        },
      ),
    )

    expect(onVersionMismatchInInteractiveAutoUpdate).toHaveBeenCalled()
    expect(onBuildStart).not.toHaveBeenCalled()
  })

  test('should upgrade packages when user selects "upgrade" only', async () => {
    const output = createMockOutput()

    const onVersionMismatchInInteractiveAutoUpdate = vi.fn().mockResolvedValue({stopBuild: true})

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
            unresolvedPrerelease: [],
          }),
          output,
        },
        {
          onVersionMismatchInInteractiveAutoUpdate,
        },
      ),
    )

    expect(onVersionMismatchInInteractiveAutoUpdate).toHaveBeenCalled()
    expect(mockedBuildStaticFiles).not.toHaveBeenCalled()
  })

  test('should upgrade and build when user selects "upgrade-and-proceed"', async () => {
    const output = createMockOutput()

    const onVersionMismatchInInteractiveAutoUpdate = vi.fn().mockResolvedValue({stopBuild: false})

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
            unresolvedPrerelease: [],
          }),
          output,
        },
        {
          onVersionMismatchInInteractiveAutoUpdate,
        },
      ),
    )

    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should error in unattended mode when prerelease versions are detected', async () => {
    const output = createMockOutput()

    const onPreReleaseInNonInteractiveAutoUpdate = vi.fn()
    const onPreReleaseInInteractiveAutoUpdate = vi.fn()

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [],
            unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
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

  test('should exit when user selects "cancel" for prerelease prompt', async () => {
    const output = createMockOutput()

    const onPreReleaseInInteractiveAutoUpdate = vi.fn()

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [],
            unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
          }),
          output,
        },
        {
          onPreReleaseInInteractiveAutoUpdate,
        },
      ),
    )

    expect(onPreReleaseInInteractiveAutoUpdate).toHaveBeenCalled()
  })

  test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
    const output = createMockOutput()

    const onBuildStart = vi.fn()
    const onPreReleaseInInteractiveAutoUpdate = vi.fn()

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [],
            unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
          }),
          output,
        },
        {
          onBuildStart,
          onPreReleaseInInteractiveAutoUpdate,
        },
      ),
    )

    expect(onPreReleaseInInteractiveAutoUpdate).toHaveBeenCalled()
    expect(onBuildStart).toHaveBeenCalledWith({message: 'Build Sanity Studio'})
  })

  test('outputs include environment variables', async () => {
    const output = createMockOutput()

    mockGetStudioEnvironmentVariables.mockImplementation(() => ({
      SANITY_STUDIO_TEST_VAR: 'test-value',
    }))

    await buildStudio(buildOptions({output}))

    expect(mockGetStudioEnvironmentVariables).toHaveBeenCalled()
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('SANITY_STUDIO_TEST_VAR'))
  })

  test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
    const output = createMockOutput()

    // First select call is for prerelease prompt
    const onBuildStart = vi.fn()
    const onPreReleaseInInteractiveAutoUpdate = vi.fn()
    const onVersionMismatchInInteractiveAutoUpdate = vi.fn()

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [{installed: '3.0.0', pkg: '@sanity/vision', remote: '3.1.0'}],
            unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
          }),
          output,
        },
        {
          onBuildStart,
          onPreReleaseInInteractiveAutoUpdate,
          onVersionMismatchInInteractiveAutoUpdate,
        },
      ),
    )

    expect(onPreReleaseInInteractiveAutoUpdate).toHaveBeenCalled()
    expect(onBuildStart).toHaveBeenCalledWith({message: 'Build Sanity Studio'})
    expect(onVersionMismatchInInteractiveAutoUpdate).not.toHaveBeenCalled()
  })

  test('should skip version prompt in unattended mode and show warning', async () => {
    const output = createMockOutput()

    const onBuildStart = vi.fn()
    const onVersionMismatchInNonInteractiveAutoUpdate = vi.fn()

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
            unresolvedPrerelease: [],
          }),
          output,
          unattendedMode: true,
        },
        {
          onBuildStart,
          onVersionMismatchInNonInteractiveAutoUpdate,
        },
      ),
    )

    expect(onVersionMismatchInNonInteractiveAutoUpdate).toHaveBeenCalledWith({
      versionMismatchWarning: expect.stringContaining(
        'local version: 3.0.0, runtime version: 3.1.0',
      ),
    })
    expect(onBuildStart).toHaveBeenCalledWith({message: 'Build Sanity Studio'})
  })

  test('should skip version prompt in non-interactive mode and show warning', async () => {
    const output = createMockOutput()

    mockedIsInteractive.mockReturnValue(false)

    const onBuildStart = vi.fn()
    const onVersionMismatchInNonInteractiveAutoUpdate = vi.fn()

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
            unresolvedPrerelease: [],
          }),
          output,
        },
        {
          onBuildStart,
          onVersionMismatchInNonInteractiveAutoUpdate,
        },
      ),
    )

    expect(onVersionMismatchInNonInteractiveAutoUpdate).toHaveBeenCalledWith({
      versionMismatchWarning: expect.stringContaining(
        'local version: 3.0.0, runtime version: 3.1.0',
      ),
    })
    expect(onBuildStart).toHaveBeenCalledWith({message: 'Build Sanity Studio'})
  })

  test('passes a vision entry with cssFile when @sanity/vision is installed locally', async () => {
    const output = createMockOutput()

    mockGetLocalPackageVersion.mockResolvedValueOnce('3.5.0')

    await buildStudio(buildOptions({appId: 'my-app-id', autoUpdatesEnabled: true, output}))

    const sanityDependencies = vi.mocked(getAutoUpdatesImportMap).mock.calls[0][0]
    expect(sanityDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({cssFile: 'index.css', name: 'sanity'}),
        expect.objectContaining({
          cssFile: 'index.css',
          name: '@sanity/vision',
          version: '3.5.0',
        }),
      ]),
    )

    // The same dependency array is passed to getAutoUpdatesCssUrls
    expect(vi.mocked(getAutoUpdatesCssUrls).mock.calls[0][0]).toBe(sanityDependencies)
  })

  test('passes the pinned bucket import map for the installed versions to the build', async () => {
    const output = createMockOutput()
    vi.mocked(getInstalledBucketEntries).mockImplementation(async (packageName) =>
      packageName === 'sanity' ? ['index', 'structure'] : ['index'],
    )

    await buildStudio(buildOptions({autoUpdatesEnabled: true, output, workDir: '/studio'}))

    expect(getInstalledBucketEntries).toHaveBeenCalledWith('sanity', '/studio')
    expect(vi.mocked(getPinnedImportMap).mock.calls[0][0]).toEqual([
      expect.objectContaining({entries: ['index', 'structure'], name: 'sanity', version: '3.0.0'}),
      expect.objectContaining({entries: ['index'], name: '@sanity/vision', version: '3.0.0'}),
    ])
    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        autoUpdates: expect.objectContaining({
          pinned: vi.mocked(getPinnedImportMap).mock.results[0].value,
        }),
      }),
    )
  })

  test('drops the pinned import map when prerelease versions disable auto-updates', async () => {
    const output = createMockOutput()

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [],
            unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
          }),
          output,
          unattendedMode: true,
        },
        {onPreReleaseInNonInteractiveAutoUpdate: vi.fn()},
      ),
    )

    expect(mockedBuildStaticFiles).toHaveBeenCalledWith(
      expect.objectContaining({autoUpdates: undefined}),
    )
  })

  test('warns and builds when the runtime version check cannot reach Module Server', async () => {
    const output = createMockOutput()
    const onBuildStart = vi.fn()

    await buildStudio(
      buildOptions(
        {
          autoUpdatesEnabled: true,
          compareDependencyVersions: async () => ({
            mismatched: [],
            unavailable: [
              {pkg: 'sanity', reason: 'HTTP 503 Service Unavailable'},
              {pkg: '@sanity/vision', reason: 'HTTP 503 Service Unavailable'},
            ],
            unresolvedPrerelease: [],
          }),
          output,
        },
        {onBuildStart},
      ),
    )

    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not check the runtime version of sanity, @sanity/vision'),
    )
    expect(onBuildStart).toHaveBeenCalledWith({message: 'Build Sanity Studio'})
  })

  test('should not check appId when auto-updates are disabled', async () => {
    const output = createMockOutput()

    const mockCheckAppId = vi.fn()

    await buildStudio(buildOptions({checkAppId: mockCheckAppId, output}))

    expect(mockCheckAppId).not.toHaveBeenCalled()
  })

  test('should check appId when auto-updates are enabled', async () => {
    const output = createMockOutput()

    const mockCheckAppId = vi.fn()

    await buildStudio(buildOptions({autoUpdatesEnabled: true, checkAppId: mockCheckAppId, output}))

    expect(mockCheckAppId).toHaveBeenCalled()
  })
  describe('federation manifest', () => {
    let outDir: string
    beforeEach(async () => {
      outDir = await mkdtemp(join(tmpdir(), 'build-studio-'))
    })
    afterEach(async () => {
      await rm(outDir, {force: true, recursive: true})
    })

    test('resolves to the mf-manifest.json a federated build writes', async () => {
      const output = createMockOutput()
      mockedBuildStaticFiles.mockImplementation(async ({outputDir}) => {
        await mkdir(outputDir, {recursive: true})
        await writeFile(join(outputDir, 'mf-manifest.json'), '{"id":"my-studio"}')
        return {chunks: []}
      })

      await expect(
        buildStudio(buildOptions({isWorkbenchApp: true, outDir, output, unattendedMode: true})),
      ).resolves.toEqual({mfManifest: {id: 'my-studio'}})
    })

    test('resolves to no manifest for a build that is not federated', async () => {
      const output = createMockOutput()
      const onBuildFail = vi.fn()

      await expect(
        buildStudio(buildOptions({outDir, output, unattendedMode: true}, {onBuildFail})),
      ).resolves.toEqual({mfManifest: undefined})
      expect(onBuildFail).not.toHaveBeenCalled()
    })

    test('fails a federated build whose output lacks mf-manifest.json, naming the file', async () => {
      const output = createMockOutput()
      mockedBuildStaticFiles.mockImplementation(async ({outputDir}) => {
        await mkdir(outputDir, {recursive: true})
        return {chunks: []}
      })
      const onBuildFail = vi.fn()

      await buildStudio(
        buildOptions({isWorkbenchApp: true, outDir, output, unattendedMode: true}, {onBuildFail}),
      )

      expect(onBuildFail).toHaveBeenCalledWith({
        message: `Failed to build Sanity Studio: "${join(outDir, 'mf-manifest.json')}" does not exist; a federation build created with "sanity build" writes it.`,
      })
    })
  })
})
