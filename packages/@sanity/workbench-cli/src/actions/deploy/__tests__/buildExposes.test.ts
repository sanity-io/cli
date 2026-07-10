import {describe, expect, test} from 'vitest'

import {type WorkbenchExposes} from '../../../resolveWorkbenchApp.js'
import {buildExposes, summarizeExposes} from '../buildExposes.js'

const context = {
  appName: 'drop-desk',
  appTitle: 'Drop Desk',
  exposesAppView: true,
  version: '1.2.3',
}

describe('buildExposes', () => {
  test('maps the app view, views, and services to Brett interface records', () => {
    const exposes: WorkbenchExposes = {
      services: [{name: 'unread', src: './src/unread.ts', title: 'Unread', type: 'worker'}],
      views: [{name: 'feed', src: './src/feed.tsx', title: 'Feed', type: 'panel'}],
    }

    expect(buildExposes(exposes, context)).toEqual([
      {moduleId: 'App', name: 'drop-desk', title: 'Drop Desk', type: 'app', version: '1.2.3'},
      {moduleId: 'views/feed', name: 'feed', title: 'Feed', type: 'panel', version: '1.2.3'},
      {
        moduleId: 'services/unread',
        name: 'unread',
        title: 'Unread',
        type: 'worker',
        version: '1.2.3',
      },
    ])
  })

  test('builds remote-relative moduleIds (no app-name prefix)', () => {
    const exposes: WorkbenchExposes = {
      services: [{name: 'unread', src: './src/unread.ts', type: 'worker'}],
      views: [{name: 'feed', src: './src/feed.tsx', type: 'panel'}],
    }
    expect(buildExposes(exposes, context).map((record) => record.moduleId)).toEqual([
      'App',
      'views/feed',
      'services/unread',
    ])
  })

  test('omits the app view when the build does not expose one', () => {
    const records = buildExposes({}, {...context, exposesAppView: false})
    expect(records).toEqual([])
  })

  test('falls back to the interface name when no title is declared', () => {
    const exposes: WorkbenchExposes = {
      views: [{name: 'feed', src: './src/feed.tsx', type: 'panel'}],
    }
    expect(buildExposes(exposes, {...context, exposesAppView: false})[0]).toMatchObject({
      name: 'feed',
      title: 'feed',
    })
  })

  test('forwards the declared type unchanged for the server to validate', () => {
    const exposes: WorkbenchExposes = {
      views: [{name: 'feed', src: './src/feed.tsx', type: 'panel'}],
    }
    expect(buildExposes(exposes, {...context, exposesAppView: false})[0]?.type).toBe('panel')
  })
})

describe('summarizeExposes', () => {
  test('returns views-then-services records with a report line per group', () => {
    const {exposes, lines} = summarizeExposes({
      services: [{name: 'sync', src: './src/sync.ts', type: 'worker'}],
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
    expect(summarizeExposes({})).toEqual({exposes: [], lines: []})
  })
})
