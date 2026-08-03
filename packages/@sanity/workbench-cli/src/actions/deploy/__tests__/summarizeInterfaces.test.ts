import {describe, expect, test} from 'vitest'

import {summarizeInterfaces} from '../summarizeInterfaces.js'

describe('summarizeInterfaces', () => {
  test('returns views-then-services records with a report line per group', () => {
    const {exposes, lines} = summarizeInterfaces({
      services: [{name: 'sync', src: './src/sync.ts', title: 'sync', type: 'worker'}],
      views: [{name: 'feed', src: './src/feed.tsx', title: 'Feed', type: 'panel'}],
    })

    expect(exposes).toEqual([
      {name: 'feed', src: './src/feed.tsx', title: 'Feed', type: 'panel'},
      {name: 'sync', src: './src/sync.ts', title: 'sync', type: 'worker'},
    ])
    expect(lines).toEqual([
      'Views:\n  Feed (feed): ./src/feed.tsx',
      'Services:\n  sync: ./src/sync.ts',
    ])
  })

  test('is empty when nothing is exposed', () => {
    expect(summarizeInterfaces({})).toEqual({exposes: [], lines: []})
  })
})
