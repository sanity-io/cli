import {cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import react from '@vitejs/plugin-react'
import {chromium} from 'playwright'
import {build, type InlineConfig, normalizePath, type PluginOption, preview} from 'vite'
import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'

import {buildFederatedApp} from '../../../../../src/actions/build/vite/discover-shared-dependencies.js'
import {federation} from '../../../../../src/actions/build/vite/plugin.js'

type Assets = {js: {async: string[]; sync: string[]}}
type Manifest = {
  exposes: {assets: Assets; name: string}[]
  metaData: {remoteEntry: {name: string}}
  shared: {assets: Assets; name: string; requiredVersion: string; version: string}[]
}
type Chunk = {fileName: string; imports: string[]}

const roots: string[] = []
const fixture = path.resolve(
  import.meta.dirname,
  '../../../../../../../../fixtures/federated-studio',
)

beforeAll(() => {
  vi.stubEnv('MFE_VITE_NO_TEST_ENV_CHECK', 'true')
  vi.stubEnv('NODE_ENV', 'production')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.map((root) => rm(root, {force: true, recursive: true})))
})

async function buildApp({
  aliasReact = false,
  duplicateReact = false,
  headless = false,
  name = 'sharing-test',
  plugins = [],
  reuseStandaloneBuild = false,
  styled = true,
  versionOverrides = {},
}: {
  aliasReact?: boolean
  duplicateReact?: 'federation' | boolean
  headless?: boolean
  name?: string
  plugins?: PluginOption[]
  reuseStandaloneBuild?: boolean
  styled?: 'view' | boolean
  versionOverrides?: Partial<Record<'scheduler' | 'styled-components', string>>
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sanity-sharing-'))
  roots.push(root)
  await mkdir(path.join(root, 'node_modules'))
  const reactDom = await realpath(path.join(fixture, 'node_modules/react-dom'))
  for (const dependency of ['react', 'react-dom', 'styled-components', 'scheduler'] as const) {
    const source = await realpath(
      dependency === 'scheduler'
        ? path.join(path.dirname(reactDom), 'scheduler')
        : path.join(fixture, 'node_modules', dependency),
    )
    const target = path.join(root, 'node_modules', dependency)
    const copy =
      (versionOverrides.scheduler && dependency !== 'styled-components') ||
      (dependency === 'styled-components' && versionOverrides['styled-components'])
    if (!copy) {
      await symlink(source, target, 'junction')
      continue
    }
    // Change only test-owned manifests; the real package code exercises federation's version selection.
    await cp(source, target, {recursive: true})
    const manifestPath = path.join(target, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        version:
          dependency === 'scheduler' || dependency === 'styled-components'
            ? (versionOverrides[dependency] ?? manifest.version)
            : manifest.version,
      }),
    )
    if (dependency === 'styled-components') {
      await symlink(path.dirname(source), path.join(target, 'node_modules'), 'junction')
    }
  }
  await writeFile(path.join(root, 'package.json'), JSON.stringify({name, type: 'module'}))
  await writeFile(
    path.join(root, 'App.tsx'),
    styled === true
      ? `import {useState} from 'react'
import styled, {createGlobalStyle} from 'styled-components'
const GlobalStyle = createGlobalStyle\`#\${props => props.id} {background-color: \${props => props.color};}\`
const Box = styled.button\`color: red;\`
export default function App({id = 'app', color = 'white'}) {
  const [count, setCount] = useState(0)
  return <><GlobalStyle id={id} color={color}/><Box onClick={() => setCount(count + 1)}>Hello {count}</Box></>
}`
      : `export default function App() { return <div>Hello</div> }`,
  )
  await writeFile(
    path.join(root, 'View.tsx'),
    styled === 'view'
      ? "import './view.css'; import styled from 'styled-components'; export default {components: styled.div`color: blue;`, version: '1.0'}"
      : "import App from './App.tsx'; export default {components: App, version: '1.0'}",
  )
  await writeFile(path.join(root, 'view.css'), '.remote-only-view {color: fuchsia}')
  if (duplicateReact) {
    await mkdir(path.join(root, 'other-react'))
    await writeFile(
      path.join(root, 'other-react/package.json'),
      JSON.stringify({
        name: 'react',
        version: await packageVersion(path.join(root, 'node_modules/react')),
      }),
    )
    await writeFile(
      path.join(root, 'other-react/index.js'),
      "export const marker = 'second React copy'",
    )
    if (duplicateReact === true) {
      await writeFile(
        path.join(root, 'View.tsx'),
        "export default {components: () => {void import('./other-react/index.js'); return null}, version: '1.0'}",
      )
    }
  }
  await mkdir(path.join(root, '.sanity/runtime'), {recursive: true})
  await writeFile(path.join(root, 'app.css'), '.standalone-app {color: green}')
  await writeFile(
    path.join(root, '.sanity/runtime/app.js'),
    `import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import App from '../../App.tsx'
import '../../app.css'
createRoot(document.getElementById('root')).render(createElement(App))`,
  )
  let chunks: Chunk[] = []
  let standaloneModules: string[] = []
  let standaloneCss: string[] = []
  let standaloneFiles: string[] = []
  const finalized = vi.fn()
  const rendered = vi.fn()
  const closed = vi.fn()
  const config: InlineConfig = {
    configFile: false,
    logLevel: 'silent',
    plugins: [
      react(),
      federation({
        appEntry: headless ? undefined : '../../App.tsx',
        exposes: {views: [{name: 'tile', src: './View.tsx', surface: 'tile', title: 'Tile'}]},
        isApp: true,
        name,
        workDir: root,
      }),
      {buildEnd: finalized, name: 'test/finalize'},
      {
        // Environment plugins are created after discovery strips the original output hooks.
        applyToEnvironment: () => ({
          closeBundle: closed,
          name: 'test/observe-output',
          renderStart: rendered,
        }),
        name: 'test/observe-environments',
      },
      {
        config: () =>
          aliasReact
            ? {
                resolve: {
                  alias: [
                    {
                      find: /^react$/,
                      replacement: path.join(fixture, 'node_modules/react/index.js'),
                    },
                  ],
                },
              }
            : {},
        generateBundle(_options, bundle) {
          // Discovery also loads views that only Workbench exposes. Capture the standalone
          // bundle separately so tests can verify those views and their CSS stay out of it,
          // while the app's own code and styles remain in the final output.
          if (this.environment.name === 'client') {
            standaloneFiles = Object.keys(bundle)
            standaloneCss = Object.values(bundle).flatMap((chunk) =>
              chunk.type === 'asset' && chunk.fileName.endsWith('.css')
                ? [String(chunk.source)]
                : [],
            )
            standaloneModules = Object.values(bundle).flatMap((chunk) =>
              chunk.type === 'chunk' ? Object.keys(chunk.modules) : [],
            )
          }
          chunks = Object.values(bundle).flatMap((chunk) =>
            chunk.type === 'chunk'
              ? [
                  {
                    fileName: chunk.fileName,
                    imports: chunk.imports,
                  },
                ]
              : [],
          )
        },
        name: 'test/capture-chunks',
      },
      ...(duplicateReact === 'federation'
        ? [
            {
              name: 'test/federation-copy',
              transform(code: string, id: string) {
                if (this.environment.name === 'federation' && id.endsWith('/View.tsx')) {
                  return `${code}\nimport './other-react/index.js'`
                }
              },
            },
          ]
        : []),
      ...plugins,
    ],
    root,
  }
  await buildFederatedApp(config, {reuseStandaloneBuild})
  const manifest: Manifest = JSON.parse(
    await readFile(path.join(root, 'dist/mf-manifest.json'), 'utf8'),
  )
  const stats: Manifest = JSON.parse(await readFile(path.join(root, 'dist/mf-stats.json'), 'utf8'))
  const appSource = await readFile(path.join(root, '.sanity/federation/remote-entry.jsx'), 'utf8')
  const viewSource = await readFile(
    path.join(root, '.sanity/federation/views/tile/tile.js'),
    'utf8',
  )
  return {
    appSource,
    chunks,
    closed,
    finalized,
    manifest,
    rendered,
    root,
    standaloneCss,
    standaloneModules,
    standaloneOutput: (
      await Promise.all(
        standaloneFiles.map((file) => readFile(path.join(root, 'dist', file), 'utf8')),
      )
    ).join('\n'),
    stats,
    viewSource,
  }
}

async function packageVersion(directory: string): Promise<string> {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as {
    version: string
  }
  return manifest.version
}

async function fixtureVersions() {
  const reactDom = await realpath(path.join(fixture, 'node_modules/react-dom'))
  return {
    react: await packageVersion(path.join(fixture, 'node_modules/react')),
    'react-dom': await packageVersion(reactDom),
    scheduler: await packageVersion(path.join(path.dirname(reactDom), 'scheduler')),
    'styled-components': await packageVersion(path.join(fixture, 'node_modules/styled-components')),
  }
}

function staticImports(chunks: Chunk[], entrypoints: string[]) {
  const reachable = new Set<string>()
  const pending = [...entrypoints]
  while (pending.length > 0) {
    const file = pending.pop()!
    if (reachable.has(file)) continue
    reachable.add(file)
    pending.push(...(chunks.find((chunk) => chunk.fileName === file)?.imports ?? []))
  }
  return reachable
}

describe.each([false, true])('standalone discovery: %s', (reuseStandaloneBuild) => {
  let result: Awaited<ReturnType<typeof buildApp>>
  let versions: Awaited<ReturnType<typeof fixtureVersions>>
  beforeAll(async () => {
    const [build, installedVersions] = await Promise.all([
      buildApp({reuseStandaloneBuild}),
      fixtureVersions(),
    ])
    result = build
    versions = installedVersions
  }, 60_000)

  test('allows a regex alias for app source without disabling sharing', async () => {
    const {manifest} = await buildApp({
      plugins: [
        {
          config(config) {
            return {
              resolve: {alias: [{find: /^@app\//, replacement: `${normalizePath(config.root!)}/`}]},
            }
          },
          name: 'test/source-alias',
          transform(code, id) {
            if (id.endsWith('/App.tsx')) return `import '@app/app.css';\n${code}`
          },
        },
      ],
      reuseStandaloneBuild,
    })
    expect(manifest.shared.map(({name}) => name)).toEqual(
      result.manifest.shared.map(({name}) => name),
    )
  }, 60_000)

  test.each([
    [/^react\/jsx-runtime$/, 'react/jsx-runtime.js'],
    [/^react-dom\/client$/, 'react-dom/client.js'],
    [/^styled-components$/, 'styled-components/dist/styled-components.browser.esm.js'],
  ] as const)(
    'keeps dependencies local when an alias intercepts %s',
    async (find, replacement) => {
      const {manifest} = await buildApp({
        plugins: [
          {
            config: () => ({
              resolve: {
                alias: [{find, replacement: path.join(fixture, 'node_modules', replacement)}],
              },
            }),
            name: 'test/shared-alias',
          },
        ],
        reuseStandaloneBuild,
      })
      expect(manifest.shared).toEqual([])
    },
    60_000,
  )

  test('shares only the approved imports with exact installed versions', () => {
    const {manifest} = result
    expect(manifest.shared.map(({name}) => name).toSorted()).toEqual([
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'styled-components',
    ])
    const expectedVersions = {
      react: versions.react,
      'react-dom': versions['react-dom'],
      'react-dom/client': versions['react-dom'],
      'react/jsx-runtime': versions.react,
      'styled-components': versions['styled-components'],
    }
    expect(
      Object.fromEntries(manifest.shared.map(({name, requiredVersion}) => [name, requiredVersion])),
    ).toEqual(expectedVersions)
    expect(Object.fromEntries(manifest.shared.map(({name, version}) => [name, version]))).toEqual(
      expectedVersions,
    )
  })

  test('defers provider code until the host selects a shared dependency', () => {
    const {chunks, manifest} = result
    const providers = new Set(
      manifest.shared.flatMap(({assets}) => [...assets.js.sync, ...assets.js.async]),
    )
    expect(providers.size).toBeGreaterThan(0)
    const reachable = staticImports(chunks, [
      manifest.metaData.remoteEntry.name,
      ...manifest.exposes.flatMap(({assets}) => assets.js.sync),
    ])
    expect([...providers].filter((fileName) => reachable.has(fileName))).toEqual([])
  })

  test('keeps fallback providers out of preload requests', () => {
    const {manifest} = result
    const fallbacks = new Set(
      manifest.shared.flatMap(({assets}) => [...assets.js.sync, ...assets.js.async]),
    )
    expect(fallbacks.size).toBeGreaterThan(0)
    expect(
      manifest.exposes
        .flatMap(({assets}) => assets.js.async)
        .filter((asset) => fallbacks.has(asset)),
    ).toEqual([])
  })

  test('isolates styles in both generated app and view entries', () => {
    expect(result.appSource).toContain("import { StyleSheetManager } from 'styled-components'")
    expect(result.viewSource).toContain("import { StyleSheetManager } from 'styled-components'")
  })

  test('writes the same expose assets to both manifest formats', () => {
    expect(result.stats.exposes).toEqual(result.manifest.exposes)
  })

  test('finalizes only the standalone and federation builds', () => {
    expect(result.finalized).toHaveBeenCalledTimes(2)
  })

  test('skips chunk generation during discovery and closes all builds', () => {
    expect(result.rendered).toHaveBeenCalledTimes(2)
    expect(result.closed).toHaveBeenCalledTimes(reuseStandaloneBuild ? 2 : 3)
  })
})

test.each(['resolveId', 'buildEnd'] as const)(
  'propagates a %s failure during discovery',
  async (hook) => {
    const fail = vi.fn().mockImplementationOnce(() => {
      throw new Error('Dependency discovery failed in a user plugin')
    })
    const rendered = vi.fn()
    await expect(
      buildApp({
        plugins: [
          {
            applyToEnvironment: () => ({
              buildEnd: hook === 'buildEnd' ? fail : undefined,
              name: 'test/failing-hook',
              renderStart: rendered,
              resolveId:
                hook === 'resolveId'
                  ? (source, importer) => {
                      if (source === 'styled-components' && importer?.endsWith('/App.tsx')) fail()
                    }
                  : undefined,
            }),
            enforce: 'pre',
            name: 'test/failing-environment',
          },
        ],
      }),
    ).rejects.toThrow('Dependency discovery failed in a user plugin')
    expect(fail).toHaveBeenCalled()
    expect(rendered).not.toHaveBeenCalled()
    if (hook === 'buildEnd') expect(fail).toHaveBeenCalledTimes(1)
  },
  60_000,
)

test('keeps dependencies local when a user plugin aliases React during configuration', async () => {
  const {manifest} = await buildApp({aliasReact: true})
  expect(manifest.shared).toEqual([])
}, 60_000)

test('shares React without adding an unused styled-components provider', async () => {
  const {appSource, manifest, viewSource} = await buildApp({styled: false})
  expect(manifest.shared.map(({name}) => name).toSorted()).toEqual([
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
  ])
  expect(appSource).not.toContain("import { StyleSheetManager } from 'styled-components'")
  expect(viewSource).not.toContain("import { StyleSheetManager } from 'styled-components'")
}, 60_000)

test('discovers styled-components used only by a remote view without adding the view to the SPA', async () => {
  const {manifest, standaloneCss, standaloneModules, standaloneOutput, viewSource} = await buildApp(
    {
      reuseStandaloneBuild: true,
      styled: 'view',
    },
  )
  expect(manifest.shared.map(({name}) => name)).toContain('styled-components')
  expect(viewSource).toContain("import { StyleSheetManager } from 'styled-components'")
  expect(standaloneModules.some((id) => id.endsWith('/App.tsx'))).toBe(true)
  expect(standaloneOutput).toContain('Hello')
  expect(standaloneOutput).toContain('.standalone-app')
  expect(standaloneModules.some((id) => id.endsWith('/View.tsx'))).toBe(false)
  expect(standaloneCss.join('')).not.toContain('remote-only-view')
  expect(standaloneModules.some((id) => id.includes('/styled-components/'))).toBe(false)
}, 60_000)

test.each([false, true])(
  'keeps a lazily imported second React copy local with standalone discovery: %s',
  async (reuseStandaloneBuild) => {
    const {manifest} = await buildApp({duplicateReact: true, reuseStandaloneBuild})
    expect(manifest.shared).toEqual([])
  },
  60_000,
)

test('builds a headless app with shared dependencies and only its view exposed', async () => {
  const {manifest, standaloneModules} = await buildApp({headless: true})
  expect(manifest.exposes.map(({name}) => name)).toEqual(['views/tile/tile'])
  expect(manifest.shared.map(({name}) => name)).toContain('react')
  expect(standaloneModules).toEqual([])
}, 60_000)

test('uses federation-specific resolution when scanning a custom Vite configuration', async () => {
  const {manifest} = await buildApp({duplicateReact: 'federation'})
  expect(manifest.shared).toEqual([])
}, 60_000)

test('reuses compatible providers in the browser while keeping app state and styles independent', async () => {
  const apps = [
    await buildApp({name: 'first', reuseStandaloneBuild: true}),
    await buildApp({name: 'second'}),
    await buildApp({name: 'without-styled', reuseStandaloneBuild: true, styled: false}),
    await buildApp({name: 'other-styled', versionOverrides: {'styled-components': '6.0.0'}}),
    await buildApp({
      name: 'other-scheduler',
      reuseStandaloneBuild: true,
      styled: false,
      versionOverrides: {scheduler: '0.0.1'},
    }),
  ]
  const servers: Awaited<ReturnType<typeof preview>>[] = []
  const browser = await chromium.launch()
  try {
    for (const {root} of apps) {
      servers.push(
        await preview({
          configFile: false,
          logLevel: 'silent',
          preview: {cors: true, host: '127.0.0.1', port: 0},
          root,
        }),
      )
    }
    const urls = servers.map((server) => server.resolvedUrls!.local[0])
    const remotes = ['first', 'second', 'without-styled', 'other-styled', 'other-scheduler'].map(
      (name, index) => ({
        entry: new URL('mf-manifest.json', urls[index]).href,
        name,
      }),
    )
    const hostEntry = path.join(apps[0].root, 'host.js')
    const runtime = normalizePath(fileURLToPath(import.meta.resolve('@module-federation/runtime')))
    await writeFile(
      hostEntry,
      `
import {createInstance} from ${JSON.stringify(runtime)}
const host = createInstance({name: 'sharing-host', shareStrategy: 'loaded-first', remotes: ${JSON.stringify(remotes)}})
const unmounts = new Map()
export async function mount(name, color) {
  const {render} = await host.loadRemote(name + '/App')
  const element = document.createElement('div')
  element.id = name
  document.body.appendChild(element)
  unmounts.set(name, render(element, {id: name, color}))
}
export function unmount(name) { unmounts.get(name)() }
export function preload(name) { return host.preloadRemote([{nameOrAlias: name, resourceCategory: 'all'}]) }
`,
    )
    await build({
      build: {
        emptyOutDir: false,
        lib: {entry: hostEntry, fileName: () => 'host.js', formats: ['es']},
        outDir: path.join(apps[0].root, 'dist'),
      },
      configFile: false,
      logLevel: 'silent',
    })
    await writeFile(
      path.join(apps[0].root, 'dist/index.html'),
      '<!doctype html><title>Sharing</title>',
    )
    const page = await browser.newPage()
    const errors: string[] = []
    const requests = new Set<string>()
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => requests.add(request.url()))
    const requestedProviders = (index: number, name?: string) =>
      apps[index].manifest.shared
        .filter((provider) => !name || provider.name === name)
        .flatMap(({assets}) => [...assets.js.sync, ...assets.js.async])
        .filter((asset) => requests.has(new URL(asset, urls[index]).href))
    await page.goto(urls[0])
    await page.evaluate("import('/host.js').then(host => host.mount('first', 'rgb(0, 128, 0)'))")
    await page.locator('#first button').waitFor()
    expect(requestedProviders(0).length).toBeGreaterThan(0)
    await page.evaluate("import('/host.js').then(host => host.preload('second'))")
    await expect
      .poll(() => requests.has(new URL(apps[1].manifest.metaData.remoteEntry.name, urls[1]).href))
      .toBe(true)
    expect(requestedProviders(1)).toEqual([])
    await page.evaluate("import('/host.js').then(host => host.mount('second', 'rgb(0, 0, 255)'))")
    await page.locator('#second button').waitFor()
    expect(requestedProviders(1)).toEqual([])
    await page.locator('#first button').click()
    await page.getByRole('button', {exact: true, name: 'Hello 1'}).waitFor()
    expect(await page.locator('#second button').textContent()).toBe('Hello 0')
    expect(
      await page.locator('#first').evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(0, 128, 0)')
    expect(
      await page.locator('#second').evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(0, 0, 255)')
    await page.evaluate("import('/host.js').then(host => host.unmount('first'))")
    await page.locator('#first button').waitFor({state: 'detached'})
    expect(
      await page.locator('#second').evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(0, 0, 255)')
    expect(await page.locator('#second button').evaluate((el) => getComputedStyle(el).color)).toBe(
      'rgb(255, 0, 0)',
    )
    await page.locator('#second button').click()
    await page.getByRole('button', {exact: true, name: 'Hello 1'}).waitFor()
    await page.evaluate("import('/host.js').then(host => host.mount('without-styled'))")
    await page.locator('#without-styled').getByText('Hello', {exact: true}).waitFor()
    expect(requestedProviders(2)).toEqual([])
    await page.evaluate(
      "import('/host.js').then(host => host.mount('other-styled', 'rgb(128, 0, 128)'))",
    )
    await page.locator('#other-styled button').waitFor()
    expect(requestedProviders(3, 'react')).toEqual([])
    expect(requestedProviders(3, 'react-dom/client')).toEqual([])
    expect(requestedProviders(3, 'styled-components').length).toBeGreaterThan(0)
    expect(
      await page.locator('#other-styled').evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(128, 0, 128)')
    await page.evaluate("import('/host.js').then(host => host.mount('other-scheduler'))")
    await page.locator('#other-scheduler').getByText('Hello', {exact: true}).waitFor()
    expect(requestedProviders(4, 'react').length).toBeGreaterThan(0)
    expect(requestedProviders(4, 'react-dom/client').length).toBeGreaterThan(0)
    expect(requestedProviders(1)).toEqual([])
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.httpServer.close((error) => (error ? reject(error) : resolve()))
          }),
      ),
    )
  }
}, 60_000)
