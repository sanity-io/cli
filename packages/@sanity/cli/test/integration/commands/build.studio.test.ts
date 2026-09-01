import {readdir, readFile, writeFile} from 'node:fs/promises'
import {platform} from 'node:os'
import {join} from 'node:path'

import {testCommand, testFixture} from '@sanity/cli-test'
import {checkBuiltOutput} from '@sanity/workbench-cli/deploy'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BuildCommand} from '../../../src/commands/build.js'

const mockedSelect = vi.hoisted(() => vi.fn())
const mockedConfirm = vi.hoisted(() => vi.fn())
const mockedCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockedUpgradePackages = vi.hoisted(() => vi.fn())
const mockedIsInteractive = vi.hoisted(() => vi.fn())

vi.mock(import('@sanity/cli-build/_internal/build'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    compareDependencyVersions: mockedCompareDependencyVersions,
  }
})

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    isInteractive: mockedIsInteractive,
  }
})

vi.mock(import('@sanity/cli-core/ux'), async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    confirm: mockedConfirm,
    select: mockedSelect,
  }
})

vi.mock(import('../../../src/util/packageManager/upgradePackages.js'), () => ({
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

    // verify index.html contains `sanity-resource-bindings` script tag
    const indexHtml = await readFile(join(outputFolder, 'index.html'), 'utf8')
    expect(indexHtml).toContain(
      '<script type="application/json" id="sanity-resource-bindings">[]</script>',
    )

    // Federation artifacts should NOT be present when federation is not enabled
    expect(files).not.toContain('federation')
    expect(files).not.toContain('mf-manifest.json')
  })

  // Skipped on Windows: forcing `@module-federation/vite`'s plugins to run
  // in-process (via MFE_VITE_NO_TEST_ENV_CHECK) crashes the vitest worker there —
  // esbuild's service pipe dies with "Unexpected end of JSON input [plugin onEnd]".
  // It's a test-harness limitation (real `sanity build` runs as its own process);
  // the federation-artifact shape is platform-independent, so Linux coverage suffices.
  test.skipIf(platform() === 'win32')(
    'should build the "federated-studio" with standalone SPA and federation artifacts',
    async () => {
      const cwd = await testFixture('federated-studio')
      process.chdir(cwd)

      // `@module-federation/vite` short-circuits to an empty plugin array when
      // it detects vitest/jest in the env, which leaves the federation env without
      // its plugins and skips emitting the remote entry / `mf-manifest.json`.
      // Opt out of that guard for this in-process build.
      vi.stubEnv('MFE_VITE_NO_TEST_ENV_CHECK', 'true')

      const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {
        config: {root: cwd},
      })

      if (error) throw error
      expect(stderr).toContain('✔ Build Sanity Studio')

      const distFiles = await readdir(join(cwd, 'dist'))

      // A federated studio also serves itself standalone: the SPA `index.html`
      // is emitted alongside the federation output so the studio loads both on
      // its own and embedded in the workbench.
      expect(distFiles).toContain('index.html')
      expect((await readFile(join(cwd, 'dist', 'index.html'), 'utf8')).length).toBeGreaterThan(0)
      expect(distFiles).not.toContain('vendor')

      expect(distFiles).toContain('mf-manifest.json')
      const manifest = JSON.parse(await readFile(join(cwd, 'dist', 'mf-manifest.json'), 'utf8'))
      expect(manifest).toHaveProperty('id')
      expect(manifest).toHaveProperty('name')
      expect(manifest).toHaveProperty('metaData.remoteEntry.name')
      const remoteEntry = manifest.metaData.remoteEntry.name
      expect(remoteEntry).toMatch(/remoteEntry-[A-Za-z0-9_-]+\.js$/)
      expect((await readFile(join(cwd, 'dist', remoteEntry))).length).toBeGreaterThan(0)

      // Hashed chunks are emitted to the `static` dir (assetsDir), not the Vite
      // default `assets` — this keeps federation output aligned with the studio
      // static layout the deploy/serve tooling expects.
      expect(distFiles).toContain('static')

      // The build output must satisfy the deploy gate: `sanity deploy` runs
      // `checkBuiltOutput` (not the static-SPA check) and ships only if it finds
      // the federation manifest. Asserting it against the real dist here closes
      // the build→deploy seam that deploy.studio.test.ts can't — it mocks the
      // build away.
      await expect(checkBuiltOutput(join(cwd, 'dist'))).resolves.toBeUndefined()
      // And the gate actually gates — a directory without the federation manifest
      // is rejected, so the pass above isn't `checkBuiltOutput` silently no-opping.
      await expect(checkBuiltOutput(cwd)).rejects.toThrow(/mf-manifest|federation/i)
    },
  )

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
        `  reactCompiler: {compilationMode: 'all', target: '19', transform: 'oxc'},\n` +
        `})\n`,
      name: 'oxc react compiler config',
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
