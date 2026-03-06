import {afterEach, describe, expect, test, vi} from 'vitest'

import {getSanityUrl} from '../getSanityUrl.js'

describe('getSanityUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('returns production domain with default path', () => {
    expect(getSanityUrl()).toBe('https://www.sanity.io/')
  })

  test('returns production domain with custom path', () => {
    expect(getSanityUrl('/docs/api')).toBe('https://www.sanity.io/docs/api')
  })

  test('returns staging domain when SANITY_INTERNAL_ENV is staging', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
    expect(getSanityUrl()).toBe('https://www.sanity.work/')
  })

  test('returns staging domain with custom path', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'staging')
    expect(getSanityUrl('/manage/project/abc')).toBe('https://www.sanity.work/manage/project/abc')
  })

  test('returns production domain when SANITY_INTERNAL_ENV is not staging', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')
    expect(getSanityUrl('/test')).toBe('https://www.sanity.io/test')
  })

  test('prepends leading slash when path is missing one', () => {
    expect(getSanityUrl('manage/project/foo')).toBe('https://www.sanity.io/manage/project/foo')
  })
})
