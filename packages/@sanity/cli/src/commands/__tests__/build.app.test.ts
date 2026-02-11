import {exec} from 'node:child_process'
import {readdir, readFile, unlink, writeFile} from 'node:fs/promises'
import {platform} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BuildCommand} from '../build.js'

const execAsync = promisify(exec)

const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...original,
    confirm: mockedConfirm,
  }
})

vi.mock('../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

describe('#build app', {timeout: (platform() === 'win32' ? 120 : 60) * 1000}, () => {
  beforeEach(() => {
    mockedConfirm.mockResolvedValue(true)
    mockedCompareDependencyVersions.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.SANITY_APP_TEST_VAR
  })

  test('should build the "basic-app" example with auto-updates', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    const {error, stderr, stdout} = await testCommand(BuildCommand, ['--yes'])

    expect(error).toBeUndefined()
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

  test.each([
    {
      assert: async (cwd: string) => {
        const staticFiles = await readdir(join(cwd, 'dist', 'static'))
        expect(staticFiles.some((file) => file.endsWith('.map'))).toBe(true)
      },
      flags: ['--yes', '--source-maps'],
      name: '--source-maps',
    },
    {
      assert: async (cwd: string) => {
        const files = await readdir(join(cwd, 'dist'))
        expect(files).toContain('index.html')
      },
      flags: ['--yes', '--no-minify'],
      name: '--no-minify',
    },
    {
      assert: async (_cwd: string, stdout: string) => {
        expect(stdout).toContain('Largest module files:')
      },
      flags: ['--yes', '--stats'],
      name: '--stats',
    },
  ])('should build with $name flag', async ({assert, flags}) => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    const {error, stderr, stdout} = await testCommand(BuildCommand, flags)

    expect(error).toBeUndefined()
    expect(stderr).toContain('Build Sanity application')
    await assert(cwd, stdout)
  })

  test('should include SANITY_APP_ environment variables in output', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    process.env.SANITY_APP_TEST_VAR = 'test-value'

    const {error, stdout} = await testCommand(BuildCommand, ['--yes'])

    expect(error).toBeUndefined()
    expect(stdout).toContain('SANITY_APP_TEST_VAR')
  })

  test('should build to a custom output directory', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    const customDir = 'custom-output'
    const {error, stderr} = await testCommand(BuildCommand, ['--yes', customDir])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Build Sanity application')

    const outputFolder = join(cwd, customDir)
    const files = await readdir(outputFolder)
    expect(files).toContain('index.html')
    expect(files).toContain('static')
  })

  test('should error when @sanity/sdk-react is not installed', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    const packageJson = await readFile(join(cwd, 'package.json'), 'utf8')
    const packageJsonData = JSON.parse(packageJson)
    delete packageJsonData.dependencies['@sanity/sdk-react']
    await writeFile(join(cwd, 'package.json'), JSON.stringify(packageJsonData, null, 2))

    await unlink(join(cwd, 'node_modules'))
    await execAsync(`pnpm install --prefer-offline --no-lockfile`, {
      cwd,
    })

    const {error} = await testCommand(BuildCommand, ['--yes'])

    expect(error?.message).toContain('Failed to find installed @sanity/sdk-react version')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle build errors gracefully', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    // Corrupt the entry file to trigger a Vite build error
    await writeFile(join(cwd, 'src', 'App.tsx'), 'export %%% invalid syntax')

    const {error} = await testCommand(BuildCommand, ['--yes'])

    expect(error?.message).toContain('Failed to build Sanity application')
  })

  test('should prompt for directory cleanup with custom output dir and confirm', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    const customDir = 'custom-output'
    const {error, stderr} = await testCommand(BuildCommand, [customDir])

    expect(error).toBeUndefined()
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

    expect(error).toBeUndefined()
    expect(stderr).not.toContain('Clean output folder')
    expect(stderr).toContain('Build Sanity application')
  })

  test('should exit when user declines version diff prompt', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue([
      {installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'},
    ])
    mockedConfirm.mockResolvedValue(false)

    const {error} = await testCommand(BuildCommand, [])

    expect(error).toBeDefined()
  })

  test('should continue build when user confirms version diff prompt', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue([
      {installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'},
    ])
    mockedConfirm.mockResolvedValue(true)

    const {error, stderr} = await testCommand(BuildCommand, [])

    expect(error).toBeUndefined()
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

  test('should skip version diff prompt in unattended mode', async () => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    mockedCompareDependencyVersions.mockResolvedValue([
      {installed: '1.0.0', pkg: '@sanity/sdk-react', remote: '1.1.0'},
    ])

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
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
    // TODO: Fix, See SDK-780
    // {
    //   config:
    //     `import {defineCliConfig} from 'sanity/cli'\n` +
    //     `export default defineCliConfig({\n` +
    //     `  app: {entry: './src/App.tsx', organizationId: 'org-id'},\n` +
    //     `  deployment: {appId: 'app-id', autoUpdates: true},\n` +
    //     `  vite: (config) => ({...config, define: {...config.define, 'import.meta.env.CUSTOM_VAR': JSON.stringify('custom-value')}}),\n` +
    //     `})\n`,
    //   name: 'custom vite config',
    // },
  ])('should build with $name', async ({config}) => {
    const cwd = await testFixture('basic-app')
    process.chdir(cwd)

    await writeFile(join(cwd, 'sanity.cli.ts'), config)

    const {error, stderr} = await testCommand(BuildCommand, ['--yes'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Build Sanity application')

    const files = await readdir(join(cwd, 'dist'))
    expect(files).toContain('index.html')
  })
})
