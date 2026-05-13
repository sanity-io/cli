import {describe, expect, test} from 'vitest'

import {
  collectContextValues,
  formatMalformedQueryError,
  formatMethodNotAllowedError,
  formatNoMatchError,
  formatPreflightError,
  suggestSimilarEndpoints,
} from '../errors.js'
import {type OperationIndexEntry} from '../parser.js'

/**
 * Hand-built operation index entry just rich enough for the error
 * formatters. `parser.test.ts` covers real parsing; these tests verify
 * the data → prose translation in isolation.
 */
function makeOp(over: Partial<OperationIndexEntry> = {}): OperationIndexEntry {
  return {
    capability: 'read',
    description: '',
    endpoint: 'v2021-06-07/jobs/:jobId',
    headerParams: [],
    isStreaming: false,
    method: 'GET',
    openApiPath: '/jobs/{jobId}',
    operationId: 'jobStatus',
    pathParams: [],
    queryParams: [],
    requestBody: null,
    responses: [],
    security: [],
    serverTemplate: 'https://api.sanity.io/v2021-06-07',
    spec: 'jobs',
    summary: '',
    ...over,
  }
}

describe('collectContextValues', () => {
  test('prefers flag values over env-var fallbacks', () => {
    process.env.SANITY_PROJECT_ID = 'env-project'
    try {
      expect(collectContextValues({projectId: 'flag-project'})).toEqual({
        projectId: 'flag-project',
      })
    } finally {
      delete process.env.SANITY_PROJECT_ID
    }
  })

  test('falls back to env vars when the flag is absent', () => {
    process.env.SANITY_PROJECT_ID = 'env-project'
    process.env.SANITY_DATASET = 'env-dataset'
    try {
      expect(collectContextValues({})).toMatchObject({
        dataset: 'env-dataset',
        projectId: 'env-project',
      })
    } finally {
      delete process.env.SANITY_PROJECT_ID
      delete process.env.SANITY_DATASET
    }
  })

  test('drops keys with no flag or env value (does not emit empty strings)', () => {
    expect(collectContextValues({})).toEqual({})
  })
})

describe('formatPreflightError', () => {
  test('unfilled-placeholder includes the Resolved URL preview', () => {
    const op = makeOp({serverTemplate: 'https://:projectId.api.sanity.io/v2024-01-01'})
    const msg = formatPreflightError(
      {kind: 'unfilled-placeholder', names: ['projectId']},
      op,
      {},
      'v2024-01-01/jobs/abc',
    )
    // The Resolved-URL line is the whole point: subdomain placeholders
    // are invisible from the endpoint string the user typed.
    expect(msg).toContain('Resolved URL: https://:projectId.api.sanity.io/v2024-01-01/jobs/abc')
    expect(msg).toContain('--projectId=<value>')
    expect(msg).toContain('SANITY_PROJECT_ID')
  })

  test('unfilled-placeholder for non-context names hints at inline substitution', () => {
    const msg = formatPreflightError(
      {kind: 'unfilled-placeholder', names: ['jobId']},
      makeOp(),
      {},
      'v2021-06-07/jobs/:jobId',
    )
    expect(msg).toContain('substitute the value directly')
    // The example uses <name> bracket form so the user sees what to type.
    expect(msg).toContain('<jobId>')
  })

  test('missing-required-query routes to --query when GROQ is involved', () => {
    const msg = formatPreflightError(
      {kind: 'missing-required-query', names: ['query']},
      makeOp(),
      {},
      'v2021-06-07/jobs/abc',
    )
    expect(msg).toContain("--query '<groq>'")
    expect(msg).toContain('sanity api spec jobs --operation=jobStatus')
  })

  test('missing-required-query falls back to -q hint for non-GROQ params', () => {
    const msg = formatPreflightError(
      {kind: 'missing-required-query', names: ['otherParam']},
      makeOp(),
      {},
      'v2021-06-07/jobs/abc',
    )
    expect(msg).toContain('-q name=value')
    expect(msg).not.toContain('--query')
  })
})

describe('formatNoMatchError', () => {
  test('attaches fuzzy suggestions when the user path is close to a real one', () => {
    // Typo in the api-version segment is the canonical case.
    const index = [
      makeOp({endpoint: 'v2025-02-19/data/query/:dataset'}),
      makeOp({endpoint: 'v2025-02-19/data/listen/:dataset'}),
    ]
    const msg = formatNoMatchError('v2024-01-01/data/query/production', index)
    expect(msg).toContain('Did you mean:')
    expect(msg).toContain('v2025-02-19/data/query/:dataset')
  })

  test('omits the Did-you-mean line when nothing is close enough', () => {
    // Short user path → tight length-relative threshold (max(2, ⌊len/6⌋)).
    // Three drastically different segments score well over that.
    const msg = formatNoMatchError('xx', [makeOp({endpoint: 'v2025-02-19/data/query/:dataset'})])
    expect(msg).not.toContain('Did you mean')
  })
})

describe('formatMethodNotAllowedError', () => {
  test('lists the available methods so the user can pick another', () => {
    const msg = formatMethodNotAllowedError('PUT', 'v2021-06-07/jobs/abc', ['GET', 'DELETE'])
    expect(msg).toContain('PUT not allowed')
    expect(msg).toContain('Available: GET, DELETE')
  })
})

describe('formatMalformedQueryError', () => {
  test('quotes the malformed pair the user passed', () => {
    const msg = formatMalformedQueryError('foo')
    expect(msg).toContain('"foo"')
    expect(msg).toContain('key=value')
  })
})

describe('suggestSimilarEndpoints', () => {
  test('placeholders match user values with zero distance cost', () => {
    // User passed a value where the template has `:dataset` — that
    // shouldn't register as a typo against the placeholder.
    const result = suggestSimilarEndpoints('v2025-02-19/data/query/production', [
      makeOp({endpoint: 'v2025-02-19/data/query/:dataset'}),
    ])
    expect(result).toEqual(['v2025-02-19/data/query/:dataset'])
  })

  test('returns nothing for an empty path or empty index', () => {
    expect(suggestSimilarEndpoints('', [makeOp()])).toEqual([])
    expect(suggestSimilarEndpoints('something', [])).toEqual([])
  })

  test('caps to 3 suggestions even when more would fit the threshold', () => {
    const index = Array.from({length: 6}, (_, i) =>
      makeOp({endpoint: `v2025-02-19/data/${i}/:dataset`, operationId: `op${i}`}),
    )
    const result = suggestSimilarEndpoints('v2025-02-19/data/1/production', index)
    expect(result.length).toBeLessThanOrEqual(3)
  })
})
