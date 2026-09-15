import {describe, expect, test} from 'vitest'

import {type InterfaceArtifact, viewArtifacts} from './artifact.js'

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

  test.each([false, true])(
    'preserves the view entry contract with style isolation %s',
    (isolateStyles) => {
      const [title] = viewArtifacts([view()])
      const source = title.source({isolateStyles, resolveImport})
      expect(source).toContain('import view from "../../src/feed.tsx"')
      expect(source).toContain('export const version = view.version')
      expect(source).toContain('import.meta.hot.accept(')
      expect(source.includes("import { StyleSheetManager } from 'styled-components'")).toBe(
        isolateStyles,
      )
    },
  )

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
