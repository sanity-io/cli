import {describe, expect, test} from 'vitest'

import {type DevServerInterface} from '../deriveConfigs.js'
import {toWireInterface} from '../toWireInterface.js'

const base = {
  id: 'app-1-panel-feed',
  moduleId: 'views/feed',
  name: 'feed',
  src: './src/Feed.tsx',
  title: 'feed',
  version: '1',
}

describe('toWireInterface', () => {
  test.each([
    ['window', 'app'],
    ['panel', 'panel'],
    ['asset_source', 'asset_source'],
    ['tile', 'tile'],
  ] as const)('maps a %s view surface to the %s type', (surface, type) => {
    const result = toWireInterface({...base, metadata: null, surface} as DevServerInterface)

    expect(result).toMatchObject({name: 'feed', type})
    expect(result).not.toHaveProperty('surface')
  })

  test('carries the rest of the interface across untouched', () => {
    const metadata = {dock: {group: 'system', order: 2}}
    const result = toWireInterface({...base, metadata, surface: 'panel'} as DevServerInterface)

    expect(result).toStrictEqual({...base, metadata, type: 'panel'})
  })

  test('passes a worker through unchanged (already keyed on type)', () => {
    const worker = {...base, metadata: null, type: 'worker'} as DevServerInterface

    expect(toWireInterface(worker)).toStrictEqual(worker)
  })
})
