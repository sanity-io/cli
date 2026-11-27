import {isStaging} from '@sanity/cli-core/util'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {getApiPreconnectOrigin} from '../getApiPreconnectOrigin.js'

vi.mock('@sanity/cli-core/util', () => ({
  isStaging: vi.fn(),
}))

const mockIsStaging = vi.mocked(isStaging)

beforeEach(() => {
  vi.resetAllMocks()
  mockIsStaging.mockReturnValue(false)
})

describe('getApiPreconnectOrigin', () => {
  test('uses the production project hostname by default', () => {
    expect(getApiPreconnectOrigin({projectId: 'abc123'})).toBe('https://abc123.api.sanity.io')
  })

  test('uses the staging project hostname when building for staging', () => {
    mockIsStaging.mockReturnValue(true)
    expect(getApiPreconnectOrigin({projectId: 'abc123'})).toBe('https://abc123.api.sanity.work')
  })

  test('prefixes a configured apiHost, keeping its scheme and port', () => {
    expect(getApiPreconnectOrigin({apiHost: 'https://api.example.com/', projectId: 'abc123'})).toBe(
      'https://abc123.api.example.com',
    )
    expect(
      getApiPreconnectOrigin({apiHost: 'http://api.sanity.local:50002', projectId: 'abc123'}),
    ).toBe('http://abc123.api.sanity.local:50002')
  })

  test('prefers a configured apiHost over the staging default', () => {
    mockIsStaging.mockReturnValue(true)
    expect(getApiPreconnectOrigin({apiHost: 'https://api.example.com', projectId: 'abc123'})).toBe(
      'https://abc123.api.example.com',
    )
  })

  test.each([
    ['no api config', undefined],
    ['no project ID', {}],
    ['a non-string project ID', {projectId: 42}],
    ['an empty project ID', {projectId: ''}],
    ['a project ID with a dot', {projectId: 'abc.def'}],
    ['a project ID with a slash', {projectId: 'abc/def'}],
    ['a project ID with markup', {projectId: '"><script>'}],
    ['an unparseable apiHost', {apiHost: 'not a url', projectId: 'abc123'}],
    ['a non-http apiHost', {apiHost: 'ftp://api.example.com', projectId: 'abc123'}],
  ])('returns no origin for %s', (_name, api) => {
    expect(getApiPreconnectOrigin(api)).toBeUndefined()
  })

  test('ignores a non-string apiHost', () => {
    expect(getApiPreconnectOrigin({apiHost: 42, projectId: 'abc123'})).toBe(
      'https://abc123.api.sanity.io',
    )
  })
})
