import {describe, expect, test} from 'vitest'

import {buildAppId, resolveAppId} from '../appId.js'
import {type ResolvedWorkbenchApp} from '../resolveWorkbenchApp.js'

describe('resolveAppId', () => {
  test('dev: the host and port the server bound', () => {
    expect(resolveAppId({host: 'localhost', port: 3333})).toBe('localhost-3333')
    expect(resolveAppId({host: '0.0.0.0', port: 8080})).toBe('0.0.0.0-8080')
  })
})

describe('buildAppId', () => {
  const app: ResolvedWorkbenchApp = {
    entry: './src/App.tsx',
    name: 'drop-desk',
    organizationId: 'org-1',
    services: [{name: 'unread', src: './src/worker.ts', type: 'worker'}],
    slug: 'drop-desk',
    views: [{name: 'feed', src: './src/feed.tsx', type: 'panel'}],
  }

  test('deterministic for the same declared shape', async () => {
    expect(await buildAppId(app)).toBe(await buildAppId(app))
  })

  test('ignores interface order', async () => {
    const reordered: ResolvedWorkbenchApp = {
      ...app,
      views: [
        {name: 'b', src: './b.tsx', type: 'panel'},
        {name: 'a', src: './a.tsx', type: 'panel'},
      ],
    }
    const forward: ResolvedWorkbenchApp = {
      ...app,
      views: [
        {name: 'a', src: './a.tsx', type: 'panel'},
        {name: 'b', src: './b.tsx', type: 'panel'},
      ],
    }
    expect(await buildAppId(reordered)).toBe(await buildAppId(forward))
  })

  test('changes when the declared shape changes', async () => {
    const base = await buildAppId(app)
    expect(base).not.toBe(await buildAppId({...app, name: 'other'}))
    expect(base).not.toBe(await buildAppId({...app, organizationId: 'org-2'}))
    expect(base).not.toBe(await buildAppId({...app, entry: './src/Other.tsx'}))
    expect(base).not.toBe(
      await buildAppId({...app, views: [{name: 'feed', src: './moved.tsx', type: 'panel'}]}),
    )
  })

  test('never collides with a dev host-port', async () => {
    const id = await buildAppId(app)
    expect(id).not.toBe(resolveAppId({host: 'localhost', port: 3333}))
    expect(id).not.toContain('-')
  })
})
