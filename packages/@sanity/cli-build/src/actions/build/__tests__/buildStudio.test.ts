import {readdir} from 'node:fs/promises'
import {platform} from 'node:os'
import {join} from 'node:path'

import {type Output} from '@sanity/cli-core'
import {testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BuildOptions, buildStudio} from '../buildStudio'

const mockedSelect = vi.hoisted(() => vi.fn())
const mockedSpinner = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockedIsInteractive = vi.hoisted(() => vi.fn())

function buildOptions(cwd: string, output: Output): BuildOptions {
  return {
    appId: undefined,
    autoUpdatesEnabled: true,
    buildViteReactPlugin: () => [],
    calledFromDeploy: false,
    determineBasePath: () => '/',
    getEnvironmentVariables: () => ({}),
    isApp: false,
    minify: true,
    outDir: `${cwd}/dist`,
    output,
    projectId: undefined,
    schemaExtraction: undefined,
    sourceMap: true,
    stats: true,
    unattendedMode: true,
    upgradePackages: async () => {},
    vite: undefined,
    workDir: cwd,
  }
}

vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...original,
    isInteractive: mockedIsInteractive,
  }
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  mockedSpinner.mockImplementation(original.spinner)
  return {
    ...original,
    select: mockedSelect,
    spinner: mockedSpinner,
  }
})

function createMockOutput(): Output {
  return {
    error: vi.fn().mockImplementation(
      (
        input: Error | string,
        options: {
          code?: string
          exit?: false | number
        },
      ) => {
        if (options.exit) throw new Error('output.error called with exit')
      },
    ),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('#buildStudio', {timeout: (platform() === 'win32' ? 120 : 60) * 1000}, () => {
  beforeEach(() => {
    mockedSelect.mockResolvedValue('upgrade-and-proceed')
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should exit when user selects "cancel" for version diff', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('cancel')

    const mockedUpgradePackages = vi.fn()

    await expect(
      buildStudio({
        ...buildOptions(cwd, output),
        unattendedMode: false,
        upgradePackages: mockedUpgradePackages,
      }),
    ).rejects.toThrow()

    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining('Declined to continue with build'),
      {exit: 1},
    )
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should upgrade packages when user selects "upgrade" only', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('upgrade')

    const mockedUpgradePackages = vi.fn()

    await buildStudio({
      ...buildOptions(cwd, output),
      unattendedMode: false,
      upgradePackages: mockedUpgradePackages,
    })

    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
    )
    expect(mockedSpinner).not.toHaveBeenCalledWith('Build Sanity Studio')
  })

  test('should continue without upgrading when user selects "continue"', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('continue')

    const mockedUpgradePackages = vi.fn()

    await buildStudio({
      ...buildOptions(cwd, output),
      unattendedMode: false,
      upgradePackages: mockedUpgradePackages,
    })

    expect(mockedUpgradePackages).not.toHaveBeenCalled()

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
  })

  test('should upgrade and build when user selects "upgrade-and-proceed"', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('upgrade-and-proceed')

    const mockedUpgradePackages = vi.fn()

    await buildStudio({
      ...buildOptions(cwd, output),
      unattendedMode: false,
      upgradePackages: mockedUpgradePackages,
    })

    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
    )

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
  })

  test('should error in unattended mode when prerelease versions are detected', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })

    await expect(
      buildStudio({
        ...buildOptions(cwd, output),
        unattendedMode: true,
      }),
    ).rejects.toThrow()

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

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    mockedSelect.mockResolvedValue('cancel')

    await expect(
      buildStudio({
        ...buildOptions(cwd, output),
        unattendedMode: false,
      }),
    ).rejects.toThrow()

    expect(output.error).toHaveBeenCalledWith('Declined to continue with build', {exit: 1})
  })

  test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    mockedSelect.mockResolvedValue('disable-auto-updates')

    const mockedUpgradePackages = vi.fn()

    await buildStudio({
      ...buildOptions(cwd, output),
      unattendedMode: false,
    })

    expect(output.warn).toHaveBeenCalledWith('Auto-updates disabled for this build')

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')

    // Should not have shown the version mismatch prompt
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(true)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: '@sanity/vision', remote: '3.1.0'}],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    // First select call is for prerelease prompt
    mockedSelect.mockResolvedValue('disable-auto-updates')

    const mockedUpgradePackages = vi.fn()

    await buildStudio({
      ...buildOptions(cwd, output),
      unattendedMode: false,
      upgradePackages: mockedUpgradePackages,
    })

    // select should only be called once (for the prerelease prompt), not twice
    expect(mockedSelect).toHaveBeenCalledTimes(1)
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should skip version prompt in non-interactive mode and show warning', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(false)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })

    await buildStudio({
      ...buildOptions(cwd, output),
      unattendedMode: false,
    })

    expect(mockedSelect).not.toHaveBeenCalled()

    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('local version: 3.0.0, runtime version: 3.1.0'),
    )
  })

  test('should skip version prompt in unattended mode and show warning', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })

    await buildStudio({
      ...buildOptions(cwd, output),
      unattendedMode: true,
    })

    expect(mockedSelect).not.toHaveBeenCalled()

    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('local version: 3.0.0, runtime version: 3.1.0'),
    )
  })
})
