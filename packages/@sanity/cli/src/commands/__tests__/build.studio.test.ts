import {exec} from 'node:child_process'
import {readdir, readFile, rm, unlink, writeFile} from 'node:fs/promises'
import {platform, tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BuildCommand} from '../build.js'

const execAsync = promisify(exec)

const mockedSelect = vi.hoisted(() => vi.fn())
const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockedUpgradePackages = vi.hoisted(() => vi.fn())

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

vi.mock('../../util/packageManager/upgradePackages.js', () => ({
  upgradePackages: mockedUpgradePackages,
}))

describe('#build studio', {timeout: (platform() === 'win32' ? 120 : 60) * 1000}, () => {
  beforeEach(() => {
    mockedConfirm.mockResolvedValue(true)
    mockedSelect.mockResolvedValue('upgrade-and-proceed')
    mockedCompareDependencyVersions.mockResolvedValue([])
    mockedUpgradePackages.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(BuildCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test('should build the "basic-studio" example with auto-updates', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {error, stderr, stdout} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    if (error) throw error
    expect(stdout).toContain(`Building with auto-updates enabled`)
    expect(stderr).toContain('✔ Clean output folder')
    expect(stderr).toContain(`✔ Build Sanity Studio`)

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
    expect(files).toContain('static')
  })

  test("should build the 'worst-case-studio' example", async () => {
    const cwd = await testFixture('worst-case-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'])

    if (error) throw error
    expect(stderr).toContain('Clean output folder')
    expect(stderr).toContain(`Build Sanity Studio`)

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
    expect(files).toContain('static')
  })

  test('should build with --source-maps and --stats flags and injects environment variables', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    vi.stubEnv('SANITY_STUDIO_TEST_VAR', 'test-value')

    const {error, stderr, stdout} = await testCommand(BuildCommand, [
      '--yes',
      '--source-maps',
      '--stats',
    ])

    if (error) throw error
    const staticFiles = await readdir(join(cwd, 'dist', 'static'))
    expect(staticFiles.some((file) => file.endsWith('.map'))).toBe(true)
    expect(stdout).toContain('Largest module files:')
    expect(stderr).toContain('Build Sanity Studio')
    expect(stdout).toContain('SANITY_STUDIO_TEST_VAR')
  })

  test('should error when styled-components is not installed', async () => {
    const cwd = await testFixture('basic-studio', {
      tempDir: tmpdir(),
    })
    process.chdir(cwd)

    const packageJson = await readFile(join(cwd, 'package.json'), 'utf8')
    const packageJsonData = JSON.parse(packageJson)
    delete packageJsonData.dependencies['styled-components']
    await writeFile(join(cwd, 'package.json'), JSON.stringify(packageJsonData, null, 2))

    // Remove node_modules so the package can't be found
    await unlink(join(cwd, 'node_modules'))
    // Install from pnpm without updating the lockfile
    await execAsync(`pnpm install --prefer-offline`, {
      cwd,
    })

    try {
      const {error} = await testCommand(BuildCommand, ['--yes'])

      expect(error?.message).toContain('styled-components')
      expect(error?.oclif?.exit).toBe(1)
    } finally {
      await rm(join(cwd, 'node_modules'), {force: true, recursive: true}).catch(() => {})
    }
  })

  test('should handle build errors gracefully', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    // Corrupt the config file to trigger a build error
    await writeFile(join(cwd, 'sanity.config.ts'), 'export %%% invalid syntax')

    const {error} = await testCommand(BuildCommand, ['--yes'])

    expect(error?.message).toContain('Failed to build Sanity Studio')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should prompt for directory cleanup with custom output dir and confirm', async () => {
    const cwd = await testFixture('basic-studio')
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
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedConfirm.mockResolvedValue(false)

    const customDir = 'custom-output'
    const {error, stderr} = await testCommand(BuildCommand, [customDir])

    if (error) throw error
    expect(stderr).not.toContain('Clean output folder')
    expect(stderr).toContain('Build Sanity Studio')
  })

  test('should exit when user selects "cancel" for version diff', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue([
      {installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'},
    ])
    mockedSelect.mockResolvedValue('cancel')

    const {error} = await testCommand(BuildCommand, [])

    expect(error?.message).toContain('Declined to continue with build')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should upgrade packages when user selects "upgrade" only', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue([
      {installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'},
    ])
    mockedSelect.mockResolvedValue('upgrade')

    const {error} = await testCommand(BuildCommand, [])

    expect(error?.message).toContain('Declined to continue with build')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
      expect.any(Object),
    )
  })

  test('should upgrade and build when user selects "upgrade-and-proceed"', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue([
      {installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'},
    ])
    mockedSelect.mockResolvedValue('upgrade-and-proceed')

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error
    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
      expect.any(Object),
    )
    expect(stderr).toContain('Build Sanity Studio')

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
  })

  test('should skip version prompt in unattended mode', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue([
      {installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'},
    ])

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    if (error) throw error
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(stderr).toContain('Build Sanity Studio')
  })

  test.each([
    {
      config:
        `import {defineCliConfig} from 'sanity/cli'\n` +
        `export default defineCliConfig({\n` +
        `  api: {projectId: 'test', dataset: 'production'},\n` +
        `  autoUpdates: true,\n` +
        `  reactCompiler: {compilationMode: 'all', target: '19'},\n` +
        `})\n`,
      name: 'react compiler config',
    },
    {
      config:
        `import {defineCliConfig} from 'sanity/cli'\n` +
        `export default defineCliConfig({\n` +
        `  api: {projectId: 'test', dataset: 'production'},\n` +
        `  autoUpdates: true,\n` +
        `  vite: (config) => ({...config, define: {...config.define, 'import.meta.env.CUSTOM': JSON.stringify('value')}}),\n` +
        `})\n`,
      name: 'custom vite config',
    },
  ])('should build with $name', async ({config}) => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    await writeFile(join(cwd, 'sanity.cli.ts'), config)

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'])

    if (error) throw error
    expect(stderr).toContain('Build Sanity Studio')

    const files = await readdir(join(cwd, 'dist'))
    expect(files).toContain('index.html')
  })
})
