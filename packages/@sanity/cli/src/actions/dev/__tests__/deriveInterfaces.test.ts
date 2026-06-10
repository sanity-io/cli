import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {deriveInterfaces} from '../deriveInterfaces.js'
import {workbenchApp} from './testHelpers.js'

describe('deriveInterfaces', () => {
  test('returns undefined for a non-branded app (no unstable_defineApp)', () => {
    expect(deriveInterfaces({title: 'Plain'} as CliConfig['app'], {isApp: true})).toBeUndefined()
    expect(deriveInterfaces(undefined, {isApp: true})).toBeUndefined()
  })

  test('maps views to panel interfaces', () => {
    const app = workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]})
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'},
    ])
  })

  test('derives an app interface from entry for an SDK app', () => {
    const app = workbenchApp({entry: './src/App.tsx', name: 'my-app'})
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/App.tsx', interface_type: 'app', name: 'my-app'},
    ])
  })

  test('omits the app interface for a dock-only app (no entry)', () => {
    const app = workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]})
    const result = deriveInterfaces(app, {isApp: true})
    expect(result?.some((iface) => iface.interface_type === 'app')).toBe(false)
  })

  test('combines views and the app view (in that order)', () => {
    const app = workbenchApp({
      entry: './src/App.tsx',
      name: 'my-app',
      views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}],
    })
    expect(deriveInterfaces(app, {isApp: true})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'},
      {entry_point: './src/App.tsx', interface_type: 'app', name: 'my-app'},
    ])
  })

  test('rejects a studio that declares entry (FR-026)', () => {
    const app = workbenchApp({entry: './src/App.tsx'})
    expect(() => deriveInterfaces(app, {isApp: false})).toThrow(
      'App views for studios are not implemented yet',
    )
  })

  test('a studio without entry still derives its panels', () => {
    const app = workbenchApp({views: [{name: 'feed', src: './src/FeedPanel.tsx', type: 'panel'}]})
    expect(deriveInterfaces(app, {isApp: false})).toEqual([
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'},
    ])
  })
})
