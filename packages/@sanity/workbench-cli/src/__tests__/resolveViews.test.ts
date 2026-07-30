import {describe, expect, test} from 'vitest'

import {resolveViews} from '../resolveViews.js'

const app = {name: 'drop-desk', title: 'Drop Desk'}
const dockItem = {name: 'dock', src: './src/dockItem.tsx', type: 'dock_item'} as const
const panel = {name: 'feed', src: './src/Feed.tsx', type: 'panel'} as const

describe('resolveViews', () => {
  test('leaves an app that says nothing about the dock without a dock item', () => {
    expect(resolveViews(app)).toEqual([])
    expect(resolveViews({...app, views: [panel]})).toEqual([panel])
  })

  test('generates a dock item from the declared placement', () => {
    expect(resolveViews({...app, group: 'dock.system', priority: 20})).toEqual([
      {
        generated: true,
        metadata: {group: 'dock.system', priority: 20},
        name: 'drop-desk',
        src: './.sanity/federation/interfaces/dock-item.js',
        type: 'dock_item',
      },
    ])
  })

  test('generates one from either half of the placement on its own', () => {
    expect(resolveViews({...app, group: 'dock.user'})[0]?.metadata).toEqual({group: 'dock.user'})
    // 0 is a real priority, not an absent one.
    expect(resolveViews({...app, priority: 0})[0]?.metadata).toEqual({priority: 0})
  })

  test('carries the placement on a declared dock item instead of generating one', () => {
    expect(resolveViews({...app, priority: 5, views: [panel, dockItem]})).toEqual([
      panel,
      {...dockItem, metadata: {priority: 5}},
    ])
  })

  test('a declared dock item needs no placement', () => {
    expect(resolveViews({...app, views: [{...dockItem, title: 'Inbox'}]})).toEqual([
      {...dockItem, metadata: {}, title: 'Inbox'},
    ])
  })
})
