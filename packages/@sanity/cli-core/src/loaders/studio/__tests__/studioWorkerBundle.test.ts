import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {build, type Plugin} from 'vite'
import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'

import {
  getPackageName,
  httpsImportsPlugin,
  importMetaPathsPlugin,
  sanityExternalsPlugin,
} from '../studioWorkerBundle.js'

let rootPath: string

async function writeFiles(files: Record<string, string>) {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(rootPath, path)), {recursive: true})
    await writeFile(join(rootPath, path), contents)
  }
}

beforeAll(async () => {
  rootPath = await mkdtemp(join(tmpdir(), 'studio-worker-bundle-'))
  await writeFiles({
    'node_modules/dep/index.cjs': 'module.exports = {}',
    'node_modules/dep/index.mjs': 'export {}',
    'node_modules/dep/package.json': JSON.stringify({
      exports: {
        '.': {import: './index.mjs', require: './index.cjs'},
        './style.css': './style.css',
      },
      name: 'dep',
    }),
    'node_modules/dep/style.css': 'body {}',
    'node_modules/esm-interop/index.js': [
      "Object.defineProperty(exports, '__esModule', {value: true})",
      "exports.default = {div: 'styled.div'}",
      "exports.css = 'css'",
    ].join('\n'),
    'node_modules/esm-interop/package.json': JSON.stringify({
      main: 'index.js',
      name: 'esm-interop',
    }),
    'node_modules/other/index.js': 'export {}',
    'node_modules/other/node_modules/dep/index.js': 'export {}',
    'node_modules/other/node_modules/dep/package.json': JSON.stringify({
      main: 'index.js',
      name: 'dep',
    }),
    'node_modules/other/package.json': JSON.stringify({main: 'index.js', name: 'other'}),
    'node_modules/react/index.js': "exports.version = '19'",
    'node_modules/react/package.json': JSON.stringify({main: 'index.js', name: 'react'}),
    'node_modules/sanity/index.js': 'export {}',
    'node_modules/sanity/package.json': JSON.stringify({
      dependencies: {dep: '1.0.0', 'esm-interop': '1.0.0'},
      exports: {'.': './index.js', './package.json': './package.json'},
      name: 'sanity',
      peerDependencies: {react: '*'},
      type: 'module',
    }),
  })
})

afterAll(async () => {
  await rm(rootPath, {force: true, recursive: true})
})

function resolveExternal(
  id: string,
  kind: 'import-statement' | 'require-call' = 'import-statement',
  importer = join(rootPath, 'sanity.config.ts'),
  studioRootPath = rootPath,
) {
  const resolveId = sanityExternalsPlugin(studioRootPath).resolveId as (
    id: string,
    importer: string | undefined,
    options: {kind: string},
  ) => unknown
  return resolveId(id, importer, {kind})
}

/**
 * Bundles a config like the studio worker does, and runs the bundle next to it
 */
async function bundleAndImport(configPath: string, plugins: Plugin[]): Promise<unknown> {
  const result = await build({
    build: {
      rolldownOptions: {output: {codeSplitting: false}},
      ssr: join(rootPath, configPath),
      target: 'esnext',
      write: false,
    },
    configFile: false,
    logLevel: 'error',
    plugins,
    root: rootPath,
    ssr: {noExternal: true},
  })
  const [output] = Array.isArray(result) ? result : [result]
  const chunk = 'output' in output ? output.output[0] : undefined
  if (chunk?.type !== 'chunk') throw new Error('Expected a chunk')

  const bundlePath = join(rootPath, configPath.replace(/\.ts$/, '.bundle.mjs'))
  await writeFile(bundlePath, chunk.code)
  const {default: config} = await import(pathToFileURL(bundlePath).href)
  return config
}

const emptyProgram = () => ({body: [], type: 'Program'})

const fileUrl = (path: string) => pathToFileURL(join(rootPath, path)).href

describe('sanityExternalsPlugin', () => {
  test('externalizes `sanity` and its ES module dependencies as file URLs', () => {
    expect(resolveExternal('sanity')).toEqual({
      external: true,
      id: fileUrl('node_modules/sanity/index.js'),
    })
    expect(resolveExternal('dep')).toEqual({
      external: true,
      id: fileUrl('node_modules/dep/index.mjs'),
    })
  })

  test('imports CommonJS dependencies and peers through a wrapper module', () => {
    const plugin = sanityExternalsPlugin(rootPath)
    const load = plugin.load as (id: string) => string | null
    const resolveId = plugin.resolveId as (
      id: string,
      importer: string | undefined,
      options: {kind: string},
    ) => unknown

    const wrapperId = resolveExternal('react')
    expect(wrapperId).toBe(`\0sanity-commonjs-external:${fileUrl('node_modules/react/index.js')}`)
    expect(load(wrapperId as string)).toContain(
      `import module from ${JSON.stringify(fileUrl('node_modules/react/index.js'))}`,
    )
    expect(
      resolveId(fileUrl('node_modules/react/index.js'), wrapperId as string, {
        kind: 'import-statement',
      }),
    ).toEqual({external: true, id: fileUrl('node_modules/react/index.js')})
    expect(load(join(rootPath, 'sanity.config.ts'))).toBeNull()
  })

  test('externalizes `require()` calls as paths, with the `require` condition', () => {
    expect(resolveExternal('dep', 'require-call')).toEqual({
      external: true,
      id: join(rootPath, 'node_modules/dep/index.cjs'),
    })
  })

  test('bundles copies of dependencies that `sanity` does not use', () => {
    expect(
      resolveExternal('dep', 'import-statement', join(rootPath, 'node_modules/other/index.js')),
    ).toBeNull()
  })

  test('resolves imports without a file importer from the studio root', () => {
    expect(resolveExternal('dep', 'import-statement', 'https://esm.sh/pkg')).toEqual({
      external: true,
      id: fileUrl('node_modules/dep/index.mjs'),
    })
  })

  test('bundles imports that do not resolve to JavaScript', () => {
    expect(resolveExternal('dep/style.css')).toBeNull()
  })

  test('bundles packages that are not dependencies of `sanity`', () => {
    expect(resolveExternal('other')).toBeNull()
    expect(resolveExternal('./local.js')).toBeNull()
  })

  test('leaves imports it cannot resolve to Vite', () => {
    expect(resolveExternal('dep/missing')).toBeNull()
  })

  test('bundles everything when `sanity` is not installed', () => {
    expect(resolveExternal('sanity', 'import-statement', undefined, tmpdir())).toBeNull()
  })
})

describe('httpsImportsPlugin', () => {
  const plugin = httpsImportsPlugin(async (url) => `export default ${JSON.stringify(url)}`)
  const resolveId = plugin.resolveId as (id: string, importer?: string) => string | null
  const load = plugin.load as (id: string) => Promise<string | null>

  test('resolves https imports and imports relative to them', () => {
    expect(resolveId('https://esm.sh/pkg')).toBe('https://esm.sh/pkg')
    expect(resolveId('/v1/dep.mjs', 'https://esm.sh/pkg')).toBe('https://esm.sh/v1/dep.mjs')
    expect(resolveId('./dep.mjs', '/studio/sanity.config.ts')).toBeNull()
  })

  test('loads https modules', async () => {
    await expect(load('https://esm.sh/pkg')).resolves.toBe('export default "https://esm.sh/pkg"')
    await expect(load('/studio/sanity.config.ts')).resolves.toBeNull()
  })

  test('fails when the module cannot be fetched', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', {status: 404, statusText: 'Not Found'}))
    const defaultLoad = httpsImportsPlugin().load as (id: string) => Promise<string>
    await expect(defaultLoad('https://esm.sh/missing')).rejects.toThrow(
      'Failed to fetch module from https://esm.sh/missing: 404 Not Found',
    )
    fetchSpy.mockRestore()
  })
})

describe('bundling with sanityExternalsPlugin', () => {
  test('gives default imports of CommonJS externals the bundler default export', async () => {
    await writeFiles({
      'interop/config.ts': [
        "import styled, {css} from 'esm-interop'",
        "import React, {version} from 'react'",
        "import {named} from 'dep'",
        'export default {css, div: styled.div, named, react: React.version, version}',
      ].join('\n'),
      'node_modules/dep/index.mjs': "export const named = 'named'",
    })

    const config = await bundleAndImport('interop/config.ts', [sanityExternalsPlugin(rootPath)])
    expect(config).toEqual({
      css: 'css',
      div: 'styled.div',
      named: 'named',
      react: '19',
      version: '19',
    })
  })
})

describe('importMetaPathsPlugin', () => {
  test('gives every bundled file its own `import.meta` URL, path and directory', async () => {
    await writeFiles({
      'meta/config.ts': [
        "import {info} from './nested/info'",
        "import {packageJsonPath} from 'meta-pkg'",
        'export default {info, packageJsonPath, url: import.meta.url}',
      ].join('\n'),
      'meta/nested/info.ts': [
        "const label: string = 'héllo 😀'",
        'const meta = import.meta',
        'export const info = {',
        '  dirname: import.meta.dirname,',
        '  filename: import.meta . filename,',
        '  label,',
        "  literal: 'import.meta.url',",
        '  metaUrl: meta.url,',
        '  url: import.meta.url,',
        '}',
      ].join('\n'),
      'node_modules/meta-pkg/index.js': [
        "import {createRequire} from 'node:module'",
        'const require = createRequire(import.meta.url)',
        "export const packageJsonPath = require.resolve('./package.json')",
      ].join('\n'),
      'node_modules/meta-pkg/package.json': JSON.stringify({
        main: 'index.js',
        name: 'meta-pkg',
        type: 'module',
      }),
    })

    const config = await bundleAndImport('meta/config.ts', [importMetaPathsPlugin()])
    const bundlePath = join(rootPath, 'meta/config.bundle.mjs')

    const nested = join(rootPath, 'meta/nested/info.ts')
    expect(config).toEqual({
      info: {
        dirname: dirname(nested),
        filename: nested,
        label: 'héllo 😀',
        literal: 'import.meta.url',
        // Only direct property accesses are rewritten
        metaUrl: pathToFileURL(bundlePath).href,
        url: pathToFileURL(nested).href,
      },
      packageJsonPath: join(rootPath, 'node_modules/meta-pkg/package.json'),
      url: fileUrl('meta/config.ts'),
    })
  })

  test('leaves virtual modules alone', () => {
    const transform = importMetaPathsPlugin().transform as {
      handler: (this: unknown, code: string, id: string) => unknown
    }
    expect(transform.handler.call({}, 'export default import.meta.url', '\0virtual')).toBeNull()
  })

  test('leaves files without `import.meta` paths alone', () => {
    const transform = importMetaPathsPlugin().transform as {
      handler: (this: unknown, code: string, id: string) => unknown
    }
    expect(
      transform.handler.call({parse: emptyProgram}, 'export {}', join(rootPath, 'a.ts')),
    ).toBeNull()
  })
})

describe('getPackageName', () => {
  test.each([
    ['sanity', 'sanity'],
    ['sanity/structure', 'sanity'],
    ['@sanity/ui', '@sanity/ui'],
    ['@sanity/ui/theme', '@sanity/ui'],
    ['@sanity', undefined],
    ['./local', undefined],
    ['../local', undefined],
    ['/absolute', undefined],
    ['node:fs', undefined],
    ['https://esm.sh/pkg', undefined],
    ['\0virtual', undefined],
  ])('%s → %s', (id, expected) => {
    expect(getPackageName(id)).toBe(expected)
  })
})
