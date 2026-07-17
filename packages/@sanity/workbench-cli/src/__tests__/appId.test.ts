import {describe, expect, test} from 'vitest'

import {type BuildAppIdentity, resolveAppId} from '../appId.js'

describe('resolveAppId', () => {
  const app: BuildAppIdentity = {
    entry: './src/App.tsx',
    exposes: {
      services: [{name: 'unread', src: './src/worker.ts', type: 'worker'}],
      views: [{name: 'feed', src: './src/feed.tsx', type: 'panel'}],
    },
    name: 'drop-desk',
    organizationId: 'org-1',
  }

  test('dev: the host and port the server bound', () => {
    expect(resolveAppId({host: 'localhost', port: 3333})).toBe('localhost-3333')
    expect(resolveAppId({host: '0.0.0.0', port: 8080})).toBe('0.0.0.0-8080')
  })

  test('build: deterministic for the same declared shape', () => {
    expect(resolveAppId({app})).toBe(resolveAppId({app}))
  })

  test('build: ignores interface order', () => {
    const reordered: BuildAppIdentity = {
      ...app,
      exposes: {
        views: [
          {name: 'b', src: './b.tsx', type: 'panel'},
          {name: 'a', src: './a.tsx', type: 'panel'},
        ],
      },
    }
    const forward: BuildAppIdentity = {
      ...app,
      exposes: {
        views: [
          {name: 'a', src: './a.tsx', type: 'panel'},
          {name: 'b', src: './b.tsx', type: 'panel'},
        ],
      },
    }
    expect(resolveAppId({app: reordered})).toBe(resolveAppId({app: forward}))
  })

  test('build: changes when the declared shape changes', () => {
    expect(resolveAppId({app})).not.toBe(resolveAppId({app: {...app, name: 'other'}}))
    expect(resolveAppId({app})).not.toBe(resolveAppId({app: {...app, organizationId: 'org-2'}}))
    expect(resolveAppId({app})).not.toBe(resolveAppId({app: {...app, entry: './src/Other.tsx'}}))
    expect(resolveAppId({app})).not.toBe(
      resolveAppId({
        app: {...app, exposes: {views: [{name: 'feed', src: './moved.tsx', type: 'panel'}]}},
      }),
    )
  })

  test('build: never collides with a dev host-port', () => {
    const id = resolveAppId({app})
    expect(id).not.toBe(resolveAppId({host: 'localhost', port: 3333}))
    expect(id).not.toContain('-')
  })
})
