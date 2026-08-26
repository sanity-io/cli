import {describe, expect, test} from 'vitest'

import {summarizeInterfaces} from '../summarizeInterfaces.js'

describe('summarizeInterfaces', () => {
  test('returns the records per kind with a report line per group', () => {
    const {lines, services, views} = summarizeInterfaces({
      views: [{name: 'feed', src: './src/feed.tsx', title: 'Feed', type: 'panel'}],
      webWorkers: [{name: 'sync', src: './src/sync.ts', title: 'sync', type: 'worker'}],
    })

    expect(views).toEqual([{name: 'feed', src: './src/feed.tsx', title: 'Feed', type: 'panel'}])
    expect(services).toEqual([{name: 'sync', src: './src/sync.ts', title: 'sync', type: 'worker'}])
    expect(lines).toEqual([
      'Views:\n  Feed (feed): ./src/feed.tsx',
      'Web workers:\n  sync: ./src/sync.ts',
    ])
  })

  test('is empty when nothing is declared', () => {
    expect(summarizeInterfaces({})).toEqual({lines: [], services: [], views: []})
  })
})
