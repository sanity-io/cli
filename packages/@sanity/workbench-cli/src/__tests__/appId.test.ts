import {describe, expect, test} from 'vitest'

import {buildAppId} from '../appId.js'
import {type ResolvedWorkbenchApp} from '../resolveWorkbenchApp.js'

describe('buildAppId', () => {
  const app: ResolvedWorkbenchApp = {
    entry: './src/App.tsx',
    name: 'drop-desk',
    organizationId: 'org-1',
    slug: 'drop-desk',
    views: [{name: 'feed', src: './src/feed.tsx', title: 'feed', type: 'panel'}],
    webWorkers: [{name: 'unread', src: './src/worker.ts', title: 'unread', type: 'worker'}],
  }

  test('deterministic for the same declared shape', async () => {
    expect(await buildAppId(app)).toBe(await buildAppId(app))
  })

  test('ignores interface order', async () => {
    const reordered: ResolvedWorkbenchApp = {
      ...app,
      views: [
        {name: 'b', src: './b.tsx', title: 'b', type: 'panel'},
        {name: 'a', src: './a.tsx', title: 'a', type: 'panel'},
      ],
    }
    const forward: ResolvedWorkbenchApp = {
      ...app,
      views: [
        {name: 'a', src: './a.tsx', title: 'a', type: 'panel'},
        {name: 'b', src: './b.tsx', title: 'b', type: 'panel'},
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
      await buildAppId({
        ...app,
        views: [{name: 'feed', src: './moved.tsx', title: 'feed', type: 'panel'}],
      }),
    )
  })

  test('keys identity on name, not the slug address', async () => {
    // Renaming the address leaves identity untouched; only a distinct name shifts it.
    expect(await buildAppId({...app, slug: 'renamed-host'})).toBe(await buildAppId(app))
    expect(await buildAppId({...app, name: 'renamed'})).not.toBe(await buildAppId(app))
  })
})
