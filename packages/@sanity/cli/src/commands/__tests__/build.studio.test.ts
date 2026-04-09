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
const mockedIsInteractive = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...original,
    isInteractive: mockedIsInteractive,
  }
})

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
    mockedIsInteractive.mockReturnValue(true)
    mockedConfirm.mockResolvedValue(true)
    mockedSelect.mockResolvedValue('upgrade-and-proceed')
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
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

    // Federation artifacts should NOT be present when federation is not enabled
    expect(files).not.toContain('federation')
    expect(files).not.toContain('mf-manifest.json')
  })

  test('should build the "federated-studio" with only federation artifacts', async () => {
    const cwd = await testFixture('federated-studio')
    process.chdir(cwd)

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    // 1. Build succeeds
    if (error) throw error
    expect(stderr).toContain('✔ Build Sanity Studio')

    const distFiles = await readdir(join(cwd, 'dist'))

    // 2. No client artifacts
    expect(distFiles).not.toContain('index.html')
    expect(distFiles).not.toContain('static')
    expect(distFiles).not.toContain('vendor')

    // 3. Stable remote entry (unhashed)
    expect(distFiles).toContain('remote-entry.js')

    // 4. Federation manifest (valid JSON)
    expect(distFiles).toContain('mf-manifest.json')
    const manifest = JSON.parse(await readFile(join(cwd, 'dist', 'mf-manifest.json'), 'utf8'))
    expect(manifest).toHaveProperty('id')
    expect(manifest).toHaveProperty('name')

    // 5. Hashed federation chunks
    expect(distFiles).toContain('assets')
    const assetFiles = await readdir(join(cwd, 'dist', 'assets'))
    expect(assetFiles.some((f) => /^remote-entry-.+\.js$/.test(f))).toBe(true)
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

  test('should not include non-prefixed env vars in build output', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    vi.stubEnv('SANITY_STUDIO_BUNDLE_VAR', 'studio-value')
    vi.stubEnv('NEXT_PUBLIC_LEAKED', 'next-value')
    vi.stubEnv('VITE_LEAKED', 'vite-value')

    const {error, stdout} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    if (error) throw error

    // Prefixed var should appear in the build output env var listing
    expect(stdout).toContain('SANITY_STUDIO_BUNDLE_VAR')
    // Non-prefixed vars must NOT appear
    expect(stdout).not.toContain('NEXT_PUBLIC_LEAKED')
    expect(stdout).not.toContain('VITE_LEAKED')
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
    await execAsync(`pnpm install --prefer-offline --config.minimum-release-age=0`, {
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

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('cancel')

    const {error} = await testCommand(BuildCommand, [])

    expect(error?.message).toContain('Declined to continue with build')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should upgrade packages when user selects "upgrade" only', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('upgrade')

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error

    expect(mockedUpgradePackages).toHaveBeenCalledWith(
      expect.objectContaining({
        packages: [['sanity', '3.1.0']],
      }),
      expect.any(Object),
    )
    expect(stderr).not.toContain('Build Sanity Studio')
  })

  test('should continue without upgrading when user selects "continue"', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
    mockedSelect.mockResolvedValue('continue')

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
    expect(stderr).toContain('Build Sanity Studio')

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
  })

  test('should upgrade and build when user selects "upgrade-and-proceed"', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })
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

  test('should error in unattended mode when prerelease versions are detected', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
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
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    mockedSelect.mockResolvedValue('cancel')

    const {error} = await testCommand(BuildCommand, [])

    expect(error?.message).toContain('Declined to continue with build')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should build without auto-updates when user selects "disable-auto-updates" for prerelease', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    mockedSelect.mockResolvedValue('disable-auto-updates')

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error
    expect(stderr).toContain('Auto-updates disabled for this build')
    expect(stderr).toContain('Build Sanity Studio')

    const outputFolder = join(cwd, 'dist')
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')

    // Should not have shown the version mismatch prompt
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should skip version mismatch prompt after disabling auto-updates for prerelease', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: '@sanity/vision', remote: '3.1.0'}],
      unresolvedPrerelease: [{pkg: 'sanity', version: '5.11.1-alpha.14'}],
    })
    // First select call is for prerelease prompt
    mockedSelect.mockResolvedValue('disable-auto-updates')

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error
    expect(stderr).toContain('Build Sanity Studio')
    // select should only be called once (for the prerelease prompt), not twice
    expect(mockedSelect).toHaveBeenCalledTimes(1)
    expect(mockedUpgradePackages).not.toHaveBeenCalled()
  })

  test('should skip version prompt in unattended mode and show warning', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    if (error) throw error
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(stderr).toContain('local version: 3.0.0, runtime version: 3.1.0')
    expect(stderr).toContain('Build Sanity Studio')
  })

  test('should skip version prompt in non-interactive mode and show warning', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    mockedIsInteractive.mockReturnValue(false)
    mockedCompareDependencyVersions.mockResolvedValue({
      mismatched: [{installed: '3.0.0', pkg: 'sanity', remote: '3.1.0'}],
      unresolvedPrerelease: [],
    })

    const {error, stderr} = await testCommand(BuildCommand, [])

    if (error) throw error
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(stderr).toContain('local version: 3.0.0, runtime version: 3.1.0')
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
