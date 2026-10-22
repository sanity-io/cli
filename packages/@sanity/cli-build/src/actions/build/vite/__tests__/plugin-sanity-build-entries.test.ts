import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {build, type Plugin, type ResolvedConfig} from 'vite'
import {describe, expect, test, vi} from 'vitest'

import {renderDocument} from '../../renderDocument.js'
import {sanityBuildEntries} from '../plugin-sanity-build-entries.js'

vi.mock('../../renderDocument.js', () => ({
  renderDocument: vi.fn(async (options: {props?: {css?: string[]}}) => {
    const links = (options.props?.css ?? [])
      .map((href) => `<link href="${href}" rel="stylesheet" />`)
      .join('')
    return `<html><head>${links}</head><body><div id="root"></div></body></html>`
  }),
}))

const MARKER = 'sanity-css-code-split-marker'

interface BundleChunk {
  fileName: string
  type: 'chunk'

  facadeModuleId?: string | null
  imports?: string[]
  isEntry?: boolean
  name?: string
  viteMetadata?: {importedCss?: Iterable<string>}
}

interface BundleAsset {
  fileName: string
  type: 'asset'

  name?: string | null
  names?: string[]
  originalFileName?: string | null
  originalFileNames?: string[]
}

type Bundle = Record<string, BundleAsset | BundleChunk>

function entryChunk(overrides: Partial<BundleChunk> = {}): BundleChunk {
  return {
    facadeModuleId: '/project/.sanity/runtime/app.js',
    fileName: 'static/sanity-abc.js',
    imports: [],
    name: 'sanity',
    type: 'chunk',
    viteMetadata: {importedCss: undefined},
    ...overrides,
  }
}

async function renderBundle(options: {
  bridge?: boolean
  bundle: Bundle
  cssCodeSplit?: boolean
}): Promise<{css: string[]; html: string}> {
  const plugin = sanityBuildEntries({basePath: '/', bridge: options.bridge, cwd: '/project'})
  if (options.cssCodeSplit !== undefined) {
    await resolveConfig(plugin, options.cssCodeSplit)
  }

  let emitted: {fileName: string; source: string} | undefined
  await runGenerateBundle(plugin, options.bundle, (file) => {
    emitted = file
  })

  if (!emitted) throw new Error('index.html was not emitted')
  return {css: lastRenderedCss(), html: emitted.source}
}

async function resolveConfig(plugin: Plugin, cssCodeSplit: boolean): Promise<void> {
  const hook = plugin.configResolved
  if (typeof hook !== 'function') throw new Error('expected configResolved function')
  await hook.call(
    {} as ThisParameterType<typeof hook>,
    {
      build: {cssCodeSplit},
    } as ResolvedConfig,
  )
}

async function runGenerateBundle(
  plugin: Plugin,
  bundle: Bundle,
  emitFile: (file: {fileName: string; source: string}) => void,
): Promise<void> {
  const hook = plugin.generateBundle
  if (!hook || typeof hook === 'function') {
    throw new Error('expected generateBundle to run after vite:css-post')
  }
  await hook.handler.call(
    {emitFile} as unknown as ThisParameterType<typeof hook.handler>,
    {} as Parameters<typeof hook.handler>[0],
    bundle as unknown as Parameters<typeof hook.handler>[1],
    false,
  )
}

function lastRenderedCss(): string[] {
  const options = vi.mocked(renderDocument).mock.calls.at(-1)?.[0]
  return options?.props?.css ?? []
}

describe('sanityBuildEntries index.html', () => {
  test('injects the core-ui bridge script by default', async () => {
    const {html} = await renderBundle({bundle: {'static/sanity-abc.js': entryChunk()}})
    expect(html).toContain('bridge.js')
  })

  test('omits the bridge script when bridge is false', async () => {
    const {html} = await renderBundle({
      bridge: false,
      bundle: {'static/sanity-abc.js': entryChunk()},
    })
    expect(html).not.toContain('bridge.js')
    // The document itself is still emitted.
    expect(html).toContain('id="root"')
  })
})

describe('sanityBuildEntries stylesheets', () => {
  test('links importedCss from the entry and the chunks it statically imports', async () => {
    const {css, html} = await renderBundle({
      bundle: {
        'static/extra.css': {fileName: 'static/extra.css', type: 'asset'},
        'static/sanity-abc.css': {fileName: 'static/sanity-abc.css', type: 'asset'},
        'static/sanity-abc.js': entryChunk({
          imports: ['static/vendor-def.js'],
          viteMetadata: {importedCss: new Set(['static/sanity-abc.css'])},
        }),
        'static/vendor-def.css': {fileName: 'static/vendor-def.css', type: 'asset'},
        'static/vendor-def.js': {
          fileName: 'static/vendor-def.js',
          imports: [],
          name: 'vendor',
          type: 'chunk',
          viteMetadata: {importedCss: new Set(['static/vendor-def.css'])},
        },
      },
      cssCodeSplit: true,
    })

    expect(css).toEqual(['static/sanity-abc.css', 'static/vendor-def.css'])
    expect(html).toContain('<link href="static/sanity-abc.css" rel="stylesheet" />')
    expect(html).toContain('<link href="static/vendor-def.css" rel="stylesheet" />')
    expect(html).not.toContain('static/extra.css')
  })

  test('links css from statically imported chunks when the entry has no viteMetadata', async () => {
    const {css} = await renderBundle({
      bundle: {
        'static/sanity-abc.js': entryChunk({
          imports: ['static/vendor-def.js'],
          viteMetadata: undefined,
        }),
        'static/vendor-def.js': {
          fileName: 'static/vendor-def.js',
          imports: [],
          name: 'vendor',
          type: 'chunk',
          viteMetadata: {importedCss: ['static/vendor-def.css']},
        },
      },
      cssCodeSplit: true,
    })

    expect(css).toEqual(['static/vendor-def.css'])
  })

  test('links the combined style.css asset when cssCodeSplit is false', async () => {
    const {css, html} = await renderBundle({
      bundle: {
        'static/sanity-abc.js': entryChunk({viteMetadata: {importedCss: new Set()}}),
        'static/style-abc123.css': {
          fileName: 'static/style-abc123.css',
          name: 'style.css',
          names: ['style.css'],
          originalFileName: 'style.css',
          originalFileNames: ['style.css'],
          type: 'asset',
        },
      },
      cssCodeSplit: false,
    })

    expect(css).toEqual(['static/style-abc123.css'])
    expect(html).toContain('<link href="static/style-abc123.css" rel="stylesheet" />')
  })

  test('finds the combined sheet via originalFileNames when names is missing', async () => {
    const {css} = await renderBundle({
      bundle: {
        'bundled/app-abc123.css': {
          fileName: 'bundled/app-abc123.css',
          originalFileNames: ['style.css'],
          type: 'asset',
        },
        'static/sanity-abc.js': entryChunk({viteMetadata: undefined}),
      },
      cssCodeSplit: false,
    })

    expect(css).toEqual(['bundled/app-abc123.css'])
  })

  test('falls back to emitted css assets when the bundle name is unavailable', async () => {
    const {css} = await renderBundle({
      bundle: {
        'static/all-abc123.css': {fileName: 'static/all-abc123.css', type: 'asset'},
        'static/sanity-abc.js': entryChunk(),
      },
      cssCodeSplit: false,
    })

    expect(css).toEqual(['static/all-abc123.css'])
  })

  test('does not link the combined sheet twice when importedCss already lists it', async () => {
    const {css} = await renderBundle({
      bundle: {
        'static/sanity-abc.js': entryChunk({
          viteMetadata: {importedCss: new Set(['static/style-abc123.css'])},
        }),
        'static/style-abc123.css': {
          fileName: 'static/style-abc123.css',
          names: ['style.css'],
          type: 'asset',
        },
      },
      cssCodeSplit: false,
    })

    expect(css).toEqual(['static/style-abc123.css'])
  })
})

describe('sanityBuildEntries vite build', () => {
  test('code-split builds link the entry stylesheet', {timeout: 60_000}, async () => {
    const output = await buildFixture({cssCodeSplit: true})
    expect(output.css).toEqual([expect.stringMatching(/^static\/sanity-[^/]+\.css$/)])
    expect(output.html).toContain(`<link href="${output.css[0]}" rel="stylesheet" />`)
    expect(output.files).toEqual(output.css)
    expect(output.sources[0]).toContain(MARKER)
  })

  test(
    'cssCodeSplit: false links the combined stylesheet and the file exists',
    {timeout: 60_000},
    async () => {
      const output = await buildFixture({cssCodeSplit: false})
      expect(output.css).toEqual([expect.stringMatching(/^static\/style-[^/]+\.css$/)])
      expect(output.html).toContain(`<link href="${output.css[0]}" rel="stylesheet" />`)
      expect(output.files).toEqual(output.css)
      expect(output.sources[0]).toContain(MARKER)
    },
  )

  test(
    'cssCodeSplit: false follows a custom assetFileNames pattern',
    {timeout: 60_000},
    async () => {
      const output = await buildFixture({
        assetFileNames: 'bundled/[name]-[hash][extname]',
        cssCodeSplit: false,
      })
      expect(output.css).toEqual([expect.stringMatching(/^bundled\/style-[^/]+\.css$/)])
      expect(output.html).toContain(`<link href="${output.css[0]}" rel="stylesheet" />`)
      expect(output.files).toEqual(output.css)
      expect(output.sources[0]).toContain(MARKER)
    },
  )
})

async function buildFixture(options: {
  assetFileNames?: string
  cssCodeSplit: boolean
}): Promise<{css: string[]; files: string[]; html: string; sources: string[]}> {
  const root = await mkdtemp(path.join(tmpdir(), 'sanity-css-'))
  try {
    const runtimeDir = path.join(root, '.sanity', 'runtime')
    await mkdir(runtimeDir, {recursive: true})
    await writeFile(
      path.join(runtimeDir, 'app.js'),
      `import './studio.css'\nconsole.log('studio')\n`,
    )
    await writeFile(path.join(runtimeDir, 'studio.css'), `.${MARKER} { color: #123456; }\n`)

    vi.mocked(renderDocument).mockClear()
    await build({
      build: {
        assetsDir: 'static',
        cssCodeSplit: options.cssCodeSplit,
        cssMinify: false,
        emptyOutDir: true,
        minify: false,
        outDir: path.join(root, 'dist'),
        rolldownOptions: {
          input: {sanity: path.join(runtimeDir, 'app.js')},
          ...(options.assetFileNames ? {output: {assetFileNames: options.assetFileNames}} : {}),
        },
      },
      configFile: false,
      logLevel: 'silent',
      plugins: [sanityBuildEntries({basePath: '/', cwd: root})],
      root,
    })

    const dist = path.join(root, 'dist')
    const html = await readFile(path.join(dist, 'index.html'), 'utf8')
    const css = lastRenderedCss()
    const sources = await Promise.all(
      css.map((fileName) => readFile(path.join(dist, fileName), 'utf8')),
    )
    const files = (await walk(dist))
      .filter((file) => file.endsWith('.css'))
      .map((file) => path.relative(dist, file).split(path.sep).join('/'))
    return {css, files, html, sources}
  } finally {
    await rm(root, {force: true, recursive: true})
  }
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {withFileTypes: true})
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? walk(full) : [full]
    }),
  )
  return files.flat()
}
