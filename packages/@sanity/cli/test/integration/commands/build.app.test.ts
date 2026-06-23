import {readdir, readFile, writeFile} from 'node:fs/promises'
import {platform} from 'node:os'
import {join} from 'node:path'

import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BuildCommand} from '../../../src/commands/build.js'

const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedSelect = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockedIsInteractive = vi.hoisted(() => vi.fn(() => true))

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...original,
    confirm: mockedConfirm,
    select: mockedSelect,
  }
})

vi.mock('../../../src/util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockedCompareDependencyVersions,
}))

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
    mockedCompareDependencyVersions.mockResolvedValue({mismatched: [], unresolvedPrerelease: []})
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
