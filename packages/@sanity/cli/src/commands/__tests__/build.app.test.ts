import {exec} from 'node:child_process'
import {readdir, readFile, rm, unlink, writeFile} from 'node:fs/promises'
import {platform, tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BuildCommand} from '../build.js'

const execAsync = promisify(exec)

const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedSelect = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...original,
    confirm: mockedConfirm,
    select: mockedSelect,
  }
})

vi.mock('../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

describe('#build app', {timeout: (platform() === 'win32' ? 120 : 60) * 1000}, () => {
  beforeEach(() => {
    mockedConfirm.mockResolvedValue(true)
    mockedSelect.mockResolvedValue('disable-auto-updates')
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('should build the "basic-app" example with auto-updates', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    const {error, stderr, stdout} = await testCommand(BuildCommand, ['--yes'])

    if (error) throw error
    expect(stdout).toContain('Building with auto-updates enabled')
    expect(stderr).toContain('Clean output folder')
    expect(stderr).toContain('Build Sanity application')

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
    expect(files).toContain('static')

    const indexHtml = await readFile(join(outputFolder, 'index.html'), 'utf8')
    expect(indexHtml).toContain('importmap')
  })

  test('should build with --source-maps and --stats flags and injects environment variables', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    vi.stubEnv('SANITY_APP_TEST_VAR', 'test-value')

    const {error, stderr, stdout} = await testCommand(BuildCommand, [
      '--yes',
      '--source-maps',
      '--stats',
    ])

    if (error) throw error
    const staticFiles = await readdir(join(cwd, 'dist', 'static'))
    expect(staticFiles.some((file) => file.endsWith('.map'))).toBe(true)
    expect(stdout).toContain('Largest module files:')
    expect(stderr).toContain('Build Sanity application')
    expect(stdout).toContain('SANITY_APP_TEST_VAR')
  })

  test('should error when @sanity/sdk-react is not installed', async () => {
    const cwd = await testFixture('basic-app', {
      tempDir: tmpdir(),
    })
    process.chdir(cwd)

    const packageJson = await readFile(join(cwd, 'package.json'), 'utf8')
    const packageJsonData = JSON.parse(packageJson)
    delete packageJsonData.dependencies['@sanity/sdk-react']
    await writeFile(join(cwd, 'package.json'), JSON.stringify(packageJsonData, null, 2))

    // Remove node_modules so the package can't be found
    await unlink(join(cwd, 'node_modules'))
    // Install from pnpm
    await execAsync(`pnpm install --prefer-offline --config.minimum-release-age=0`, {
      cwd,
    })

    try {
      const {error} = await testCommand(BuildCommand, ['--yes'])

      expect(error?.message).toContain('Failed to find installed @sanity/sdk-react version')
      expect(error?.oclif?.exit).toBe(1)
    } finally {
      await rm(join(cwd, 'node_modules'), {force: true, recursive: true}).catch(() => {})
    }
  })

  test('should handle build errors gracefully', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    // Corrupt the entry file to trigger a Vite build error
    await writeFile(join(cwd, 'src', 'App.tsx'), 'export %%% invalid syntax')

    const {error} = await testCommand(BuildCommand, ['--yes'])

    expect(error?.message).toContain('Failed to build Sanity application')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should prompt for directory cleanup with custom output dir and confirm', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    const customDir = 'custom-output'
    const {error, stderr} = await testCommand(BuildCommand, [customDir])

    if (error) throw error
    expect(mockedConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Do you want to delete the existing directory'),
      }),
    )
    expect(stderr).toContain('Clean output folder')

    const outputFolder = join(cwd, customDir)
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
  })

  test('should skip cleanup when user declines directory cleanup prompt', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedConfirm.mockResolvedValue(false)

    const customDir = 'custom-output'
    const {error, stderr} = await testCommand(BuildCommand, [customDir])

    if (error) throw error
    expect(stderr).not.toContain('Clean output folder')
    expect(stderr).toContain('Build Sanity application')
  })

  test('should exit when user declines version diff prompt', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedConfirm.mockResolvedValue(false)

    const {error} = await testCommand(BuildCommand, [])

    expect(error?.message).toContain('Declined to continue with build')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should continue build when user confirms version diff prompt', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedConfirm.mockResolvedValue(true)

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error
    expect(mockedConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('different from the versions currently served'),
      }),
    )
    expect(stderr).toContain('Build Sanity application')

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
  })

  test('should error in unattended mode when prerelease versions are detected', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })

    const {error} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    expect(error?.message).toContain('prerelease versions')
    expect(error?.message).toContain('--no-auto-updates')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockedSelect).not.toHaveBeenCalled()
  })

  test('should exit when user selects "cancel" for prerelease prompt', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })
    mockedSelect.mockResolvedValue('cancel')

    const {error} = await testCommand(BuildCommand, [])

    expect(error?.message).toContain('Declined to continue with build')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })
    mockedSelect.mockResolvedValue('disable-auto-updates')

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error
    expect(stderr).toContain('Auto-updates disabled for this build')
    expect(stderr).toContain('Build Sanity application')

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
  })

  test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk', remote: '1.1.0'}],
      unresolvedPrerelease: [{pkg: '@sanity/sdk-react', version: '1.0.0-alpha.1'}],
    })
    mockedSelect.mockResolvedValue('disable-auto-updates')

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error
    expect(stderr).toContain('Build Sanity application')
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
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'}],
      unresolvedPrerelease: [],
    })

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    if (error) throw error
    expect(mockedConfirm).not.toHaveBeenCalled()
    expect(stderr).toContain('Build Sanity application')
  })

  test.each([
    {
      config:
        `import {defineCliConfig} from 'sanity/cli'\n` +
        `export default defineCliConfig({\n` +
        `  app: {entry: './src/App.tsx', organizationId: 'org-id'},\n` +
        `  deployment: {appId: 'app-id', autoUpdates: true},\n` +
        `  reactCompiler: {compilationMode: 'all', target: '19'},\n` +
        `})\n`,
      name: 'react compiler config',
    },
    {
      config:
        `import {defineCliConfig} from 'sanity/cli'\n` +
        `export default defineCliConfig({\n` +
        `  app: {entry: './src/App.tsx', organizationId: 'org-id'},\n` +
        `  deployment: {appId: 'app-id', autoUpdates: true},\n` +
        `  vite: (config) => ({...config, define: {...config.define, 'import.meta.env.CUSTOM_VAR': JSON.stringify('custom-value')}}),\n` +
        `})\n`,
      name: 'custom vite config',
    },
  ])('should build with $name', async ({config}) => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    await writeFile(join(cwd, 'sanity.cli.ts'), config)

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'])

    if (error) throw error
    expect(stderr).toContain('Build Sanity application')

    const files = await readdir(join(cwd, 'dist'))
    expect(files).toContain('index.html')
  })
})
