import {exec} from 'node:child_process'
import {readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {platform, tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BuildCommand} from '../build.js'

const execAsync = promisify(exec)

const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedSelect = vi.hoisted(() => vi.fn())
const mockedIsInteractive = vi.hoisted(() => vi.fn(() => true))

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...original,
    confirm: mockedConfirm,
    select: mockedSelect,
  }
})

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...original,
    isInteractive: mockedIsInteractive,
  }
})

describe('#build app', {timeout: (platform() === 'win32' ? 120 : 60) * 1000}, () => {
  beforeEach(() => {
    mockedConfirm.mockResolvedValue(true)
    mockedSelect.mockResolvedValue('disable-auto-updates')
    mockedIsInteractive.mockReturnValue(true)
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

  test('should not include non-prefixed env vars in build output', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    vi.stubEnv('SANITY_APP_BUNDLE_VAR', 'app-value')
    vi.stubEnv('NEXT_PUBLIC_LEAKED', 'next-value')
    vi.stubEnv('VITE_LEAKED', 'vite-value')

    const {error, stdout} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    if (error) throw error

    // Prefixed var should appear in the build output env var listing
    expect(stdout).toContain('SANITY_APP_BUNDLE_VAR')
    // Non-prefixed vars must NOT appear
    expect(stdout).not.toContain('NEXT_PUBLIC_LEAKED')
    expect(stdout).not.toContain('VITE_LEAKED')
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
    await rm(join(cwd, 'node_modules'), {force: true, recursive: true})
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
