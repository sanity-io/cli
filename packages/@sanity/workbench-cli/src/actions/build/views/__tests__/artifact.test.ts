import {describe, expect, test} from 'vitest'

import {type InterfaceArtifact, viewArtifacts} from '../artifact.js'

// Test stub for the build-supplied `resolveImport` — turns an app `src` into a
// specifier relative to the artifact. The emitter only threads it through
// `JSON.stringify`, so the exact resolver shape isn't what these tests pin.
const resolveImport = (src: string) => `../../${src.replace('./', '')}`

const view = (overrides: Partial<InterfaceArtifact> = {}): InterfaceArtifact => ({
  name: 'feed',
  src: './src/feed.tsx',
  surface: 'panel',
  ...overrides,
})

describe('viewArtifacts', () => {
  test('expands a multi-component surface into one artifact per component', () => {
    const artifacts = viewArtifacts([view({name: 'feed', surface: 'panel'})])
    expect(artifacts.map((artifact) => artifact.expose)).toEqual([
      './views/feed/title',
      './views/feed/panel',
    ])
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      'views/feed/title.js',
      'views/feed/panel.js',
    ])
  })

  // Binding is the one part that varies per component: each artifact must select
  // its own component (or the bare function) as the App the render contract renders.
  test('binds each component of a surface as its own App', () => {
    const [title, panel] = viewArtifacts([view({name: 'feed', surface: 'panel'})])
    expect(title.source({resolveImport})).toContain(
      `const App = typeof view.components === 'function' ? view.components : view.components["title"]`,
    )
    expect(panel.source({resolveImport})).toContain(
      `const App = typeof view.components === 'function' ? view.components : view.components["panel"]`,
    )
  })

  test('binds a single-component surface without special-casing it', () => {
    const [tile] = viewArtifacts([view({name: 'feed', surface: 'tile'})])
    expect(tile.source({resolveImport})).toContain(
      `const App = typeof view.components === 'function' ? view.components : view.components["tile"]`,
    )
  })

  // The harness body itself is pinned by render-remote's own snapshot; here we
  // only assert what the artifact emitter threads into it: the view import, the
  // version export, and an HMR boundary. The App binding is covered above.
  test('emits a render-contract module bound to the view behind an HMR boundary', () => {
    const [title] = viewArtifacts([view({name: 'feed', src: './src/feed.tsx', surface: 'panel'})])
    const source = title.source({resolveImport})
    expect(source).toContain('import view from "../../src/feed.tsx"')
    expect(source).toContain('export const version = view.version')
    expect(source).toContain('if (import.meta.hot)')
  })

  test('expands a single-component surface into a lone artifact', () => {
    const artifacts = viewArtifacts([view({name: 'browser', surface: 'asset_source'})])
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].expose).toBe('./views/browser/asset_source')
    expect(artifacts[0].path).toBe('views/browser/asset_source.js')
  })

  test('produces nothing for a surface that exposes no components', () => {
    expect(viewArtifacts([view({surface: 'window'})])).toEqual([])
  })

  test('expands many views, preserving order', () => {
    const artifacts = viewArtifacts([
      view({name: 'feed', surface: 'tile'}),
      view({name: 'browser', surface: 'asset_source'}),
    ])
    expect(artifacts.map((artifact) => artifact.expose)).toEqual([
      './views/feed/tile',
      './views/browser/asset_source',
    ])
  })

  test('returns nothing for an empty view list', () => {
    expect(viewArtifacts([])).toEqual([])
  })
})
