import {describe, expect, test} from 'vitest'

import {viewArtifacts} from '../artifact.js'

const context = {resolveImport: (src: string) => `../../${src}`}

describe('viewArtifacts', () => {
  test('expands a panel into one exposed artifact per component slot', () => {
    const artifacts = viewArtifacts([{name: 'feed', src: './src/Feed.tsx', type: 'panel'}])

    expect(artifacts.map((artifact) => [artifact.expose, artifact.path])).toEqual([
      ['./views/feed/title', 'views/feed/title.js'],
      ['./views/feed/panel', 'views/feed/panel.js'],
    ])
    expect(artifacts[0]?.source(context)).toContain('import view from "../.././src/Feed.tsx"')
  })

  test('renders a declared dock item from its source, generating nothing', () => {
    const artifacts = viewArtifacts([{name: 'dock', src: './src/dockItem.tsx', type: 'dock_item'}])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.expose).toBe('./views/dock/item')
    expect(artifacts[0]?.source(context)).toContain('import view from "../.././src/dockItem.tsx"')
  })

  test('writes the source of a generated dock item, so it loads like any other view', () => {
    const [source, render] = viewArtifacts([
      {
        generated: true,
        name: 'drop-desk',
        src: './.sanity/federation/interfaces/dock-item.js',
        type: 'dock_item',
      },
    ])

    // The module the render artifact imports renders the host's own dock item,
    // and nothing at all against a host that offers none.
    expect(source?.path).toBe('interfaces/dock-item.js')
    expect(source?.expose).toBeUndefined()
    expect(source?.source(context)).toContain('(props) => props.renderDefault?.() ?? null')
    expect(render?.source(context)).toContain(
      'import view from "../.././.sanity/federation/interfaces/dock-item.js"',
    )
  })
})
