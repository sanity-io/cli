import {readdir, readFile, writeFile} from 'node:fs/promises'
import {platform} from 'node:os'
import {join, relative, sep} from 'node:path'

import {testCommand, testFixture} from '@sanity/cli-test'
import {readBuiltManifest} from '@sanity/workbench-cli/build'
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
    await expectAutoUpdatingPage(outputFolder)

    // The resource-bindings module is emitted only for Blueprints builds (via
    // `@sanity/runtime-cli`), so a plain `sanity build` never produces it.
    expect(files).not.toContain('sanity-resource-bindings.js')

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
    'builds the "federated-studio" with auto-updates on the standalone page and the Workbench remote',
    async () => {
      const cwd = await testFixture('federated-studio')
      process.chdir(cwd)

      // `@module-federation/vite` short-circuits to an empty plugin array when
      // it detects vitest/jest in the env, which leaves the federation env without
      // its plugins and skips emitting the remote entry / `mf-manifest.json`.
      // Opt out of that guard for this in-process build.
      vi.stubEnv('MFE_VITE_NO_TEST_ENV_CHECK', 'true')

      const {error, stderr, stdout} = await testCommand(BuildCommand, ['--yes', '--source-maps'], {
        config: {root: cwd},
      })

      if (error) throw error
      expect(stdout).toContain('Building with auto-updates enabled')
      expect(stderr).toContain('✔ Build Sanity Studio')

      const distFiles = await readdir(join(cwd, 'dist'))

      // A federated studio also serves itself standalone: the SPA `index.html`
      // is emitted alongside the federation output so the studio loads both on
      // its own and embedded in the workbench.
      expect(distFiles).toContain('index.html')
      await expectAutoUpdatingPage(join(cwd, 'dist'))

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

      // The resource-bindings module is emitted only for Blueprints builds (via
      // `@sanity/runtime-cli`), so a plain federated `sanity build` omits it.
      expect(distFiles).not.toContain('sanity-resource-bindings.js')

      // Inside Workbench, the remote loads `sanity` from the module server as this app.
      const sources = await Promise.all(
        (await readdir(join(cwd, 'dist'), {recursive: true}))
          .filter((file) => file.endsWith('.map'))
          .map(
            async (file) =>
              JSON.parse(await readFile(join(cwd, 'dist', file), 'utf8')).sources as string[],
          ),
      )
      expect(sources.flat()).toContainEqual(expect.stringContaining('/node_modules/react/'))
      expect(sources.flat()).not.toContainEqual(expect.stringContaining('/node_modules/sanity/'))

      const appChunks = manifest.exposes.find(({name}: {name: string}) => name === 'App').assets.js
        .sync
      const appCode = (
        await Promise.all(
          appChunks.map((file: string) => readFile(join(cwd, 'dist', file), 'utf8')),
        )
      ).join('\n')
      const appId = await readFile(join(cwd, 'dist', 'sanity-app-id.txt'), 'utf8')
      expect(appId).not.toBe('')
      expect(appCode).toContain(appId)
      expect(appCode).toContain('/v1/modules/')

      // The build output must satisfy the deploy gate: `sanity deploy` runs
      // `readBuiltManifest` (not the static-SPA check) and ships only if it finds
      // the federation manifest. Asserting it against the real dist here closes
      // the build→deploy seam that deploy.studio.test.ts can't — it mocks the
      // build away.
      await expect(readBuiltManifest(join(cwd, 'dist'))).resolves.toEqual(manifest)
      // And the gate actually gates — a directory without the federation manifest
      // is rejected, so the pass above isn't `readBuiltManifest` silently no-opping.
      await expect(readBuiltManifest(cwd)).rejects.toThrow(/mf-manifest|federation/i)
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

  test('links code-split stylesheets by default', {timeout: 120_000}, async () => {
    const cwd = await studioWithLocalCss()
    const hrefs = await buildAndReadStylesheets(cwd)

    expect(hrefs.some((href) => /\/static\/sanity-[^/"']+\.css$/.test(href))).toBe(true)
    expect(hrefs.some((href) => /\/style-[^/"']+\.css$/.test(href))).toBe(false)
    await expectLinkedCssFiles(cwd, hrefs)
  })

  test('links the combined stylesheet when cssCodeSplit is false', {timeout: 120_000}, async () => {
    const cwd = await studioWithLocalCss()
    await writeFile(
      join(cwd, 'sanity.cli.ts'),
      `import {defineCliConfig} from 'sanity/cli'\n` +
        `export default defineCliConfig({\n` +
        `  api: {projectId: 'ppsg7ml5', dataset: 'test'},\n` +
        `  deployment: {autoUpdates: true},\n` +
        `  vite: {build: {cssCodeSplit: false}},\n` +
        `})\n`,
    )

    const hrefs = await buildAndReadStylesheets(cwd)
    const cssFiles = await distCssFiles(cwd)

    // Vite emits one combined asset (style-<hash>.css, under assetsDir) and
    // does not attach it to importedCss. The document has to link it.
    expect(cssFiles).toHaveLength(1)
    expect(cssFiles[0]?.replaceAll('\\', '/')).toMatch(/style-[^/]+\.css$/)
    expect(hrefs).toEqual([expect.stringMatching(/style-[^/"']+\.css$/)])
    await expectLinkedCssFiles(cwd, hrefs)
  })
})

const CSS_MARKER = 'sanity-css-code-split-marker'

async function expectAutoUpdatingPage(dist: string) {
  const html = await readFile(join(dist, 'index.html'), 'utf8')
  const {imports} = JSON.parse(
    html.match(/<script type="application\/json" id="__imports">([^<]*)<\/script>/)?.[1] ?? '{}',
  )
  expect(imports.sanity).toContain('/v1/modules/')
  await expect(readFile(join(dist, imports.react), 'utf8')).resolves.not.toBe('')
  const entry = html.match(/<script src="(\/static\/sanity-[^"]+\.js)" type="module">/)?.[1]
  expect(entry).toBeDefined()
  expect(await readFile(join(dist, entry!), 'utf8')).toMatch(/from\s*["'`]sanity["'`]/)
}

async function studioWithLocalCss(): Promise<string> {
  const cwd = await testFixture('basic-studio')
  process.chdir(cwd)
  await writeFile(join(cwd, 'studio.css'), `.${CSS_MARKER} { color: #123456; }\n`)
  const configPath = join(cwd, 'sanity.config.ts')
  const source = await readFile(configPath, 'utf8')
  await writeFile(configPath, `import './studio.css'\n${source}`)
  return cwd
}

async function buildAndReadStylesheets(cwd: string): Promise<string[]> {
  const {error, stderr} = await testCommand(BuildCommand, ['--yes'], {config: {root: cwd}})
  if (error) throw error
  expect(stderr).toContain('Build Sanity Studio')
  const html = await readFile(join(cwd, 'dist', 'index.html'), 'utf8')
  return localStylesheetHrefs(html)
}

function localStylesheetHrefs(html: string): string[] {
  const hrefs: string[] = []
  for (const tag of html.match(/<link\b[^>]*>/g) ?? []) {
    if (!/\brel="stylesheet"/.test(tag)) continue
    const href = /href="([^"]+)"/.exec(tag)?.[1]
    if (!href || href.startsWith('http:') || href.startsWith('https:')) continue
    hrefs.push(href)
  }
  return hrefs
}

async function expectLinkedCssFiles(cwd: string, hrefs: string[]): Promise<void> {
  expect(hrefs.length).toBeGreaterThan(0)
  const cssFiles = await distCssFiles(cwd)
  expect(cssFiles.length).toBeGreaterThan(0)

  let linkedMarker = false
  for (const href of hrefs) {
    const relativeHref = href.replace(/^\//, '')
    expect(cssFiles.some((file) => file.replaceAll('\\', '/') === relativeHref)).toBe(true)
    const css = await readFile(join(cwd, 'dist', relativeHref), 'utf8')
    if (css.includes(CSS_MARKER)) linkedMarker = true
  }
  expect(linkedMarker).toBe(true)

  for (const file of cssFiles) {
    const posix = file.replaceAll('\\', '/')
    expect(hrefs.some((href) => href.replace(/^\//, '') === posix)).toBe(true)
  }
}

async function distCssFiles(cwd: string): Promise<string[]> {
  return (await walkFiles(join(cwd, 'dist')))
    .filter((file) => file.endsWith('.css'))
    .map((file) => relative(join(cwd, 'dist'), file).split(sep).join('/'))
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {withFileTypes: true})
  const files = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name)
      return entry.isDirectory() ? walkFiles(full) : [full]
    }),
  )
  return files.flat()
}
