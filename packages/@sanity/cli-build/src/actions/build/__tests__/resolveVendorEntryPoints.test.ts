import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {readPackageJson} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {
  listExportSubpaths,
  resolveBrowserFieldEntryPoints,
  resolveExportsEntryPoints,
  resolveExportTarget,
  resolveVendorEntryPoints,
} from '../resolveVendorEntryPoints.js'

const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url))

describe('resolveExportTarget', () => {
  test('returns string targets as-is', () => {
    expect(resolveExportTarget('./index.js')).toBe('./index.js')
  })

  test('prefers browser over import and default', () => {
    expect(
      resolveExportTarget({
        browser: './browser.js',
        default: './default.js',
        import: './import.mjs',
      }),
    ).toBe('./browser.js')
  })

  test('falls back to import then default', () => {
    expect(resolveExportTarget({default: './default.js', import: './import.mjs'})).toBe(
      './import.mjs',
    )
    expect(resolveExportTarget({default: './default.js'})).toBe('./default.js')
  })

  test('resolves nested conditions', () => {
    expect(
      resolveExportTarget({
        default: {browser: './browser.js', default: './node.js'},
        'react-server': './server.js',
      }),
    ).toBe('./browser.js')
  })
})

describe('listExportSubpaths', () => {
  test('omits pattern exports', () => {
    expect(
      listExportSubpaths({
        '.': './index.js',
        './features/*': './features/*.js',
        './package.json': './package.json',
      }),
    ).toEqual(['.', './package.json'])
  })
})

describe('resolveExportsEntryPoints', () => {
  test('derives react entry points from installed package.json exports', async () => {
    const manifest = await readPackageJson(
      path.join(packageRoot, 'node_modules/react/package.json'),
      {
        skipSchemaValidation: true,
      },
    )

    const entryPoints = resolveExportsEntryPoints(manifest.exports!)

    expect(entryPoints).toEqual({
      '.': './index.js',
      './compiler-runtime': './compiler-runtime.js',
      './jsx-dev-runtime': './jsx-dev-runtime.js',
      './jsx-runtime': './jsx-runtime.js',
      './package.json': './package.json',
    })
  })

  test('derives react-dom entry points with browser conditions', async () => {
    const manifest = await readPackageJson(
      path.join(packageRoot, 'node_modules/react-dom/package.json'),
      {skipSchemaValidation: true},
    )

    const entryPoints = resolveExportsEntryPoints(manifest.exports!)

    expect(entryPoints['./server']).toBe('./server.browser.js')
    expect(entryPoints['./static']).toBe('./static.browser.js')
    expect(entryPoints['./client']).toBe('./client.js')
    expect(entryPoints['./server.node']).toBe('./server.node.js')
  })
})

describe('resolveBrowserFieldEntryPoints', () => {
  test('derives styled-components browser ESM entry from module + browser field', async () => {
    const manifest = await readPackageJson(
      path.join(packageRoot, 'node_modules/styled-components/package.json'),
      {skipSchemaValidation: true},
    )

    expect(resolveBrowserFieldEntryPoints(manifest)).toEqual({
      '.': './dist/styled-components.browser.esm.js',
      './package.json': './package.json',
    })
  })
})

describe('resolveVendorEntryPoints', () => {
  test('uses exports when present', async () => {
    const manifest = await readPackageJson(
      path.join(packageRoot, 'node_modules/react/package.json'),
      {
        skipSchemaValidation: true,
      },
    )

    const entryPoints = resolveVendorEntryPoints({
      fallback: 'exports',
      manifest,
      packageDir: path.join(packageRoot, 'node_modules/react'),
    })

    expect(entryPoints['./jsx-runtime']).toBe('./jsx-runtime.js')
  })

  test('falls back to browser-field strategy when exports are absent', async () => {
    const manifest = await readPackageJson(
      path.join(packageRoot, 'node_modules/styled-components/package.json'),
      {skipSchemaValidation: true},
    )

    const entryPoints = resolveVendorEntryPoints({
      fallback: 'browser-field',
      manifest,
      packageDir: path.join(packageRoot, 'node_modules/styled-components'),
    })

    expect(entryPoints['.']).toBe('./dist/styled-components.browser.esm.js')
  })
})
