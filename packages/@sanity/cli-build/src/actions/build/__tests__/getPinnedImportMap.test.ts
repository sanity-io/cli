import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  getBucketEntries,
  getInstalledBucketEntries,
  getPinnedImportMap,
} from '../getPinnedImportMap.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getBucketEntries()', () => {
  test('maps the root export to index and every subpath export to its name', () => {
    expect(
      getBucketEntries({
        '.': './lib/index.js',
        './_singletons': './lib/_singletons.js',
        './structure': './lib/structure.js',
      }),
    ).toEqual(['index', '_singletons', 'structure'])
  })

  test('skips package.json, stylesheets and subpath patterns', () => {
    expect(
      getBucketEntries({
        '.': './lib/index.js',
        './bundle.css': {browser: './lib/bundle.css', default: './lib/bundle-css.js'},
        './package.json': './package.json',
        './router': './lib/router.js',
        './utils/*': './lib/utils/*.js',
      }),
    ).toEqual(['index', 'router'])
  })

  test('keeps nested subpaths', () => {
    expect(getBucketEntries({'.': './index.js', './media-library/island': './island.js'})).toEqual([
      'index',
      'media-library/island',
    ])
  })

  test('treats conditional-only exports as the root entry', () => {
    expect(getBucketEntries({import: './index.mjs', require: './index.cjs'})).toEqual(['index'])
  })

  test.each([undefined, null, './index.js'])('falls back to index for %j', (exports) => {
    expect(getBucketEntries(exports)).toEqual(['index'])
  })
})

describe('getInstalledBucketEntries()', () => {
  let workDir: string

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'pinned-import-map-'))
    const packageDir = path.join(workDir, 'node_modules', 'sanity')
    await mkdir(packageDir, {recursive: true})
    await writeFile(path.join(workDir, 'package.json'), JSON.stringify({name: 'studio'}))
    await writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        exports: {
          '.': './lib/index.js',
          './package.json': './package.json',
          './structure': './lib/structure.js',
        },
        name: 'sanity',
        version: '6.18.0',
      }),
    )
  })

  afterEach(async () => {
    await rm(workDir, {force: true, recursive: true})
  })

  test('reads the entries from the installed package', async () => {
    await expect(getInstalledBucketEntries('sanity', workDir)).resolves.toEqual([
      'index',
      'structure',
    ])
  })

  test('falls back to index when the package is not installed', async () => {
    await expect(getInstalledBucketEntries('@sanity/vision', workDir)).resolves.toEqual(['index'])
  })

  test('throws when sanity itself cannot be read', async () => {
    const emptyWorkDir = await mkdtemp(path.join(tmpdir(), 'pinned-import-map-'))
    try {
      await writeFile(path.join(emptyWorkDir, 'package.json'), JSON.stringify({name: 'studio'}))

      await expect(getInstalledBucketEntries('sanity', emptyWorkDir)).rejects.toThrow(
        'Failed to read exports from the installed sanity package',
      )
    } finally {
      await rm(emptyWorkDir, {force: true, recursive: true})
    }
  })
})

describe('getPinnedImportMap()', () => {
  const packages = [
    {cssFile: 'index.css', entries: ['index', 'structure'], name: 'sanity', version: '6.18.0'},
    {entries: ['index'], name: '@sanity/vision', version: '6.18.0'},
  ]

  test('points every entry and stylesheet at the exact version in the bucket', () => {
    expect(
      getPinnedImportMap(packages, {bucketBase: 'https://modules.sanity-cdn.com/modules/v1'}),
    ).toEqual({
      cssUrls: ['https://modules.sanity-cdn.com/modules/v1/sanity/6.18.0/bare/index.css'],
      imports: {
        '@sanity/vision':
          'https://modules.sanity-cdn.com/modules/v1/@sanity__vision/6.18.0/bare/index.mjs',
        sanity: 'https://modules.sanity-cdn.com/modules/v1/sanity/6.18.0/bare/index.mjs',
        'sanity/structure':
          'https://modules.sanity-cdn.com/modules/v1/sanity/6.18.0/bare/structure.mjs',
      },
    })
  })

  test('uses the production bucket by default', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')
    vi.stubEnv('SANITY_MODULES_BUCKET_HOST', undefined)
    expect(getPinnedImportMap(packages).imports.sanity).toBe(
      'https://modules.sanity-cdn.com/modules/v1/sanity/6.18.0/bare/index.mjs',
    )
  })

  test('uses the staging bucket when building for staging', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
    vi.stubEnv('SANITY_MODULES_BUCKET_HOST', undefined)
    expect(getPinnedImportMap(packages).imports.sanity).toBe(
      'https://modules.sanity-cdn.work/modules/v1/sanity/6.18.0/bare/index.mjs',
    )
  })

  test('uses SANITY_MODULES_BUCKET_HOST when set', () => {
    vi.stubEnv('SANITY_MODULES_BUCKET_HOST', 'http://localhost:3333')
    expect(getPinnedImportMap(packages).imports.sanity).toBe(
      'http://localhost:3333/modules/v1/sanity/6.18.0/bare/index.mjs',
    )
  })
})
