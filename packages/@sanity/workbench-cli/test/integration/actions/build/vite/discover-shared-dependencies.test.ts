import {mkdir, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {testFixture} from '@sanity/cli-test'
import react from '@vitejs/plugin-react'
import {createLogger, type InlineConfig, normalizePath, type PluginOption} from 'vite'
import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'

import {evaluateHostModule} from '../../../../../src/actions/build/vite/__tests__/federationHostTestHelpers.js'
import {buildFederatedApp} from '../../../../../src/actions/build/vite/discover-shared-dependencies.js'
import {federation} from '../../../../../src/actions/build/vite/plugin.js'
import {FEDERATION_HOST_ID} from '../../../../../src/actions/build/vite/plugins/plugin-federation-host.js'
import {type WorkbenchExposes} from '../../../../../src/resolveWorkbenchApp.js'

type Manifest = {
  exposes: {name: string}[]
  shared: {name: string; requiredVersion: string; version: string}[]
}

type App = Awaited<ReturnType<typeof createApp>>

// Reads the share scope each shared package registers into from Module Federation's emitted code.
function findShareScopes(chunks: string[]): Record<string, string> {
  const quoted = String.raw`["'\`]([^"'\`]+)["'\`]`
  const entry = new RegExp(
    String.raw`name:\s*${quoted},\s*version:\s*${quoted},\s*scope:\s*\[\s*${quoted}`,
    'g',
  )
  return Object.fromEntries(
    chunks.flatMap((code) => [...code.matchAll(entry)].map(([, name, , scope]) => [name, scope])),
  )
}

const fixture = path.resolve(
  import.meta.dirname,
  '../../../../../../../../fixtures/federated-studio',
)
const tileView: WorkbenchExposes = {
  views: [{name: 'tile', src: './View.tsx', surface: 'tile', title: 'Tile'}],
}
const roots: string[] = []
const SANITY_UI_VERSION = '4.99.0'

type Write = (file: string, contents: string) => Promise<void>

// A resolvable stand-in for @sanity/ui: subpath exports, a stylesheet (which the policy treats
// differently from module subpaths) and its styled-components peer.
async function writePackage(write: Write, directory: string, version: string) {
  const root = `${directory}/@sanity/ui`
  await write(
    `${root}/package.json`,
    JSON.stringify({
      exports: {'.': './index.js', './styles.css': './styles.css', './theme': './theme.js'},
      name: '@sanity/ui',
      peerDependencies: {'styled-components': '^6.1.0'},
      type: 'module',
      version,
    }),
  )
  await write(`${root}/index.js`, `export const Card = 'sanity-ui-card@${version}'`)
  await write(`${root}/theme.js`, "export const theme = 'sanity-ui-theme'")
  await write(`${root}/styles.css`, '.sanity-ui-styles {color: teal}')
}

beforeAll(() => {
  vi.stubEnv('MFE_VITE_NO_TEST_ENV_CHECK', 'true')
  vi.stubEnv('NODE_ENV', 'production')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.map((root) => rm(root, {force: true, recursive: true})))
})

async function createApp() {
  const root = await testFixture('federated-studio', {useSystemTmp: true})
  roots.push(root)
  await mkdir(path.join(root, 'node_modules'), {recursive: true})
  for (const dependency of ['react', 'react-dom', 'styled-components']) {
    const target = path.join(root, 'node_modules', dependency)
    await rm(target, {force: true, recursive: true})
    await symlink(
      await realpath(path.join(fixture, 'node_modules', dependency)),
      target,
      'junction',
    )
  }

  async function write(file: string, contents: string) {
    await mkdir(path.dirname(path.join(root, file)), {recursive: true})
    await writeFile(path.join(root, file), contents)
  }

  await writePackage(write, 'node_modules', SANITY_UI_VERSION)
  await write(
    'App.tsx',
    `import {Card} from '@sanity/ui'
import {theme} from '@sanity/ui/theme'
import '@sanity/ui/styles.css'
import styled from 'styled-components'
const Box = styled.div\`color: red;\`
export default function App() { return <Box>Hello {Card} {theme}</Box> }`,
  )
  await write('app.css', '.standalone-app {color: green}')
  await write(
    '.sanity/runtime/app.js',
    `import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import App from '../../App.tsx'
import '../../app.css'
createRoot(document.getElementById('root')).render(createElement(App))`,
  )

  async function build({
    appEntry = '../../App.tsx',
    exposes = {},
    plugins = [],
    reuseStandaloneBuild = false,
  }: {
    appEntry?: string | null
    exposes?: WorkbenchExposes
    plugins?: PluginOption[]
    reuseStandaloneBuild?: boolean
  } = {}) {
    let federationAssets: string[] = []
    const hostModules: Record<string, string> = {}
    let shareScopes: Record<string, string> = {}
    let standaloneModules: string[] = []
    let standaloneFiles: string[] = []
    const closed = vi.fn()
    const finalized = vi.fn()
    const rendered = vi.fn()
    const warn = vi.fn()
    const config: InlineConfig = {
      configFile: false,
      customLogger: {...createLogger('silent'), warn},
      logLevel: 'silent',
      plugins: [
        react(),
        federation({
          appEntry: appEntry ?? undefined,
          exposes,
          isApp: true,
          name: 'sharing-test',
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
          // Remote-only views belong to the federation build. Capture the standalone output
          // separately to verify their code, CSS, and workers stay out of it, while the app's
          // own code and styles remain in the final output.
          generateBundle(_options, bundle) {
            if (this.environment.name === 'client') {
              standaloneFiles = Object.keys(bundle)
              standaloneModules = Object.values(bundle).flatMap((chunk) =>
                chunk.type === 'chunk' ? Object.keys(chunk.modules) : [],
              )
            }
            if (this.environment.name === 'federation') {
              federationAssets = Object.values(bundle).flatMap((file) =>
                file.type === 'asset' ? [String(file.source)] : [],
              )
              shareScopes = findShareScopes(
                Object.values(bundle).flatMap((file) => (file.type === 'chunk' ? [file.code] : [])),
              )
            }
          },
          name: 'test/capture-chunks',
        },
        {
          name: 'test/capture-federation-host',
          transform(code, id) {
            if (id === `\0${FEDERATION_HOST_ID}`) hostModules[this.environment.name] = code
          },
        },
        ...plugins,
      ],
      root,
    }
    await buildFederatedApp(config, {reuseStandaloneBuild})
    return {
      federationAssets: federationAssets.join(''),
      hooks: {closed, finalized, rendered},
      hostModules,
      manifest: await readJson<Manifest>(path.join(root, 'dist/mf-manifest.json')),
      shareScopes,
      standaloneModules,
      standaloneOutput: (
        await Promise.all(
          standaloneFiles.map((file) => readFile(path.join(root, 'dist', file), 'utf8')),
        )
      ).join('\n'),
      stats: await readJson<Manifest>(path.join(root, 'dist/mf-stats.json')),
      viewSource: await readFile(
        path.join(root, '.sanity/federation/views/tile/tile.js'),
        'utf8',
      ).catch(() => undefined),
      warn,
    }
  }

  return {build, root, write}
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

async function fixtureVersion(name: string): Promise<string> {
  const manifest = await readJson<{version: string}>(
    path.join(fixture, 'node_modules', name, 'package.json'),
  )
  return manifest.version
}

async function writeSecondReactCopy(app: App) {
  await app.write(
    'other-react/package.json',
    JSON.stringify({name: 'react', version: await fixtureVersion('react')}),
  )
  await app.write('other-react/index.js', "export const marker = 'second React copy'")
}

describe.each([false, true])(
  'a build reusing the standalone output: %s',
  (reuseStandaloneBuild) => {
    let build: Awaited<ReturnType<App['build']>>

    beforeAll(async () => {
      const app = await createApp()
      build = await app.build({reuseStandaloneBuild})
    }, 60_000)

    test('publishes every provider at its exact installed version', async () => {
      const [react, reactDom, styled] = await Promise.all([
        fixtureVersion('react'),
        fixtureVersion('react-dom'),
        fixtureVersion('styled-components'),
      ])
      const versions = {
        // `@sanity/ui/styles.css` is absent: a stylesheet ships through the expose's CSS assets.
        '@sanity/ui': SANITY_UI_VERSION,
        '@sanity/ui/theme': SANITY_UI_VERSION,
        react,
        'react-dom': reactDom,
        'react-dom/client': reactDom,
        'react/jsx-runtime': react,
        'styled-components': styled,
      }

      expect(
        Object.fromEntries(build.manifest.shared.map(({name, version}) => [name, version])),
      ).toEqual(versions)
      expect(
        Object.fromEntries(
          build.manifest.shared.map(({name, requiredVersion}) => [name, requiredVersion]),
        ),
      ).toEqual(versions)
      expect(build.warn).not.toHaveBeenCalled()
    })

    test('writes the same exposes to the manifest and the stats', () => {
      expect(build.stats.exposes).toEqual(build.manifest.exposes)
    })

    // Pins that @module-federation/vite honors each entry's share scope rather than the container's first.
    test('registers @sanity/ui in a share scope pinned to the styled-components version', async () => {
      const {react, ...others} = build.shareScopes
      expect(others).toEqual({
        '@sanity/ui': `${react}-styled-components-${await fixtureVersion('styled-components')}`,
        '@sanity/ui/theme': `${react}-styled-components-${await fixtureVersion('styled-components')}`,
        'react-dom': react,
        'react-dom/client': react,
        'react/jsx-runtime': react,
        'styled-components': react,
      })
    })

    test('bundles the shared package stylesheet into the build', () => {
      expect(build.federationAssets).toContain('.sanity-ui-styles')
    })

    test('stops discovery before it renders chunks', () => {
      expect(build.hooks.finalized).toHaveBeenCalledTimes(2)
      expect(build.hooks.rendered).toHaveBeenCalledTimes(2)
      expect(build.hooks.closed).toHaveBeenCalledTimes(reuseStandaloneBuild ? 2 : 3)
    })
  },
)

test('shares dependencies when an alias cannot reach a shared package', async () => {
  const app = await createApp()
  await app.write(
    'App.tsx',
    `import '@app/app.css'
export default function App() { return <div>Hello</div> }`,
  )
  const {manifest, warn} = await app.build({
    plugins: [
      {
        config: (config) => ({
          resolve: {
            alias: [{find: /^@app\//, replacement: `${normalizePath(config.root!)}/`}],
          },
        }),
        name: 'test/alias',
      },
    ],
  })

  expect(manifest.shared.map(({name}) => name)).toContain('react')
  expect(warn).not.toHaveBeenCalled()
}, 60_000)

test('keeps dependencies local when an alias may rewrite a shared import', async () => {
  const app = await createApp()
  const {manifest, warn} = await app.build({
    plugins: [
      {
        config: (config) => ({
          resolve: {
            alias: [
              {
                find: /^react\/jsx-runtime$/,
                replacement: normalizePath(
                  path.join(config.root!, 'node_modules/react/jsx-runtime.js'),
                ),
              },
            ],
          },
        }),
        name: 'test/alias',
      },
    ],
  })

  expect(manifest.shared).toEqual([])
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    'Dependency sharing disabled: The Vite alias /^react\\/jsx-runtime$/ may rewrite a shared dependency import. Dependencies will be bundled locally.',
  )
}, 60_000)

test('propagates a resolveId failure during discovery', async () => {
  const app = await createApp()
  const fail = vi.fn().mockImplementationOnce(() => {
    throw new Error('Dependency discovery failed in a user plugin')
  })
  const rendered = vi.fn()

  await expect(
    app.build({
      plugins: [
        {
          applyToEnvironment: () => ({
            name: 'test/failing-hook',
            renderStart: rendered,
            resolveId: (source, importer) => {
              if (source === 'styled-components' && importer?.endsWith('/App.tsx')) fail()
            },
          }),
          enforce: 'pre',
          name: 'test/failing-environment',
        },
      ],
    }),
  ).rejects.toThrow('Dependency discovery failed in a user plugin')
  expect(fail).toHaveBeenCalled()
  expect(rendered).not.toHaveBeenCalled()
}, 60_000)

test('propagates a buildEnd failure instead of the signal that stops discovery', async () => {
  const app = await createApp()
  const fail = vi.fn().mockImplementationOnce(() => {
    throw new Error('Dependency discovery failed in a user plugin')
  })
  const rendered = vi.fn()

  await expect(
    app.build({
      plugins: [
        {
          applyToEnvironment: () => ({
            buildEnd: fail,
            name: 'test/failing-hook',
            renderStart: rendered,
          }),
          enforce: 'pre',
          name: 'test/failing-environment',
        },
      ],
    }),
  ).rejects.toThrow('Dependency discovery failed in a user plugin')
  expect(fail).toHaveBeenCalledTimes(1)
  expect(rendered).not.toHaveBeenCalled()
}, 60_000)

describe('an app whose view is only exposed to remotes', () => {
  let build: Awaited<ReturnType<App['build']>>

  beforeAll(async () => {
    const app = await createApp()
    await app.write('App.tsx', 'export default function App() { return <div>Hello</div> }')
    await app.write(
      'View.tsx',
      "import './view.css'; import styled from 'styled-components'; export default {components: styled.div`color: blue;`, version: '1.0'}",
    )
    await app.write('view.css', '.remote-only-view {color: fuchsia}')
    await app.write('service.js', "export default {run() {self.postMessage('worker-marker')}}")
    build = await app.build({
      exposes: {
        ...tileView,
        webWorkers: [{name: 'background', src: './service.js', type: 'worker'}],
      },
      plugins: [
        {
          name: 'test/remote-only-view',
          transform(_code, id) {
            if (id.endsWith('/View.tsx') && this.environment.name === 'client') {
              throw new Error('Remote-only views must not pass through the SPA build')
            }
          },
        },
      ],
      reuseStandaloneBuild: true,
    })
  }, 60_000)

  test('bundles the worker for remotes only', () => {
    expect(build.manifest.exposes.map(({name}) => name)).toContain('services/background')
    expect(build.federationAssets).toContain('worker-marker')
    expect(build.standaloneOutput).not.toContain('worker-marker')
  })

  test('keeps the remote-only view and its styles out of the SPA', () => {
    expect(build.federationAssets).toContain('remote-only-view')
    expect(build.standaloneModules.some((id) => id.endsWith('/View.tsx'))).toBe(false)
    expect(build.standaloneOutput).not.toContain('remote-only-view')
  })

  test('still bundles the app and its styles into the SPA', () => {
    expect(build.standaloneModules.some((id) => id.endsWith('/App.tsx'))).toBe(true)
    expect(build.standaloneOutput).toContain('Hello')
    expect(build.standaloneOutput).toContain('.standalone-app')
  })

  test('isolates styles because styled-components is shared', () => {
    expect(build.manifest.shared.map(({name}) => name)).toContain('styled-components')
    expect(build.standaloneModules.some((id) => id.includes('/styled-components/'))).toBe(false)
    expect(build.viewSource).toContain("from 'styled-components'")
  })
})

test('keeps dependencies local when a lazy import reaches a second React copy', async () => {
  const app = await createApp()
  await writeSecondReactCopy(app)
  await app.write(
    'View.tsx',
    "export default {components: () => {void import('./other-react/index.js'); return null}, version: '1.0'}",
  )
  const {manifest, warn} = await app.build({exposes: tileView})

  expect(manifest.shared).toEqual([])
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    'Dependency sharing disabled: Multiple installed copies of react were found. Dependencies will be bundled locally.',
  )
}, 60_000)

test('keeps dependencies local when only the federation build reaches a second React copy', async () => {
  const app = await createApp()
  await writeSecondReactCopy(app)
  await app.write(
    'View.tsx',
    "import App from './App.tsx'; export default {components: App, version: '1.0'}",
  )
  const {manifest, warn} = await app.build({
    exposes: tileView,
    plugins: [
      {
        name: 'test/federation-copy',
        transform(code, id) {
          if (this.environment.name === 'federation' && id.endsWith('/View.tsx')) {
            return `${code}\nimport './other-react/index.js'`
          }
        },
      },
    ],
  })

  expect(manifest.shared).toEqual([])
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    'Dependency sharing disabled: Multiple installed copies of react were found. Dependencies will be bundled locally.',
  )
}, 60_000)

test('shares React in an app without styled-components installed', async () => {
  const app = await createApp()
  await rm(path.join(app.root, 'node_modules/styled-components'), {force: true, recursive: true})
  await app.write('App.tsx', 'export default function App() { return <div>Hello</div> }')
  await app.write(
    'View.tsx',
    "import App from './App.tsx'; export default {components: App, version: '1.0'}",
  )
  const {manifest, viewSource, warn} = await app.build({exposes: tileView})

  expect(manifest.shared.map(({name}) => name).toSorted()).toEqual([
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
  ])
  expect(viewSource).not.toContain('styled-components')
  expect(warn).not.toHaveBeenCalled()
}, 60_000)

// The workbench shell loads federated apps from a standalone build, which never initializes
// a federation container of its own.
describe.each([false, true])(
  'a standalone host importing its shared dependencies, standalone build reused before discovery: %s',
  (reuseStandaloneBuild) => {
    let build: Awaited<ReturnType<App['build']>>

    beforeAll(async () => {
      const app = await createApp()
      await app.write(
        'App.tsx',
        `import {Card} from '@sanity/ui'
import styled from 'styled-components'
import {shared} from '${FEDERATION_HOST_ID}'
const Box = styled.div\`color: red;\`
globalThis.federationHost = shared
export default function App() { return <Box>{Card}</Box> }`,
      )
      build = await app.build({reuseStandaloneBuild})
    }, 60_000)

    test('hands its apps its own copies in the share scopes of its federation build', () => {
      const providers = Object.entries(evaluateHostModule(build.hostModules.client)).map(
        ([name, provider]) => [name, {shareScope: provider.scope[0], version: provider.version}],
      )
      const expected = build.manifest.shared.map(({name, version}) => [
        name,
        {shareScope: build.shareScopes[name], version},
      ])
      expect(Object.fromEntries(providers)).toEqual(Object.fromEntries(expected))
      // The React share scope and @sanity/ui's share scope pinned to styled-components
      expect(new Set(Object.values(build.shareScopes)).size).toBe(2)
      for (const shareScope of new Set(Object.values(build.shareScopes))) {
        expect(build.standaloneOutput).toContain(shareScope)
      }
    })

    test('leaves its federation build to share through the container', () => {
      expect(evaluateHostModule(build.hostModules.federation)).toEqual({})
    })
  },
)

test('shares dependencies in a headless app that exposes only its view', async () => {
  const app = await createApp()
  await app.write(
    'View.tsx',
    "import App from './App.tsx'; export default {components: App, version: '1.0'}",
  )
  const {manifest, standaloneModules} = await app.build({appEntry: null, exposes: tileView})

  expect(manifest.exposes.map(({name}) => name)).toEqual(['views/tile/tile'])
  expect(manifest.shared.map(({name}) => name)).toContain('react')
  expect(standaloneModules).toEqual([])
}, 60_000)

// `sanity` installs `ui5: npm:@sanity/ui@5` next to `@sanity/ui`; only package.json names mark the alias as the same package.
test('keeps @sanity/ui local when an alias installs a second copy', async () => {
  const app = await createApp()
  await writePackage(app.write, 'node_modules/ui5/node_modules', '5.0.0-alpha.10')
  await app.write(
    'node_modules/ui5/package.json',
    JSON.stringify({main: './index.js', name: 'ui5', type: 'module', version: '5.0.0-alpha.10'}),
  )
  await app.write('node_modules/ui5/index.js', "export {Card} from '@sanity/ui'")
  await app.write(
    'View.tsx',
    `import App from './App.tsx'
import {Card} from 'ui5'
export default {components: () => App({extra: Card}), version: '1.0'}`,
  )
  const {manifest, warn} = await app.build({exposes: tileView})

  expect(manifest.shared.map(({name}) => name).toSorted()).toEqual([
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'styled-components',
  ])
  expect(warn).not.toHaveBeenCalled()
}, 60_000)

// A fallback provider imports the bare specifier from a virtual module at the project root.
// Publishing one for a transitive copy either fails the Rolldown build, when the root cannot
// resolve the specifier at all, or serves a different version than the manifest advertises.
test.each([
  {rootVersion: undefined, scenario: 'cannot resolve the specifier'},
  {rootVersion: '5.0.0', scenario: 'resolves the specifier to another version'},
])(
  'builds without a provider when the project root $scenario',
  async ({rootVersion}) => {
    const app = await createApp()
    await rm(path.join(app.root, 'node_modules/@sanity/ui'), {force: true, recursive: true})
    if (rootVersion) await writePackage(app.write, 'node_modules', rootVersion)
    await writePackage(app.write, 'node_modules/vendor/node_modules', SANITY_UI_VERSION)
    await app.write(
      'node_modules/vendor/package.json',
      JSON.stringify({main: './index.js', name: 'vendor', type: 'module', version: '1.0.0'}),
    )
    await app.write('node_modules/vendor/index.js', "export {Card} from '@sanity/ui'")
    // A direct `@sanity/ui` import would put both copies in the graph and let the policy's
    // two-copies rule demote the package before the root-resolution check is reached.
    await app.write(
      'App.tsx',
      `import {Card} from 'vendor'
import styled from 'styled-components'
const Box = styled.div\`color: red;\`
export default function App() { return <Box>{Card}</Box> }`,
    )
    await app.write(
      'View.tsx',
      "import App from './App.tsx'; export default {components: App, version: '1.0'}",
    )
    const {manifest, warn} = await app.build({exposes: tileView})

    expect(manifest.shared.map(({name}) => name).toSorted()).toEqual([
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'styled-components',
    ])
    expect(warn).not.toHaveBeenCalled()
  },
  60_000,
)
