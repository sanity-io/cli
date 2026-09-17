import {mkdir, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {testFixture} from '@sanity/cli-test'
import react from '@vitejs/plugin-react'
import {createLogger, type InlineConfig, normalizePath, type PluginOption} from 'vite'
import {afterAll, beforeAll, expect, test, vi} from 'vitest'

import {buildFederatedApp} from '../../../../../src/actions/build/vite/discover-shared-dependencies.js'
import {federation} from '../../../../../src/actions/build/vite/plugin.js'

type Manifest = {
  exposes: {name: string}[]
  shared: {name: string; requiredVersion: string; version: string}[]
}

const roots: string[] = []
const fixture = path.resolve(import.meta.dirname, '../../../../../../../../fixtures/federated-app')

beforeAll(() => {
  vi.stubEnv('MFE_VITE_NO_TEST_ENV_CHECK', 'true')
  vi.stubEnv('NODE_ENV', 'production')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.map((root) => rm(root, {force: true, recursive: true})))
})

async function buildApp({
  duplicateReact,
  headless = false,
  plugins = [],
  remoteOnlyExposes = false,
  reuseStandaloneBuild = false,
}: {
  duplicateReact?: 'federation' | 'lazy'
  headless?: boolean
  plugins?: PluginOption[]
  remoteOnlyExposes?: boolean
  reuseStandaloneBuild?: boolean
} = {}) {
  const root = await testFixture('federated-app', {useSystemTmp: true})
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
  if (remoteOnlyExposes) {
    await writeFile(
      path.join(root, 'App.tsx'),
      'export default function App() { return <div>Hello</div> }',
    )
  }
  await writeFile(
    path.join(root, 'View.tsx'),
    remoteOnlyExposes
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
    if (duplicateReact === 'lazy') {
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
  await writeFile(
    path.join(root, 'service.js'),
    "export default {run() {self.postMessage('remote-worker-only-marker')}}",
  )
  let federationAssets: string[] = []
  let standaloneModules: string[] = []
  let standaloneFiles: string[] = []
  const finalized = vi.fn()
  const rendered = vi.fn()
  const closed = vi.fn()
  const exposesView = headless || Boolean(duplicateReact) || remoteOnlyExposes
  const warn = vi.fn()
  const config: InlineConfig = {
    configFile: false,
    customLogger: {...createLogger('silent'), warn},
    logLevel: 'silent',
    plugins: [
      react(),
      federation({
        appEntry: headless ? undefined : '../../App.tsx',
        exposes: {
          views: exposesView
            ? [{name: 'tile', src: './View.tsx', surface: 'tile', title: 'Tile'}]
            : [],
          webWorkers: remoteOnlyExposes
            ? [{name: 'background', src: './service.js', type: 'worker'}]
            : [],
        },
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
        generateBundle(_options, bundle) {
          // Remote-only views belong to the federation build. Capture the standalone output
          // separately to verify their code, CSS, and workers stay out of it, while the app's
          // own code and styles remain in the final output.
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
          }
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
  const viewSource = exposesView
    ? await readFile(path.join(root, '.sanity/federation/views/tile/tile.js'), 'utf8')
    : undefined
  return {
    closed,
    federationAssets,
    finalized,
    manifest,
    rendered,
    standaloneModules,
    standaloneOutput: (
      await Promise.all(
        standaloneFiles.map((file) => readFile(path.join(root, 'dist', file), 'utf8')),
      )
    ).join('\n'),
    stats,
    viewSource,
    warn,
  }
}

async function packageVersion(directory: string): Promise<string> {
  const manifest: {version: string} = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8'),
  )
  return manifest.version
}

test.each([false, true])(
  'builds exact-version providers with standalone discovery: %s',
  async (reuseStandaloneBuild) => {
    const {closed, finalized, manifest, rendered, stats, warn} = await buildApp({
      reuseStandaloneBuild,
    })
    const reactVersion = await packageVersion(path.join(fixture, 'node_modules/react'))
    const reactDomVersion = await packageVersion(path.join(fixture, 'node_modules/react-dom'))
    const versions = {
      react: reactVersion,
      'react-dom': reactDomVersion,
      'react-dom/client': reactDomVersion,
      'react/jsx-runtime': reactVersion,
      'styled-components': await packageVersion(
        path.join(fixture, 'node_modules/styled-components'),
      ),
    }
    expect(Object.fromEntries(manifest.shared.map(({name, version}) => [name, version]))).toEqual(
      versions,
    )
    expect(
      Object.fromEntries(manifest.shared.map(({name, requiredVersion}) => [name, requiredVersion])),
    ).toEqual(versions)
    expect(stats.exposes).toEqual(manifest.exposes)
    expect(finalized).toHaveBeenCalledTimes(2)
    expect(rendered).toHaveBeenCalledTimes(2)
    expect(closed).toHaveBeenCalledTimes(reuseStandaloneBuild ? 2 : 3)
    expect(warn).not.toHaveBeenCalled()
  },
  60_000,
)

test.each([
  {find: /^@app\//, replacement: './', shares: true},
  {find: /^react\/jsx-runtime$/, replacement: 'node_modules/react/jsx-runtime.js', shares: false},
])(
  'shares only when alias $find leaves dependencies untouched',
  async ({find, replacement, shares}) => {
    const {manifest, warn} = await buildApp({
      plugins: [
        {
          config(config) {
            return {
              resolve: {
                alias: [
                  {
                    find,
                    replacement:
                      normalizePath(path.resolve(config.root!, replacement)) + (shares ? '/' : ''),
                  },
                ],
              },
            }
          },
          name: 'test/alias',
          transform(code, id) {
            if (shares && id.endsWith('/App.tsx')) return `import '@app/app.css';\n${code}`
          },
        },
      ],
    })
    if (shares) {
      expect(manifest.shared.map(({name}) => name)).toContain('react')
      expect(warn).not.toHaveBeenCalled()
    } else {
      expect(manifest.shared).toEqual([])
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        `Dependency sharing disabled: The Vite alias ${String(find)} may rewrite a shared dependency import. Dependencies will be bundled locally.`,
      )
    }
  },
  60_000,
)

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

test('discovers remote-only views and workers without adding them to the SPA', async () => {
  const {federationAssets, manifest, standaloneModules, standaloneOutput, viewSource} =
    await buildApp({
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
      remoteOnlyExposes: true,
      reuseStandaloneBuild: true,
    })
  expect(manifest.exposes.map(({name}) => name)).toContain('services/background')
  expect(federationAssets.join('')).toContain('remote-worker-only-marker')
  expect(standaloneOutput).not.toContain('remote-worker-only-marker')
  expect(federationAssets.join('')).toContain('remote-only-view')
  expect(manifest.shared.map(({name}) => name)).toContain('styled-components')
  expect(viewSource).toContain("import { StyleSheetManager } from 'styled-components'")
  expect(standaloneModules.some((id) => id.endsWith('/App.tsx'))).toBe(true)
  expect(standaloneOutput).toContain('Hello')
  expect(standaloneOutput).toContain('.standalone-app')
  expect(standaloneModules.some((id) => id.endsWith('/View.tsx'))).toBe(false)
  expect(standaloneOutput).not.toContain('remote-only-view')
  expect(standaloneModules.some((id) => id.includes('/styled-components/'))).toBe(false)
}, 60_000)

test.each(['lazy', 'federation'] as const)(
  'keeps dependencies local when a remote imports another React copy: %s',
  async (duplicateReact) => {
    const {manifest, warn} = await buildApp({duplicateReact, reuseStandaloneBuild: true})
    expect(manifest.shared).toEqual([])
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Dependency sharing disabled: Multiple installed copies of react were found. Dependencies will be bundled locally.',
    )
  },
  60_000,
)

test('builds a headless app with shared dependencies and only its view exposed', async () => {
  const {manifest, standaloneModules} = await buildApp({headless: true})
  expect(manifest.exposes.map(({name}) => name)).toEqual(['views/tile/tile'])
  expect(manifest.shared.map(({name}) => name)).toContain('react')
  expect(standaloneModules).toEqual([])
}, 60_000)
