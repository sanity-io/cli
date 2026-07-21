import {describe, expect, test} from 'vitest'

import {API_DEFAULT_VERSION} from '../constants.js'
import {ApiUsageError, ProjectIdRequiredError} from '../errors.js'
import {resolveEndpoint} from '../resolveEndpoint.js'
import {type ApiRouteEntry} from '../types.js'

const routes: ApiRouteEntry[] = [
  {
    defaultApiVersion: 'v2021-06-07',
    host: 'global',
    pathPatterns: ['projects', 'projects/{projectId}', 'projects/{projectId}/datasets'],
    slug: 'projects-api',
    title: 'Projects API',
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: ['data/query/{dataset}'],
    slug: 'query',
    title: 'Query API',
  },
  {
    defaultApiVersion: 'vX',
    host: 'project',
    pathPatterns: ['agent/action/generate/{dataset}'],
    slug: 'agent-actions',
    title: 'Agent Actions',
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'global',
    pathPatterns: ['agent/prompt'],
    slug: 'content-agent',
    title: 'Content Agent API',
  },
  {
    host: 'global',
    pathPatterns: ['applications'],
    slug: 'applications-api',
    title: 'Applications API',
  },
  {
    host: 'project',
    pathPatterns: ['applications'],
    slug: 'applications-api',
    title: 'Applications API',
  },
]

describe('resolveEndpoint', () => {
  test('resolves a global path with the matched spec version', () => {
    expect(resolveEndpoint({endpoint: 'projects', routes})).toEqual({
      apiVersion: 'v2021-06-07',
      host: 'global',
      kind: 'path',
      matchedSlug: 'projects-api',
      path: 'projects',
      query: {},
    })
  })

  test('accepts leading slashes', () => {
    const resolved = resolveEndpoint({endpoint: '/projects', routes})
    expect(resolved).toMatchObject({host: 'global', path: 'projects'})
  })

  test('routes matching paths to the project host', () => {
    expect(
      resolveEndpoint({endpoint: 'data/query/production', projectId: 'abc123', routes}),
    ).toEqual({
      apiVersion: 'v2025-02-19',
      host: 'project',
      kind: 'path',
      matchedSlug: 'query',
      path: 'data/query/production',
      projectId: 'abc123',
      query: {},
    })
  })

  test('throws ProjectIdRequiredError for project-hosted paths without project ID', () => {
    expect(() => resolveEndpoint({endpoint: 'data/query/production', routes})).toThrow(
      ProjectIdRequiredError,
    )
  })

  test('substitutes {projectId} and {dataset} placeholders', () => {
    const resolved = resolveEndpoint({
      dataset: 'production',
      endpoint: 'projects/{projectId}/datasets',
      projectId: 'abc123',
      routes,
    })
    expect(resolved).toMatchObject({host: 'global', path: 'projects/abc123/datasets'})

    const dataResolved = resolveEndpoint({
      dataset: 'production',
      endpoint: 'data/query/{dataset}',
      projectId: 'abc123',
      routes,
    })
    expect(dataResolved).toMatchObject({host: 'project', path: 'data/query/production'})
  })

  test('throws ProjectIdRequiredError for {projectId} placeholders without project ID', () => {
    expect(() => resolveEndpoint({endpoint: 'projects/{projectId}', routes})).toThrow(
      ProjectIdRequiredError,
    )
  })

  test('throws a usage error for {dataset} placeholders without dataset', () => {
    expect(() =>
      resolveEndpoint({endpoint: 'data/query/{dataset}', projectId: 'abc123', routes}),
    ).toThrow(ApiUsageError)
  })

  test('throws a usage error for unknown placeholders', () => {
    expect(() => resolveEndpoint({endpoint: 'jobs/{jobId}', routes})).toThrow(/\{jobId\}/)
  })

  test('parses the query string', () => {
    const resolved = resolveEndpoint({
      endpoint: 'data/query/production?query=*&perspective=raw&perspective=drafts',
      projectId: 'abc123',
      routes,
    })
    expect(resolved.query).toEqual({perspective: ['raw', 'drafts'], query: '*'})
  })

  test('treats __proto__ query parameters as ordinary keys', () => {
    const resolved = resolveEndpoint({endpoint: 'projects?__proto__=x&a=1', routes})
    expect(resolved.query).toEqual({['__proto__']: 'x', a: '1'})
  })

  test('peels an API version embedded in the path', () => {
    const resolved = resolveEndpoint({endpoint: 'v2024-01-01/projects', routes})
    expect(resolved).toMatchObject({apiVersion: 'v2024-01-01', path: 'projects'})
  })

  test('strips a leading {apiVersion} placeholder', () => {
    const resolved = resolveEndpoint({endpoint: '{apiVersion}/projects', routes})
    expect(resolved).toMatchObject({apiVersion: 'v2021-06-07', path: 'projects'})
  })

  test('prefers the explicit API version over embedded and spec versions', () => {
    const resolved = resolveEndpoint({
      apiVersion: 'v2030-01-01',
      endpoint: 'v2024-01-01/projects',
      routes,
    })
    expect(resolved).toMatchObject({apiVersion: 'v2030-01-01'})
  })

  test('distinguishes hosts for paths sharing a prefix', () => {
    expect(
      resolveEndpoint({endpoint: 'agent/action/generate/production', projectId: 'p', routes}),
    ).toMatchObject({apiVersion: 'vX', host: 'project'})
    expect(resolveEndpoint({endpoint: 'agent/prompt', routes})).toMatchObject({
      host: 'global',
      matchedSlug: 'content-agent',
    })
  })

  test('prefers the global host when an API is served on both, regardless of entry order', () => {
    expect(resolveEndpoint({endpoint: 'applications', routes})).toMatchObject({host: 'global'})
    expect(resolveEndpoint({endpoint: 'applications', routes: routes.toReversed()})).toMatchObject({
      host: 'global',
    })
  })

  test('never matches placeholder-only patterns', () => {
    const greedy: ApiRouteEntry[] = [
      {
        defaultApiVersion: 'v2030-01-01',
        host: 'project',
        pathPatterns: ['{resourceType}/{resourceId}', '{id}'],
        slug: 'greedy',
        title: 'Greedy API',
      },
    ]

    expect(resolveEndpoint({endpoint: 'users/me', routes: greedy})).toMatchObject({
      apiVersion: API_DEFAULT_VERSION,
      host: 'global',
      matchedSlug: undefined,
    })
  })

  test('keeps the first entry on same-host score ties', () => {
    const tied: ApiRouteEntry[] = [
      {
        defaultApiVersion: 'v2025-02-19',
        host: 'global',
        pathPatterns: ['projects/{projectId}/datasets/{dataset}/copy'],
        slug: 'copy',
        title: 'Copy API',
      },
      {
        defaultApiVersion: 'v2021-06-07',
        host: 'global',
        pathPatterns: ['projects/{projectId}/datasets/{name}/copy'],
        slug: 'projects-api',
        title: 'Projects API',
      },
    ]

    expect(resolveEndpoint({endpoint: 'projects/p/datasets/d/copy', routes: tied})).toMatchObject({
      apiVersion: 'v2025-02-19',
      matchedSlug: 'copy',
    })
  })

  test('defaults unmatched paths to the global host and default version', () => {
    expect(resolveEndpoint({endpoint: 'users/me', routes})).toEqual({
      apiVersion: API_DEFAULT_VERSION,
      host: 'global',
      kind: 'path',
      matchedSlug: undefined,
      path: 'users/me',
      query: {},
    })
  })

  test('honors a forced host', () => {
    expect(
      resolveEndpoint({endpoint: 'projects', forceHost: 'project', projectId: 'p', routes}),
    ).toMatchObject({apiVersion: API_DEFAULT_VERSION, host: 'project', projectId: 'p'})
    expect(
      resolveEndpoint({endpoint: 'data/query/production', forceHost: 'global', routes}),
    ).toMatchObject({host: 'global'})
  })

  test('passes through full URLs on Sanity API hosts', () => {
    expect(
      resolveEndpoint({
        endpoint: 'https://abc123.api.sanity.io/v1/data/query/production?query=*',
        routes,
      }),
    ).toEqual({
      kind: 'url',
      query: {query: '*'},
      url: 'https://abc123.api.sanity.io/v1/data/query/production',
    })
    expect(
      resolveEndpoint({endpoint: 'https://api.sanity.work/v1/projects', routes}),
    ).toMatchObject({kind: 'url'})
  })

  test('refuses full URLs on non-Sanity hosts', () => {
    expect(() => resolveEndpoint({endpoint: 'https://evil.example.com/steal', routes})).toThrow(
      /Refusing to send/,
    )
    expect(() =>
      resolveEndpoint({endpoint: 'https://fakeapi.sanity.io.evil.com/x', routes}),
    ).toThrow(/Refusing to send/)
  })

  test('refuses full URLs over plain http', () => {
    expect(() =>
      resolveEndpoint({endpoint: 'http://abc123.api.sanity.io/v1/users/me', routes}),
    ).toThrow(/only https/)
  })

  test('throws a usage error for empty paths', () => {
    expect(() => resolveEndpoint({endpoint: '/', routes})).toThrow(/empty/)
    expect(() => resolveEndpoint({endpoint: 'v2025-02-19', routes})).toThrow(/empty/)
    expect(() => resolveEndpoint({endpoint: '{apiVersion}', routes})).toThrow(/empty/)
  })
})
