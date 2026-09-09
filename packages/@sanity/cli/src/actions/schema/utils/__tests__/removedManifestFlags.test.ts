import {createMockOutput} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {warnOnRemovedManifestFlags} from '../removedManifestFlags'

describe('warnOnRemovedManifestFlags', () => {
  let output: ReturnType<typeof createMockOutput>

  beforeEach(() => {
    output = createMockOutput()
  })

  test('does not warn when no removed flags were passed', () => {
    warnOnRemovedManifestFlags({}, output)
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('warns naming --extract-manifest when it is passed', () => {
    warnOnRemovedManifestFlags({'extract-manifest': true}, output)
    expect(output.warn).toHaveBeenCalledTimes(1)
    const message = vi.mocked(output.warn).mock.calls[0][0]
    expect(message).toContain('--extract-manifest')
    expect(message).toContain('no longer has any effect')
  })

  test('warns naming --no-extract-manifest when the flag is negated', () => {
    warnOnRemovedManifestFlags({'extract-manifest': false}, output)
    expect(output.warn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(output.warn).mock.calls[0][0]).toContain('--no-extract-manifest')
  })

  test('warns naming --manifest-dir when it is passed', () => {
    warnOnRemovedManifestFlags({'manifest-dir': './dist/static'}, output)
    expect(output.warn).toHaveBeenCalledTimes(1)
    const message = vi.mocked(output.warn).mock.calls[0][0]
    expect(message).toContain('--manifest-dir')
    expect(message).toContain('no longer has any effect')
  })

  test('lists both flags and uses plural phrasing when both are passed', () => {
    warnOnRemovedManifestFlags({'extract-manifest': true, 'manifest-dir': './dist/static'}, output)
    expect(output.warn).toHaveBeenCalledTimes(1)
    const message = vi.mocked(output.warn).mock.calls[0][0]
    expect(message).toContain('--extract-manifest and --manifest-dir')
    expect(message).toContain('no longer have any effect')
  })
})
