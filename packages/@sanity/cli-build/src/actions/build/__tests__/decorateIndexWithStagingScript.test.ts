import {afterEach, describe, expect, test, vi} from 'vitest'

import {decorateIndexWithStagingScript} from '../decorateIndexWithStagingScript'

const mockIsStaging = vi.hoisted(() => vi.fn<() => boolean>())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    isStaging: mockIsStaging,
  }
})

const sampleHtml = '<html><head><script src="app.js"></script></head><body></body></html>'

afterEach(() => {
  vi.clearAllMocks()
})

describe('decorateIndexWithStagingScript', () => {
  test('injects staging script when in staging environment', () => {
    mockIsStaging.mockReturnValue(true)

    const result = decorateIndexWithStagingScript(sampleHtml)

    expect(result).toContain('<head>\n<script>globalThis.__SANITY_STAGING__ = true</script>')
    expect(result).toContain('<script src="app.js"></script>')
  })

  test('staging script appears before other scripts in head', () => {
    mockIsStaging.mockReturnValue(true)

    const result = decorateIndexWithStagingScript(sampleHtml)

    const stagingIdx = result.indexOf('globalThis.__SANITY_STAGING__')
    const appIdx = result.indexOf('src="app.js"')
    expect(stagingIdx).toBeGreaterThan(-1)
    expect(stagingIdx).toBeLessThan(appIdx)
  })

  test('returns template unchanged when not staging', () => {
    mockIsStaging.mockReturnValue(false)

    const result = decorateIndexWithStagingScript(sampleHtml)

    expect(result).toBe(sampleHtml)
    expect(result).not.toContain('__SANITY_STAGING__')
  })

  test('handles head tag with attributes', () => {
    mockIsStaging.mockReturnValue(true)

    const html = '<html><head lang="en"><script src="app.js"></script></head></html>'
    const result = decorateIndexWithStagingScript(html)

    expect(result).toContain(
      '<head lang="en">\n<script>globalThis.__SANITY_STAGING__ = true</script>',
    )
  })
})
