import {expect, test} from 'vitest'

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
