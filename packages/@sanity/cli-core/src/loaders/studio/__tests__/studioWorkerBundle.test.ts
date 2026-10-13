import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest'

import {getPackageName, httpsImportsPlugin, sanityExternalsPlugin} from '../studioWorkerBundle.js'

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
    'node_modules/other/index.js': 'export {}',
    'node_modules/other/node_modules/dep/index.js': 'export {}',
    'node_modules/other/node_modules/dep/package.json': JSON.stringify({
      main: 'index.js',
      name: 'dep',
    }),
    'node_modules/other/package.json': JSON.stringify({main: 'index.js', name: 'other'}),
    'node_modules/react/index.js': 'module.exports = {}',
    'node_modules/react/package.json': JSON.stringify({main: 'index.js', name: 'react'}),
    'node_modules/sanity/index.js': 'export {}',
    'node_modules/sanity/package.json': JSON.stringify({
      dependencies: {dep: '1.0.0'},
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

const fileUrl = (path: string) => pathToFileURL(join(rootPath, path)).href

describe('sanityExternalsPlugin', () => {
  test('externalizes `sanity`, its dependencies and peers as file URLs', () => {
    expect(resolveExternal('sanity')).toEqual({
      external: true,
      id: fileUrl('node_modules/sanity/index.js'),
    })
    expect(resolveExternal('dep')).toEqual({
      external: true,
      id: fileUrl('node_modules/dep/index.mjs'),
    })
    expect(resolveExternal('react')).toEqual({
      external: true,
      id: fileUrl('node_modules/react/index.js'),
    })
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
