import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {type ResolvedConfig} from 'vite'
import {afterEach, describe, expect, it} from 'vitest'

import {workbenchArtifacts} from '../../artifact.js'
import {sanityExtensionArtifacts} from './plugin-sanity-extension-artifacts.js'

const tmpRoots: string[] = []

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-artifacts-'))
  tmpRoots.push(root)
  return root
}

function runConfigResolved(
  plugin: ReturnType<typeof sanityExtensionArtifacts>,
  root: string,
): void {
  const hook = plugin.configResolved
  const handler = typeof hook === 'function' ? hook : hook?.handler
  handler?.call(
    // The plugin only reads `root` off the resolved config.
    {} as never,
    {root} as ResolvedConfig,
  )
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, {force: true, recursive: true})
  }
})

describe('sanityExtensionArtifacts', () => {
  it('emits one render-contract artifact per component of each view', () => {
    const root = makeRoot()
    runConfigResolved(
      sanityExtensionArtifacts({
        artifacts: workbenchArtifacts({
          views: [{name: 'feed', src: './src/panel.tsx', type: 'panel'}],
        }),
      }),
      root,
    )

    // A panel exposes `title` and `panel` — one island, one artifact each.
    const feedDir = path.join(root, '.sanity/federation/views/feed')
    expect(fs.readdirSync(feedDir).toSorted()).toEqual(['panel.js', 'title.js'])
  })

  it('binds each artifact to its component and exposes the island render', () => {
    const root = makeRoot()
    runConfigResolved(
      sanityExtensionArtifacts({
        artifacts: workbenchArtifacts({
          views: [{name: 'feed', src: './src/panel.tsx', type: 'panel'}],
        }),
      }),
      root,
    )

    const panel = fs.readFileSync(path.join(root, '.sanity/federation/views/feed/panel.js'), 'utf8')
    // From .sanity/federation/views/feed/panel.js back up to <root>/src/panel.tsx.
    expect(panel).toContain('import view from "../../../../src/panel.tsx"')
    expect(panel).toContain('view.components["panel"]')
    expect(panel).toContain('export function render(rootElement, props')
    // The artifact is its own HMR boundary so view edits hot-reload in place
    // instead of triggering a full page reload.
    expect(panel).toContain('import.meta.hot.accept')

    const title = fs.readFileSync(path.join(root, '.sanity/federation/views/feed/title.js'), 'utf8')
    expect(title).toContain('view.components["title"]')
  })

  it('writes both halves of a generated dock item: its source and its render artifact', () => {
    const root = makeRoot()
    runConfigResolved(
      sanityExtensionArtifacts({
        artifacts: workbenchArtifacts({
          views: [
            {
              generated: true,
              metadata: {group: 'dock.user'},
              name: 'drop-desk',
              src: './.sanity/federation/interfaces/dock-item.js',
              type: 'dock_item',
            },
          ],
        }),
      }),
      root,
    )

    const source = fs.readFileSync(
      path.join(root, '.sanity/federation/interfaces/dock-item.js'),
      'utf8',
    )
    expect(source).toContain('components: () => null')

    const item = fs.readFileSync(
      path.join(root, '.sanity/federation/views/drop-desk/item.js'),
      'utf8',
    )
    expect(item).toContain('import view from "../../interfaces/dock-item.js"')
  })

  it('writes nothing when no views are declared', () => {
    const root = makeRoot()
    runConfigResolved(sanityExtensionArtifacts({artifacts: workbenchArtifacts({views: []})}), root)
    expect(fs.existsSync(path.join(root, '.sanity/federation/views'))).toBe(false)
  })

  it('emits a worker bundle and loader for each service', () => {
    const root = makeRoot()
    runConfigResolved(
      sanityExtensionArtifacts({
        artifacts: workbenchArtifacts({
          services: [{name: 'unread', src: './src/service.ts', type: 'worker'}],
          views: [],
        }),
      }),
      root,
    )

    const dir = path.join(root, '.sanity/federation/services/unread')
    expect(fs.readdirSync(dir).toSorted()).toEqual(['index.js', 'worker.js'])

    const worker = fs.readFileSync(path.join(dir, 'worker.js'), 'utf8')
    // The worker imports the user's src, runs it with its `service`
    // declaration, and listens for the host's terminate message.
    expect(worker).toContain('import service from "../../../../src/service.ts"')
    expect(worker).toContain('service.run({ service: SERVICE })')
    expect(worker).toContain('workbench.worker.terminate')

    const loader = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')
    // The loader hands the host the worker bundle's URL via Vite's `?worker&url`;
    // the host bootstraps a worker that imports it.
    expect(loader).toContain('./worker.js?worker&url')
    expect(loader).toContain('export const url')
  })
})
