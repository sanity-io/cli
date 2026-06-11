import {describe, expect, test} from 'vitest'

import {createVendorImportMapFromBundle} from '../createVendorImportMapFromBundle.js'

type Chunk = {fileName: string; isEntry: boolean; name: string; type: 'chunk'}
type Asset = {type: 'asset'}

function chunk(name: string, fileName: string, isEntry = true): Chunk {
  return {fileName, isEntry, name, type: 'chunk'}
}

describe('createVendorImportMapFromBundle', () => {
  const specifiers = {
    'react-dom/client': 'react-dom/client',
    'react/index': 'react',
  }

  test('maps entry chunks to their import specifier with an absolute path', () => {
    const bundle: Record<string, Asset | Chunk> = {
      'vendor/react-dom/client-def456.mjs': chunk(
        'react-dom/client',
        'vendor/react-dom/client-def456.mjs',
      ),
      'vendor/react/index-abc123.mjs': chunk('react/index', 'vendor/react/index-abc123.mjs'),
    }

    expect(createVendorImportMapFromBundle(bundle, specifiers, '/')).toEqual({
      react: '/vendor/react/index-abc123.mjs',
      'react-dom/client': '/vendor/react-dom/client-def456.mjs',
    })
  })

  test('prefixes a non-root base path', () => {
    const bundle: Record<string, Asset | Chunk> = {
      'vendor/react/index-abc123.mjs': chunk('react/index', 'vendor/react/index-abc123.mjs'),
    }

    expect(createVendorImportMapFromBundle(bundle, specifiers, '/studio/')).toEqual({
      react: '/studio/vendor/react/index-abc123.mjs',
    })
  })

  test('ignores assets, non-entry chunks, and chunks without a vendor specifier', () => {
    const bundle: Record<string, Asset | Chunk> = {
      // The app's own entry chunk - not a vendor specifier, skipped.
      'static/sanity-xyz.js': chunk('sanity', 'static/sanity-xyz.js'),
      // CSS/asset output - skipped.
      'static/style-1.css': {type: 'asset'},
      'vendor/react/index-abc123.mjs': chunk('react/index', 'vendor/react/index-abc123.mjs'),
      // Shared chunk created by code splitting (not an entry) - skipped.
      'vendor/shared-1.mjs': chunk('shared', 'vendor/shared-1.mjs', false),
    }

    expect(createVendorImportMapFromBundle(bundle, specifiers, '/')).toEqual({
      react: '/vendor/react/index-abc123.mjs',
    })
  })

  test('returns an empty map when no vendor entry chunks are present', () => {
    const bundle: Record<string, Asset | Chunk> = {
      'static/sanity-xyz.js': chunk('sanity', 'static/sanity-xyz.js'),
    }

    expect(createVendorImportMapFromBundle(bundle, specifiers, '/')).toEqual({})
  })
})
