import {describe, expect, test} from 'vitest'

import {toWorkbenchPayload} from '../deployPayload.js'
import {type DeployableWorkbenchApp} from '../getWorkbench.js'

const views = [{name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'}]
const app = (overrides: Record<string, unknown> = {}) =>
  ({slug: 'my-app', ...overrides}) as unknown as DeployableWorkbenchApp
const none = {interfaces: null, title: 'My app'}

describe('toWorkbenchPayload', () => {
  test('contributes nothing for a plain app', () => {
    expect(toWorkbenchPayload(null, none)).toEqual({})
  })

  test('always carries the locally declared slug and title', () => {
    expect(toWorkbenchPayload(app(), none)).toEqual({slug: 'my-app', title: 'My app'})
  })

  test('omits both interface lists when the app declares neither', () => {
    const payload = toWorkbenchPayload(app(), {...none, interfaces: {services: [], views: []}})
    expect(payload).not.toHaveProperty('views')
    expect(payload).not.toHaveProperty('services')
  })

  test('reports both interface lists when either kind is declared', () => {
    expect(toWorkbenchPayload(app(), {...none, interfaces: {services: [], views}})).toMatchObject({
      services: [],
      views,
    })
  })

  test('carries the optional workbench fields only when set', () => {
    expect(
      toWorkbenchPayload(app({isSingleton: false, visibility: 'unlisted'}), {
        ...none,
        config: 'Media library fields:\n  Title (title)',
      }),
    ).toMatchObject({
      config: 'Media library fields:\n  Title (title)',
      isSingleton: false,
      visibility: 'unlisted',
    })
  })
})
