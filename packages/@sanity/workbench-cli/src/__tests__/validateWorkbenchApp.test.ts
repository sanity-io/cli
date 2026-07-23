import {describe, expect, test} from 'vitest'

import {validateWorkbenchApp} from '../validateWorkbenchApp.js'

const panel = {name: 'feed', src: './src/Feed.tsx', type: 'panel'}
const worker = {name: 'sync', src: './src/sync.ts', type: 'worker'}

describe('validateWorkbenchApp', () => {
  test.each([
    ['no interfaces', {}],
    ['an app entry only', {entry: './src/App.tsx'}],
    ['a single panel view', {views: [panel]}],
    ['services only', {services: [worker]}],
    ['an app entry with services', {entry: './src/App.tsx', services: [worker]}],
    ['a panel view with services', {services: [worker], views: [panel]}],
  ])('accepts %s', (_label, app) => {
    expect(() => validateWorkbenchApp(app)).not.toThrow()
  })

  test('rejects an app that declares both an entry and panel views', () => {
    expect(() => validateWorkbenchApp({entry: './src/App.tsx', views: [panel]})).toThrow(
      'cannot expose both an app view (`entry`) and panel views',
    )
  })

  test('rejects more than one panel view', () => {
    expect(() =>
      validateWorkbenchApp({
        views: [panel, {name: 'inbox', src: './src/Inbox.tsx', type: 'panel'}],
      }),
    ).toThrow('at most one panel view')
  })

  test('rejects a panel view whose name breaks the pattern', () => {
    expect(() => validateWorkbenchApp({views: [{...panel, name: 'views/feed'}]})).toThrow(
      /views\.0\.name: View `name` must match/,
    )
  })

  test('rejects an unknown view type', () => {
    expect(() => validateWorkbenchApp({views: [{...panel, type: 'sidebar'}]})).toThrow(/^views\.0/)
  })

  test('rejects a panel view missing its src', () => {
    expect(() => validateWorkbenchApp({views: [{name: 'feed', type: 'panel'}]})).toThrow(
      /^views\.0/,
    )
  })

  test('rejects a service whose name breaks the pattern', () => {
    expect(() => validateWorkbenchApp({services: [{...worker, name: 'services/sync'}]})).toThrow(
      /services\.0\.name: Service `name` must match/,
    )
  })

  test('rejects duplicate service names', () => {
    expect(() =>
      validateWorkbenchApp({services: [worker, {...worker, src: './src/other.ts'}]}),
    ).toThrow(/Service `name` must be unique/)
  })

  test('rejects a non-string entry', () => {
    expect(() => validateWorkbenchApp({entry: 42})).toThrow('entry: must be a module path string')
  })

  test.each([
    ['views', {views: 'nope'}],
    ['services', {services: {}}],
  ])('rejects %s that is not an array', (field, app) => {
    expect(() => validateWorkbenchApp(app)).toThrow(`${field}: must be an array`)
  })
})
