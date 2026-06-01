import {platform} from 'node:os'

import {type Output} from '@sanity/cli-core'
import {testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildApp, BuildOptions} from '../buildApp'

const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedSelect = vi.hoisted(() => vi.fn())
const mockedSpinner = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockedIsInteractive = vi.hoisted(() => vi.fn())

function buildOptions(cwd: string, output: Output): BuildOptions {
  return {
    appId: undefined,
    appTitle: undefined,
    autoUpdatesEnabled: true,
    calledFromDeploy: false,
    determineBasePath: () => '/',
    entry: undefined,
    getEnvironmentVariables: () => ({}),
    minify: true,
    outDir: `${cwd}/dist`,
    output,
    reactCompiler: undefined,
    schemaExtraction: undefined,
    sourceMap: true,
    stats: true,
    unattendedMode: false,
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
    confirm: mockedConfirm,
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

describe('#buildApp', {timeout: (platform() === 'win32' ? 120 : 60) * 1000}, () => {
  beforeEach(() => {
    mockedSelect.mockResolvedValue('upgrade-and-proceed')
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should skip cleanup when user declines directory cleanup prompt', async () => {
    const output = createMockOutput()

    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedConfirm.mockResolvedValue(false)
    mockedIsInteractive.mockReturnValue(true)

    await buildApp({
      ...buildOptions(cwd, output),
      outDir: `${cwd}/custom-output`,
    })

    expect(mockedConfirm).toHaveBeenCalled()
    expect(mockedSpinner).not.toHaveBeenCalledWith('Clean output folder')
    expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  })

  // test('should exit when user declines version diff prompt', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedIsInteractive.mockReturnValue(true)
  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
  //     unresolvedPrerelease: [],
  //   })
  //   mockedConfirm.mockResolvedValue(false)

  //   await expect(
  //     buildApp({
  //       ...buildOptions(cwd, output),
  //     }),
  //   ).rejects.toThrow()

  //   expect(output.error).toHaveBeenCalledWith(
  //     expect.stringContaining('Declined to continue with build'),
  //     {exit: 1},
  //   )
  // })

  // test('should continue build when user confirms version diff prompt', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedIsInteractive.mockReturnValue(true)
  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
  //     unresolvedPrerelease: [],
  //   })
  //   mockedConfirm.mockResolvedValue(true)

  //   await buildApp({
  //     ...buildOptions(cwd, output),
  //   })

  //   expect(mockedConfirm).toHaveBeenCalledWith(
  //     expect.objectContaining({
  //       message: expect.stringContaining('different from the versions currently served'),
  //     }),
  //   )
  //   expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')

  //   const outputFolder = join(cwd, 'dist')
  //   const files = await readdir(outputFolder)
  //   expect(files).toContain('index.html')
  // })

  // test('should error in unattended mode when prerelease versions are detected', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedIsInteractive.mockReturnValue(true)
  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [],
  //     unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
  //   })

  //   await expect(
  //     buildApp({
  //       ...buildOptions(cwd, output),
  //       unattendedMode: true,
  //     }),
  //   ).rejects.toThrow()

  //   expect(output.error).toHaveBeenCalledWith(expect.stringContaining('prerelease versions'), {
  //     exit: 1,
  //   })
  //   expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--no-auto-updates'), {
  //     exit: 1,
  //   })
  //   expect(mockedSelect).not.toHaveBeenCalled()
  // })

  // test('should exit when user selects "cancel" for prerelease prompt', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedIsInteractive.mockReturnValue(true)
  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [],
  //     unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
  //   })
  //   mockedSelect.mockResolvedValue('cancel')

  //   await expect(
  //     buildApp({
  //       ...buildOptions(cwd, output),
  //     }),
  //   ).rejects.toThrow()

  //   expect(output.error).toHaveBeenCalledWith(
  //     expect.stringContaining('Declined to continue with build'),
  //     {exit: 1},
  //   )
  // })

  // test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedIsInteractive.mockReturnValue(true)
  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [],
  //     unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
  //   })
  //   mockedSelect.mockResolvedValue('disable-auto-updates')

  //   await buildApp({
  //     ...buildOptions(cwd, output),
  //   })

  //   expect(output.warn).toHaveBeenCalledWith(
  //     expect.stringContaining('Auto-updates disabled for this build'),
  //   )
  //   expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')

  //   const outputFolder = join(cwd, 'dist')
  //   const files = await readdir(outputFolder)
  //   expect(files).toContain('index.html')
  // })

  // test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedIsInteractive.mockReturnValue(true)
  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk', remote: '1.1.0'}],
  //     unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
  //   })
  //   mockedSelect.mockResolvedValue('disable-auto-updates')

  //   await buildApp({
  //     ...buildOptions(cwd, output),
  //   })

  //   expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  //   // select should only be called once (for the prerelease prompt), not twice
  //   expect(mockedSelect).toHaveBeenCalledTimes(1)
  //   // confirm for version mismatch should not have been called
  //   expect(mockedConfirm).not.toHaveBeenCalledWith(
  //     expect.objectContaining({
  //       message: expect.stringContaining('different from the versions currently served'),
  //     }),
  //   )
  // })

  // test('should skip version diff prompt in unattended mode', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
  //     unresolvedPrerelease: [],
  //   })

  //   await buildApp({
  //     ...buildOptions(cwd, output),
  //     unattendedMode: true,
  //   })

  //   expect(mockedConfirm).not.toHaveBeenCalled()
  //   expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  // })

  // test('should skip version diff prompt in non-interactive mode and show warning', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedIsInteractive.mockReturnValue(false)
  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
  //     unresolvedPrerelease: [],
  //   })

  //   await buildApp({
  //     ...buildOptions(cwd, output),
  //   })

  //   expect(mockedConfirm).not.toHaveBeenCalled()
  //   expect(output.warn).toHaveBeenCalledWith(
  //     expect.stringContaining('@sanity/sdk-react (local version: 1.0.0, runtime version: 1.1.0)'),
  //   )
  //   expect(mockedSpinner).toHaveBeenCalledWith('Building Sanity application')
  // })

  // test('should error in non-interactive mode when prerelease versions are detected', async () => {
  //   const output = createMockOutput()

  //   const cwd = await testFixture('basic-app')
  //   process.chdir(cwd)

  //   mockedIsInteractive.mockReturnValue(false)
  //   mockedCompareDependencyVersions.mockResolvedValue({
  //     mismatched: [],
  //     unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
  //   })

  //   await expect(
  //     buildApp({
  //       ...buildOptions(cwd, output),
  //     }),
  //   ).rejects.toThrow()

  //   expect(output.error).toHaveBeenCalledWith(expect.stringContaining('prerelease versions'), {
  //     exit: 1,
  //   })
  //   expect(output.error).toHaveBeenCalledWith(expect.stringContaining('--no-auto-updates'), {
  //     exit: 1,
  //   })
  //   expect(mockedSelect).not.toHaveBeenCalled()
  // })
})
