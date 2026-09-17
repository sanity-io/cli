import {cp, readFile, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {testFixture} from '@sanity/cli-test'
import {chromium} from 'playwright'
import {build, normalizePath, preview} from 'vite'
import {afterEach, expect, test} from 'vitest'

import {runCli} from '../helpers/runCli.js'

type Manifest = {
  metaData: {remoteEntry: {name: string}}
  shared: {assets: {js: {async: string[]; sync: string[]}}; name: string}[]
}

const servers: Awaited<ReturnType<typeof preview>>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.httpServer.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
})

async function buildApp(
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

  // Copy packages before changing test-owned versions; fixture node_modules entries are shared symlinks.
  // The package code stays real: these variants check exact-version selection, not release compatibility.
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
  expect(manifest.shared.some(({name}) => name === 'react')).toBe(true)
  const server = await preview({
    configFile: false,
    logLevel: 'silent',
    preview: {cors: true, host: '127.0.0.1', port: 0},
    root,
  })
  servers.push(server)
  return {manifest, name, root, url: server.resolvedUrls!.local[0]}
}

// Dependency sharing has not shipped to the registry CLI used by scheduled E2E runs.
test.skipIf(process.env.E2E_REGISTRY_MODE === 'true')(
  'built apps reuse compatible dependencies without sharing app state or styles',
  async () => {
    const first = await buildApp('first')
    const second = await buildApp('second', {customConfig: true})
    const withoutStyled = await buildApp('without-styled', {styled: false})
    const otherStyled = await buildApp('other-styled', {
      versionOverrides: {'styled-components': '6.0.0'},
    })
    const otherScheduler = await buildApp('other-scheduler', {
      styled: false,
      versionOverrides: {scheduler: '0.0.1'},
    })
    const remotes = [first, second, withoutStyled, otherStyled, otherScheduler].map(
      ({name, url}) => ({entry: new URL('mf-manifest.json', url).href, name}),
    )
    const browser = await chromium.launch()
    try {
      const hostEntry = path.join(first.root, 'host.js')
      const runtime = normalizePath(
        fileURLToPath(import.meta.resolve('@module-federation/runtime')),
      )
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
          outDir: path.join(first.root, 'dist'),
        },
        configFile: false,
        logLevel: 'silent',
      })
      await writeFile(
        path.join(first.root, 'dist/index.html'),
        '<!doctype html><title>Sharing</title>',
      )
      const page = await browser.newPage()
      const errors: string[] = []
      const requests = new Set<string>()
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('request', (request) => requests.add(request.url()))
      const requestedProviders = (app: Awaited<ReturnType<typeof buildApp>>, name?: string) =>
        app.manifest.shared
          .filter((provider) => !name || provider.name === name)
          .flatMap(({assets}) => [...assets.js.sync, ...assets.js.async])
          .filter((asset) => requests.has(new URL(asset, app.url).href))
      await page.goto(first.url)
      await page.evaluate("import('/host.js').then(host => host.mount('first', 'rgb(0, 128, 0)'))")
      await page.locator('#first button').waitFor()
      expect(requestedProviders(first).length).toBeGreaterThan(0)
      await page.evaluate("import('/host.js').then(host => host.preload('second'))")
      await expect
        .poll(() =>
          requests.has(new URL(second.manifest.metaData.remoteEntry.name, second.url).href),
        )
        .toBe(true)
      expect(requestedProviders(second)).toEqual([])
      await page.evaluate("import('/host.js').then(host => host.mount('second', 'rgb(0, 0, 255)'))")
      await page.locator('#second button').waitFor()
      expect(requestedProviders(second)).toEqual([])
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
      expect(
        await page.locator('#second button').evaluate((el) => getComputedStyle(el).color),
      ).toBe('rgb(255, 0, 0)')
      await page.locator('#second button').click()
      await page.getByRole('button', {exact: true, name: 'Hello 1'}).waitFor()
      await page.evaluate("import('/host.js').then(host => host.mount('without-styled'))")
      await page.locator('#without-styled').getByText('Hello', {exact: true}).waitFor()
      expect(requestedProviders(withoutStyled)).toEqual([])
      await page.evaluate(
        "import('/host.js').then(host => host.mount('other-styled', 'rgb(128, 0, 128)'))",
      )
      await page.locator('#other-styled button').waitFor()
      expect(requestedProviders(otherStyled, 'react')).toEqual([])
      expect(requestedProviders(otherStyled, 'react-dom/client')).toEqual([])
      expect(requestedProviders(otherStyled, 'styled-components').length).toBeGreaterThan(0)
      expect(
        await page.locator('#other-styled').evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe('rgb(128, 0, 128)')
      await page.evaluate("import('/host.js').then(host => host.mount('other-scheduler'))")
      await page.locator('#other-scheduler').getByText('Hello', {exact: true}).waitFor()
      expect(requestedProviders(otherScheduler, 'react').length).toBeGreaterThan(0)
      expect(requestedProviders(otherScheduler, 'react-dom/client').length).toBeGreaterThan(0)
      expect(requestedProviders(second)).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await browser.close()
    }
  },
  180_000,
)
