import {mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import react from '@vitejs/plugin-react'
import {createBuilder} from 'vite'
import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'

import {discoverSharedDependencies} from '../../../../../src/actions/build/vite/discover-shared-dependencies.js'
import {federation} from '../../../../../src/actions/build/vite/plugin.js'

type Assets = {js: {async: string[]; sync: string[]}}
type Manifest = {
  exposes: {assets: Assets}[]
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

async function buildApp({aliasReact = false, styled = true} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sanity-sharing-'))
  roots.push(root)
  await mkdir(path.join(root, 'node_modules'))
  for (const dependency of ['react', 'react-dom', 'styled-components']) {
    await symlink(
      await realpath(path.join(fixture, 'node_modules', dependency)),
      path.join(root, 'node_modules', dependency),
      'junction',
    )
  }
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({name: 'sharing-test', type: 'module'}),
  )
  await writeFile(
    path.join(root, 'App.tsx'),
    styled
      ? `import styled from 'styled-components'
const Box = styled.div\`color: red;\`
export default function App() { return <Box>Hello</Box> }`
      : `export default function App() { return <div>Hello</div> }`,
  )
  await writeFile(
    path.join(root, 'View.tsx'),
    "import App from './App.tsx'; export default {components: App, version: '1.0'}",
  )
  await mkdir(path.join(root, '.sanity/runtime'), {recursive: true})
  await writeFile(path.join(root, '.sanity/runtime/app.js'), "import '../../App.tsx'")
  let chunks: Chunk[] = []
  const finalized = vi.fn()
  const config = await discoverSharedDependencies({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      react(),
      federation({
        appEntry: '../../App.tsx',
        exposes: {views: [{name: 'tile', src: './View.tsx', surface: 'tile', title: 'Tile'}]},
        isApp: true,
        name: 'sharing-test',
        workDir: root,
      }),
      {buildEnd: finalized, name: 'test/finalize'},
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
    ],
    root,
  })
  const builder = await createBuilder(config)
  await builder.buildApp()
  const manifest: Manifest = JSON.parse(
    await readFile(path.join(root, 'dist/mf-manifest.json'), 'utf8'),
  )
  const stats: Manifest = JSON.parse(await readFile(path.join(root, 'dist/mf-stats.json'), 'utf8'))
  const appSource = await readFile(path.join(root, '.sanity/federation/remote-entry.jsx'), 'utf8')
  const viewSource = await readFile(
    path.join(root, '.sanity/federation/views/tile/tile.js'),
    'utf8',
  )
  return {appSource, chunks, finalized, manifest, stats, viewSource}
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

describe('a production app using React and styled-components', () => {
  let result: Awaited<ReturnType<typeof buildApp>>
  let versions: Awaited<ReturnType<typeof fixtureVersions>>
  beforeAll(async () => {
    const [build, installedVersions] = await Promise.all([buildApp(), fixtureVersions()])
    result = build
    versions = installedVersions
  }, 60_000)

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
})

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
