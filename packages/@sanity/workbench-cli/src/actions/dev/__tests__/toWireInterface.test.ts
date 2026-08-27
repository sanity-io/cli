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
  test.each(['app', 'panel', 'asset_source', 'tile'] as const)(
    'renames a %s view surface to type',
    (surface) => {
      const result = toWireInterface({...base, metadata: null, surface} as DevServerInterface)

      expect(result).toMatchObject({name: 'feed', type: surface})
      expect(result).not.toHaveProperty('surface')
    },
  )

  test('carries the rest of the interface across untouched', () => {
    const metadata = {dock: {group: 'dock.system', order: 2}}
    const result = toWireInterface({...base, metadata, surface: 'panel'} as DevServerInterface)

    expect(result).toEqual({...base, metadata, type: 'panel'})
  })

  test('passes a worker through unchanged (already keyed on type)', () => {
    const worker = {...base, metadata: null, type: 'worker'} as DevServerInterface

    expect(toWireInterface(worker)).toEqual(worker)
  })
})
