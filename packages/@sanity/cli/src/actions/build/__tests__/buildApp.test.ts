import {Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const FLAGS = {
  'auto-updates': true,
  json: false,
  minify: true,
  'source-maps': true,
  stats: true,
  yes: false,
} as const

const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedSelect = vi.hoisted(() => vi.fn())
const mockedSpinner = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockGetAppEnvironmentVariables = vi.hoisted(() => vi.fn().mockReturnValue({}))
const mockedIsInteractive = vi.hoisted(() => vi.fn(() => true))
const mockedBuildStaticFiles = vi.hoisted(() => vi.fn())
const mockedGetLocalPackageVersion = vi.hoisted(() => vi.fn())

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

vi.mock('@sanity/cli-build/_internal/build', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-build/_internal/build')>()
  return {
    ...original,
    buildStaticFiles: mockedBuildStaticFiles,
    resolveVendorBuildConfig: vi.fn(),
  }
})

vi.mock('@sanity/cli-build/_internal/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-build/_internal/env')>()
  return {
    ...original,
    getAppEnvironmentVariables: mockGetAppEnvironmentVariables,
  }
})

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...original,
    getLocalPackageVersion: mockedGetLocalPackageVersion,
    isInteractive: mockedIsInteractive,
  }
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  mockedSpinner.mockImplementation(original.spinner)
  return {
    ...original,
    confirm: mockedConfirm,
    select: mockedSelect,
    spinner: mockedSpinner,
  }
})

// Import after mocks are set up
const {buildApp} = await import('../buildApp.js')

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
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
    mockedIsInteractive.mockReturnValue(true)
    mockedConfirm.mockResolvedValue(true)
    mockedSelect.mockResolvedValue('disable-auto-updates')
    mockedGetLocalPackageVersion.mockResolvedValue('1.0.0')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('outputs included environment variables', async () => {
    const output = createMockOutput()

    mockGetAppEnvironmentVariables.mockImplementation(() => ({
      SANITY_APP_TEST_VAR: 'test-value',
    }))

    await buildApp({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('SANITY_APP_TEST_VAR'))
  })

  test('should error when @sanity/sdk-react is not installed', async () => {
    const output = createMockOutput()

    mockedGetLocalPackageVersion.mockImplementation((moduleName) =>
      moduleName === '@sanity/sdk-react' ? null : '1.0.0',
    )

    await buildApp({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith(
      'Failed to find installed @sanity/sdk-react version',
      {exit: 1},
    )
  })

  test('should handle build errors gracefully', async () => {
    const output = createMockOutput()

    mockedBuildStaticFiles.mockRejectedValue(new Error('build static files error'))

    await buildApp({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith(
      'Failed to build Sanity application: build static files error',
      {exit: 1},
    )
  })

  test('should prompt for directory cleanup with custom output dir and confirm', async () => {
    const output = createMockOutput()

    const customDir = 'custom-output'
    await buildApp({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: FLAGS,
      outDir: customDir,
      output,
      workDir: '/tmp',
    })

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
    await buildApp({
      autoUpdatesEnabled: false,
      cliConfig: {},
      flags: FLAGS,
      outDir: customDir,
      output,
      workDir: '/tmp',
    })

    expect(mockedSpinner).not.toHaveBeenCalledWith('Clean output folder')
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  })

  test('should exit when user declines version diff prompt', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedConfirm.mockResolvedValue(false)

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith('Declined to continue with build', {exit: 1})
  })

  test('should continue build when user confirms version diff prompt', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedConfirm.mockResolvedValue(true)

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

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

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('prerelease versions'), {
      exit: 1,
    })
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--no-auto-updates'), {
      exit: 1,
    })
    expect(mockedSelect).not.toHaveBeenCalled()
  })

  test('should exit when user selects "cancel" for prerelease prompt', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })
    mockedSelect.mockResolvedValue('cancel')

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith('Declined to continue with build', {exit: 1})
  })

  test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })
    mockedSelect.mockResolvedValue('disable-auto-updates')

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.warn).toHaveBeenCalledWith('Auto-updates disabled for this build')
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
    expect(mockedBuildStaticFiles).toHaveBeenCalled()
  })

  test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk', remote: '1.1.0'}],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })
    mockedSelect.mockResolvedValue('disable-auto-updates')

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
    // select should only be called once (for the prerelease prompt), not twice
    expect(mockedSelect).toHaveBeenCalledTimes(1)
    // confirm for version mismatch should not have been called
    expect(mockedConfirm).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('different from the versions currently served'),
      }),
    )
  })

  test('should skip version diff prompt in unattended mode', async () => {
    const output = createMockOutput()

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
      unresolvedPrerelease: [],
    })

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: {...FLAGS, yes: true},
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedConfirm).not.toHaveBeenCalled()
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  })

  test('should skip version diff prompt in non-interactive mode and show warning', async () => {
    const output = createMockOutput()

    mockedIsInteractive.mockReturnValue(false)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
      unresolvedPrerelease: [],
    })

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(mockedConfirm).not.toHaveBeenCalled()
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('@sanity/sdk-react (local version: 1.0.0, runtime version: 1.1.0)'),
    )
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  })

  test('should error in non-interactive mode when prerelease versions are detected', async () => {
    const output = createMockOutput()

    mockedIsInteractive.mockReturnValue(false)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })

    await buildApp({
      autoUpdatesEnabled: true,
      cliConfig: {},
      flags: FLAGS,
      outDir: '/tmp/dist',
      output,
      workDir: '/tmp',
    })

    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('prerelease versions'), {
      exit: 1,
    })
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--no-auto-updates'), {
      exit: 1,
    })
    expect(mockedSelect).not.toHaveBeenCalled()
  })
})
