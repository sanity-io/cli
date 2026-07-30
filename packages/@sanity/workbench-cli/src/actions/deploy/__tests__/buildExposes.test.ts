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
      {
        metadata: null,
        moduleId: 'App',
        name: 'drop-desk',
        title: 'Drop Desk',
        type: 'app',
        version: '1.2.3',
      },
      {
        metadata: null,
        moduleId: 'views/feed',
        name: 'feed',
        title: 'Feed',
        type: 'panel',
        version: '1.2.3',
      },
      {
        metadata: null,
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

  test("sends a dock item's placement as its metadata, under the app's deployed title", () => {
    const exposes: WorkbenchExposes = {
      views: [
        {
          generated: true,
          metadata: {group: 'dock.system', priority: 20},
          name: 'drop-desk',
          src: './.sanity/federation/interfaces/dock-item.js',
          type: 'dock_item',
        },
      ],
    }
    expect(buildExposes(exposes, {...context, exposesAppView: false})).toEqual([
      {
        metadata: {group: 'dock.system', priority: 20},
        moduleId: 'views/drop-desk',
        name: 'drop-desk',
        title: 'Drop Desk',
        type: 'dock_item',
        version: '1.2.3',
      },
    ])
  })

  test('keeps a declared dock item title over the app title', () => {
    const exposes: WorkbenchExposes = {
      views: [
        {metadata: {}, name: 'dock', src: './src/dockItem.tsx', title: 'Inbox', type: 'dock_item'},
      ],
    }
    expect(buildExposes(exposes, {...context, exposesAppView: false})[0]?.title).toBe('Inbox')
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

  test('reports a declared dock item, but not a generated one', () => {
    const declared = summarizeExposes({
      views: [{metadata: {}, name: 'dock', src: './src/dockItem.tsx', type: 'dock_item'}],
    })
    expect(declared.lines).toEqual(['Views:\n  dock: ./src/dockItem.tsx'])

    const generated = summarizeExposes({
      views: [
        {
          generated: true,
          metadata: {group: 'dock.user'},
          name: 'drop-desk',
          src: './.sanity/federation/interfaces/dock-item.js',
          type: 'dock_item',
        },
      ],
    })
    expect(generated).toEqual({exposes: [], lines: []})
  })
})
