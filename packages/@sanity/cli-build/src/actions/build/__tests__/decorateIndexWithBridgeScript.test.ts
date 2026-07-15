import {afterEach, describe, expect, test, vi} from 'vitest'

import {decorateIndexWithBridgeScript} from '../decorateIndexWithBridgeScript'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('decorateIndexWithBridgeScript', () => {
  test('injects an async module bridge script before </head>', () => {
    const html =
      '<html><head></head><body><script async src="/.sanity/runtime/app.js" type="module"></script></body></html>'

    const result = decorateIndexWithBridgeScript(html)
    const bridgeScript = result.match(/<script\b[^>]*data-sanity-core[^>]*>/)?.[0]

    expect(bridgeScript).toBeDefined()
    expect(bridgeScript).toContain('async')
    expect(bridgeScript).toContain('type="module"')
    expect(bridgeScript).toContain('https://core.sanity-cdn.com/bridge.js')
  })

  test('uses the staging CDN when SANITY_INTERNAL_ENV is not production', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')

    const result = decorateIndexWithBridgeScript('<html><head></head><body></body></html>')

    expect(result).toContain('https://core.sanity-cdn.work/bridge.js')
  })
})
