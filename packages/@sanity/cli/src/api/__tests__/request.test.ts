import {describe, expect, test} from 'vitest'

import {type OperationIndexEntry} from '../parser.js'
import {buildRequestUrl} from '../request.js'

function buildOp(
  overrides: {endpoint?: string; serverTemplate?: string} = {},
): OperationIndexEntry {
  return {
    capability: 'read',
    description: '',
    endpoint: overrides.endpoint ?? 'v2021-06-07/jobs/:jobId',
    headerParams: [],
    isStreaming: false,
    method: 'GET',
    operationId: 'op',
    path: '/jobs/{jobId}',
    pathParams: [],
    queryParams: [],
    requestBody: null,
    responses: [],
    security: [],
    serverTemplate: overrides.serverTemplate ?? 'https://api.sanity.io/v2021-06-07',
    spec: 'jobs',
    summary: '',
  }
}

describe('buildRequestUrl', () => {
  test('strips the api-version overlap between host and path', () => {
    // Host: https://api.sanity.io/v2021-06-07
    // Path: v2021-06-07/jobs/abc123  → strip the duplicate v2021-06-07 segment.
    const url = buildRequestUrl({
      context: {},
      inlineQuery: '',
      operation: buildOp(),
      path: 'v2021-06-07/jobs/abc123',
      queryFlags: [],
    })
    expect(url).toBe('https://api.sanity.io/v2021-06-07/jobs/abc123?tag=sanity.cli.api')
  })

  test('substitutes :projectId in the host from context', () => {
    const url = buildRequestUrl({
      context: {projectId: 'xyz789'},
      inlineQuery: '',
      operation: buildOp({serverTemplate: 'https://:projectId.api.sanity.io/v2024-01-01'}),
      path: 'v2024-01-01/data/query/production',
      queryFlags: [],
    })
    expect(url).toBe(
      'https://xyz789.api.sanity.io/v2024-01-01/data/query/production?tag=sanity.cli.api',
    )
  })

  test('appends the telemetry tag when no query params are supplied', () => {
    const url = buildRequestUrl({
      context: {},
      inlineQuery: '',
      operation: buildOp(),
      path: 'v2021-06-07/jobs/abc123',
      queryFlags: [],
    })
    expect(url).toContain('?tag=sanity.cli.api')
  })

  test('respects a user-supplied tag value (no override)', () => {
    const url = buildRequestUrl({
      context: {},
      inlineQuery: 'tag=mine',
      operation: buildOp(),
      path: 'v2021-06-07/jobs/abc123',
      queryFlags: [],
    })
    expect(url).toContain('tag=mine')
    expect(url).not.toContain('tag=sanity.cli.api')
  })

  test('-q value overrides an inline value for the same key', () => {
    const url = buildRequestUrl({
      context: {},
      inlineQuery: 'foo=inline',
      operation: buildOp(),
      path: 'v2021-06-07/jobs/abc123',
      queryFlags: ['foo=flag'],
    })
    expect(url).toContain('foo=flag')
    expect(url).not.toContain('foo=inline')
  })

  test('preserves repeated `-q` keys for server-side array semantics', () => {
    const url = buildRequestUrl({
      context: {},
      inlineQuery: '',
      operation: buildOp(),
      path: 'v2021-06-07/jobs/abc123',
      queryFlags: ['x=a', 'x=b'],
    })
    expect(url).toContain('x=a')
    expect(url).toContain('x=b')
  })

  test('URL-encodes flag values (so * and [ ] do not need shell-escaping)', () => {
    const url = buildRequestUrl({
      context: {},
      inlineQuery: '',
      operation: buildOp(),
      path: 'v2021-06-07/jobs/abc123',
      queryFlags: ['query=*[_type=="foo"]'],
    })
    // URLSearchParams leaves `*` unencoded (it's an unreserved URI char);
    // brackets, quotes, equals all get percent-encoded.
    // `==` is encoded as `%3D%3D`, brackets/quotes get percent-encoded
    // too; `*` stays unencoded (unreserved URI char).
    expect(url).toContain('query=*%5B_type%3D%3D%22foo%22%5D')
  })

  test('merges inline and flag query params when keys differ', () => {
    const url = buildRequestUrl({
      context: {},
      inlineQuery: 'a=1',
      operation: buildOp(),
      path: 'v2021-06-07/jobs/abc123',
      queryFlags: ['b=2'],
    })
    expect(url).toContain('a=1')
    expect(url).toContain('b=2')
  })
})
