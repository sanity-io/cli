import {describe, expect, test, vi} from 'vitest'

import {deferModuleScripts} from '../deferModuleScripts.js'

const html = [
  '<!DOCTYPE html><html><head>',
  '<script>globalThis.__SANITY_STAGING__ = true</script>',
  '<link rel="modulepreload" href="/static/chunk.js">',
  '<script src="https://core.sanity-cdn.com/bridge.js" async type="module" data-sanity-core></script>',
  '</head><body><div id="sanity"></div>',
  '<script src="/static/sanity-abc.js" type="module"></script>',
  '<script type="module">import "sanity"</script>',
  '<!-- kept -->',
  '</body></html>',
].join('')

describe('deferModuleScripts()', () => {
  const deferred = deferModuleScripts(html, {entryPath: '/static/sanity-abc.js'})

  test('makes every module script inert', () => {
    expect(deferred).not.toContain('type="module"')
    expect(deferred).toContain(
      '<script src="https://core.sanity-cdn.com/bridge.js" async type="sanity/deferred-module" data-sanity-core></script>',
    )
    expect(deferred).toContain('<script type="sanity/deferred-module">import "sanity"</script>')
  })

  test('marks only the studio entry script', () => {
    expect(deferred).toContain(
      '<script src="/static/sanity-abc.js" type="sanity/deferred-module" data-sanity-entry></script>',
    )
    expect(deferred.match(/data-sanity-entry/g)).toHaveLength(1)
  })

  test('makes modulepreloads inert', () => {
    expect(deferred).toContain('<link rel="sanity-deferred-modulepreload" href="/static/chunk.js">')
  })

  test('leaves classic scripts, the doctype and comments alone', () => {
    expect(deferred).toMatch(/^<!DOCTYPE html>/)
    expect(deferred).toContain('<script>globalThis.__SANITY_STAGING__ = true</script>')
    expect(deferred).toContain('<!-- kept -->')
  })

  test('calls onEntryNotFound when no script matches the entry path', () => {
    const onEntryNotFound = vi.fn()
    deferModuleScripts(html, {entryPath: '/static/does-not-exist.js', onEntryNotFound})
    expect(onEntryNotFound).toHaveBeenCalledOnce()
  })

  test('does not call onEntryNotFound when the entry path matches', () => {
    const onEntryNotFound = vi.fn()
    deferModuleScripts(html, {entryPath: '/static/sanity-abc.js', onEntryNotFound})
    expect(onEntryNotFound).not.toHaveBeenCalled()
  })
})
