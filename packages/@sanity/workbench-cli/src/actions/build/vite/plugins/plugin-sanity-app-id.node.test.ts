import {expect, test, vi} from 'vitest'

import {SANITY_APP_ID_FILE} from '../../../../appId.js'
import {sanityAppId} from './plugin-sanity-app-id.js'

test('defines the app id for the pipeline and for dev dep pre-bundling', () => {
  const plugin = sanityAppId('favorites')
  const config = (plugin.config as () => Record<string, unknown>)()

  const define = {__SANITY_APP_ID__: '"favorites"'}
  expect(config).toEqual({
    define,
    optimizeDeps: {rolldownOptions: {transform: {define}}},
  })
})

test('emits the id to disk once so `sanity start` can read it back', () => {
  const plugin = sanityAppId('favorites')
  const generateBundle = plugin.generateBundle as (this: {emitFile: unknown}) => void
  const emitFile = vi.fn()

  // Vite calls generateBundle per output; the id must be emitted exactly once.
  generateBundle.call({emitFile})
  generateBundle.call({emitFile})

  expect(emitFile).toHaveBeenCalledTimes(1)
  expect(emitFile).toHaveBeenCalledWith({
    fileName: SANITY_APP_ID_FILE,
    source: 'favorites',
    type: 'asset',
  })
})
