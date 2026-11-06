// @vitest-environment jsdom
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {build, createServer, type Plugin, type Rolldown} from 'vite'
import {afterAll, afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {sanityAppStyles} from './plugin-sanity-app-styles.js'

const TMP_DIR = path.join(import.meta.dirname, 'tmp')

const app = {
  'index.js': "export const load = () => import('./lazy.js')",
  'lazy.css': 'body { color: red }',
  'lazy.js': "import './lazy.css'\nexport default 'lazy'",
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(TMP_DIR, 'app-styles-'))
  await Promise.all(
    Object.entries(app).map(([name, source]) => writeFile(path.join(root, name), source)),
  )
  return root
}

const fail = (message: string) => {
  throw new Error(message)
}

const importFile = (file: string) => import(/* @vite-ignore */ pathToFileURL(file).href)

async function buildApp(plugins: Plugin[]): Promise<string> {
  const root = await fixture()
  const output = (await build({
    base: 'https://example.test/',
    build: {
      rolldownOptions: {input: path.join(root, 'index.js'), preserveEntrySignatures: 'strict'},
    },
    configFile: false,
    logLevel: 'silent',
    plugins,
    root,
  })) as Rolldown.RolldownOutput
  const entry = output.output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry)!
  return path.join(root, 'dist', entry.fileName)
}

async function serveCss(plugins: Plugin[]): Promise<{
  updateStyle: (id: string, content: string) => void
}> {
  const root = await fixture()
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: {noDiscovery: true},
    plugins,
    root,
    server: {middlewareMode: true, ws: false},
  })
  try {
    const client = await server.transformRequest('/@vite/client')
    const cssModule = await server.transformRequest('/lazy.css')
    await writeFile(
      path.join(root, 'client.mjs'),
      client!.code.replace(/^import ["']\/@vite\/env["'];?$/m, ''),
    )
    await writeFile(
      path.join(root, 'lazy.css.mjs'),
      cssModule!.code.replaceAll('"/@vite/client"', '"./client.mjs"'),
    )
  } finally {
    await server.close()
  }
  await importFile(path.join(root, 'lazy.css.mjs'))
  return importFile(path.join(root, 'client.mjs'))
}

beforeAll(async () => {
  await mkdir(TMP_DIR, {recursive: true})
})

afterAll(async () => {
  await rm(TMP_DIR, {force: true, recursive: true})
})

afterEach(() => {
  document.head.replaceChildren()
})

test("tags the <link> that Vite's preload helper inserts for a dynamic import's CSS", async () => {
  const {load} = await importFile(await buildApp([sanityAppStyles('favorites')]))

  void load()

  const link = document.head.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')
  expect(link?.getAttribute('href')).toMatch(/lazy-.*\.css$/)
  expect(link?.dataset.applicationId).toBe('favorites')
})

test('keeps one stylesheet link per app for a shared CSS URL', async () => {
  const apps = await Promise.all(
    ['first', 'second', 'first'].map(async (appId) =>
      importFile(await buildApp([sanityAppStyles(appId)])),
    ),
  )

  for (const {load} of apps) void load()

  const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
  expect(links.map((link) => link.dataset.applicationId)).toEqual(['first', 'second'])
  expect(links[0]?.href).toBe(links[1]?.href)
})

describe('dev server', () => {
  beforeAll(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.stubGlobal(
      'WebSocket',
      class {
        addEventListener() {}
        removeEventListener() {}
      },
    )
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("tags the <style> that Vite's client inserts for a CSS module", async () => {
    await serveCss([sanityAppStyles('favorites')])

    const style = document.head.querySelector<HTMLStyleElement>('style[data-vite-dev-id]')
    expect(style?.textContent).toContain('color: red')
    expect(style?.dataset.applicationId).toBe('favorites')
  })

  test('keeps one style per app for a shared CSS module', async () => {
    for (const [appId, color] of [
      ['first', 'red'],
      ['second', 'blue'],
      ['first', 'green'],
    ]) {
      const client = await serveCss([sanityAppStyles(appId!)])
      client.updateStyle('/shared.css', `body { color: ${color} }`)
    }

    const styles = document.head.querySelectorAll<HTMLStyleElement>(
      'style[data-vite-dev-id="/shared.css"]',
    )
    expect([...styles].map((style) => [style.dataset.applicationId, style.textContent])).toEqual([
      ['first', 'body { color: green }'],
      ['second', 'body { color: blue }'],
    ])
  })
})

test('fails the build when a Vite upgrade drops the anchor, rather than tagging nothing', () => {
  const {transform} = sanityAppStyles('favorites')
  const {handler} = transform as {handler: (this: unknown, code: string, id: string) => unknown}

  expect(() =>
    handler.call({error: fail}, 'const link = createLink()', '\0vite/preload-helper.js'),
  ).toThrow('Could not find `document.createElement("link")` in \0vite/preload-helper.js')

  expect(() =>
    handler.call({error: fail}, 'document.createElement("link")', '\0vite/preload-helper.js'),
  ).toThrow('Could not find `link.rel === "stylesheet"` in \0vite/preload-helper.js')
})
