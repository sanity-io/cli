import {describe, expect, test} from 'vitest'

import {sanityAsyncModuleScriptsPlugin} from '../plugin-sanity-async-module-scripts'

describe('sanityAsyncModuleScriptsPlugin', () => {
  const plugin = sanityAsyncModuleScriptsPlugin()
  const transform = plugin.transformIndexHtml
  if (!transform || typeof transform === 'function' || !('handler' in transform)) {
    throw new Error('expected transformIndexHtml handler object')
  }
  const handler = transform.handler as (html: string) => string

  test('adds async to module scripts that lack it', () => {
    const html =
      '<script type="module">import "/@react-refresh"</script><script src="/app.js" type="module"></script>'

    expect(handler(html)).toBe(
      '<script async type="module">import "/@react-refresh"</script><script async src="/app.js" type="module"></script>',
    )
  })

  test('leaves already-async module scripts unchanged', () => {
    const html = '<script async src="https://core.sanity-cdn.com/bridge.js" type="module"></script>'

    expect(handler(html)).toBe(html)
  })

  test('does not modify classic or non-module scripts', () => {
    const html =
      '<script>globalThis.__SANITY_STAGING__ = true</script><script type="application/json" id="x"></script>'

    expect(handler(html)).toBe(html)
  })
})
