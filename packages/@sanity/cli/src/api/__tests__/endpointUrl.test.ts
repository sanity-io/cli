import {describe, expect, test} from 'vitest'

import {
  composeEndpointUrl,
  fillPlaceholders,
  findUnfilledEndpointPlaceholders,
  findUnfilledPlaceholders,
} from '../endpointUrl.js'

const HOST_ONLY = {serverTemplate: 'https://api.sanity.io/v2021-06-07'} as const
const HOST_WITH_PROJECT = {serverTemplate: 'https://:projectId.api.sanity.io/v2024-01-01'} as const

describe('composeEndpointUrl', () => {
  test('joins host + path and strips the api-version overlap', () => {
    // Both `serverTemplate` and the operation path carry `/v2021-06-07`;
    // the join must not double it up.
    expect(composeEndpointUrl(HOST_ONLY, 'v2021-06-07/jobs/abc123', {})).toBe(
      'https://api.sanity.io/v2021-06-07/jobs/abc123',
    )
  })

  test('substitutes :name placeholders from context', () => {
    expect(
      composeEndpointUrl(HOST_WITH_PROJECT, 'v2024-01-01/data/query/:dataset', {
        dataset: 'production',
        projectId: 'xyz',
      }),
    ).toBe('https://xyz.api.sanity.io/v2024-01-01/data/query/production')
  })

  test('leaves placeholders verbatim when context is missing the key', () => {
    // The Resolved-URL error preview relies on this: the user sees where
    // the missing value would have landed in the final URL.
    expect(composeEndpointUrl(HOST_WITH_PROJECT, 'v2024-01-01/data/query/production', {})).toBe(
      'https://:projectId.api.sanity.io/v2024-01-01/data/query/production',
    )
  })

  test('works on hosts whose subdomain contains an unfilled :name (URL() rejects this)', () => {
    // `new URL('https://:projectId.api.sanity.io/...')` throws because
    // `:` is not a legal hostname character; the plain-string join must
    // tolerate it so the error-rendering path can still preview the URL.
    const out = composeEndpointUrl(HOST_WITH_PROJECT, 'v2024-01-01/data/query/production', {
      dataset: 'production',
    })
    expect(out).toContain(':projectId')
  })

  test('does not strip a host-path prefix that only matches partially', () => {
    // Host path `/v1` vs operation path `/v10/...` — `/v1/` does NOT
    // prefix `/v10/`, so no strip happens.
    expect(
      composeEndpointUrl({serverTemplate: 'https://api.sanity.io/v1'}, 'v10/jobs/abc', {}),
    ).toBe('https://api.sanity.io/v1/v10/jobs/abc')
  })
})

describe('findUnfilledEndpointPlaceholders', () => {
  test('collects unfilled names from both host and path', () => {
    expect(
      findUnfilledEndpointPlaceholders(HOST_WITH_PROJECT, 'v2024-01-01/data/query/:dataset', {}),
    ).toEqual(expect.arrayContaining(['projectId', 'dataset']))
  })

  test('returns empty when context fills everything', () => {
    expect(
      findUnfilledEndpointPlaceholders(HOST_WITH_PROJECT, 'v2024-01-01/data/query/:dataset', {
        dataset: 'production',
        projectId: 'xyz',
      }),
    ).toEqual([])
  })

  test('deduplicates a placeholder that appears in both host and path', () => {
    // Contrived but possible: same name in both halves should appear once.
    expect(
      findUnfilledEndpointPlaceholders(
        {serverTemplate: 'https://:tenant.api.example.com'},
        '/orgs/:tenant',
        {},
      ),
    ).toEqual(['tenant'])
  })
})

describe('fillPlaceholders', () => {
  test('substitutes both `:name` and `{name}` forms', () => {
    expect(fillPlaceholders('a/:foo/b/{bar}', {bar: 'B', foo: 'A'})).toBe('a/A/b/B')
  })
})

describe('findUnfilledPlaceholders', () => {
  test('returns unique unfilled names', () => {
    expect(findUnfilledPlaceholders('a/:x/b/:x/c/:y')).toEqual(['x', 'y'])
  })
})
