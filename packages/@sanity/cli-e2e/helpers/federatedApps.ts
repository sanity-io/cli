import {cp, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

import {testFixture} from '@sanity/cli-test'
import {build, normalizePath, preview} from 'vite'

import {runCli} from './runCli.js'

type Manifest = {
  shared: {assets: {js: {async: string[]; sync: string[]}}; name: string}[]
}

export type BuiltApp = Awaited<ReturnType<typeof buildApp>>

export async function buildApp(
  name: string,
  {
    customConfig = false,
    styled = true,
    versionOverrides = {},
  }: {
    customConfig?: boolean
    styled?: boolean
    versionOverrides?: Partial<Record<'scheduler' | 'styled-components', string>>
  } = {},
) {
  const root = await testFixture('federated-app')
  const configPath = path.join(root, 'sanity.cli.ts')
  let config = (await readFile(configPath, 'utf8')).replace(
    "slug: 'federated-app'",
    `slug: '${name}'`,
  )
  if (customConfig) config = config.replace('deployment:', 'vite: (config) => config, deployment:')
  await writeFile(configPath, config)
  if (!styled) {
    await writeFile(
      path.join(root, 'App.tsx'),
      'export default function App() { return <div>Hello</div> }',
    )
  }

  await overrideDependencyVersions(root, versionOverrides)

  const {error} = await runCli({
    args: ['build', '--yes'],
    cwd: root,
    // Module Federation otherwise disables itself because the CLI inherits VITEST.
    env: {MFE_VITE_NO_TEST_ENV_CHECK: 'true'},
  })
  if (error) throw error
  const manifest: Manifest = JSON.parse(
    await readFile(path.join(root, 'dist/mf-manifest.json'), 'utf8'),
  )
  const server = await preview({
    configFile: false,
    logLevel: 'silent',
    preview: {cors: true, host: '127.0.0.1', port: 0},
    root,
  })
  return {
    close: promisify(server.httpServer.close.bind(server.httpServer)),
    manifest,
    name,
    root,
    url: server.resolvedUrls!.local[0],
  }
}

async function overrideDependencyVersions(
  root: string,
  versionOverrides: Partial<Record<'scheduler' | 'styled-components', string>>,
) {
  // Copy symlinked fixtures before changing versions; this tests selection with unchanged package code.
  // Copy the React group together so React DOM resolves the overridden scheduler.
  const dependencies = versionOverrides.scheduler
    ? ['react', 'react-dom', 'scheduler']
    : versionOverrides['styled-components']
      ? ['styled-components']
      : []
  const reactDom = await realpath(path.join(root, 'node_modules/react-dom'))
  for (const name of dependencies) {
    const source = await realpath(
      name === 'scheduler'
        ? path.join(path.dirname(reactDom), 'scheduler')
        : path.join(root, 'node_modules', name),
    )
    const target = path.join(root, 'node_modules', name)
    await rm(target, {force: true, recursive: true})
    await cp(source, target, {recursive: true})
    const manifestPath = path.join(target, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        version:
          name === 'scheduler' || name === 'styled-components'
            ? versionOverrides[name]
            : manifest.version,
      }),
    )
    if (name === 'styled-components')
      await symlink(path.dirname(source), path.join(target, 'node_modules'), 'junction')
  }
}

export async function buildHost(apps: BuiltApp[]) {
  const remotes = apps.map(({name, url}) => ({
    entry: new URL('mf-manifest.json', url).href,
    name,
  }))
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
}
