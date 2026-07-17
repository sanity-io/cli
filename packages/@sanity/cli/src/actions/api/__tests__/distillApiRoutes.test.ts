import {describe, expect, test} from 'vitest'

import {distillApiRoutes} from '../distillApiRoutes.js'

describe('distillApiRoutes', () => {
  test('classifies global and project hosts', () => {
    const routes = distillApiRoutes([
      {
        document: {
          paths: {'/data/query/{dataset}': {}},
          servers: [
            {
              url: 'https://{projectId}.api.sanity.io/{apiVersion}',
              variables: {apiVersion: {default: 'v2025-02-19'}},
            },
          ],
        },
        slug: 'query',
        title: 'Query API',
      },
      {
        document: {
          paths: {'/projects': {}, '/projects/{projectId}': {}},
          servers: [
            {
              url: 'https://api.sanity.io/{apiVersion}',
              variables: {apiVersion: {default: 'v2021-06-07'}},
            },
          ],
        },
        slug: 'projects-api',
        title: 'Projects API',
      },
    ])

    expect(routes).toEqual([
      {
        defaultApiVersion: 'v2021-06-07',
        host: 'global',
        pathPatterns: ['projects', 'projects/{projectId}'],
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
    ])
  })

  test('prefixes patterns with the server base path', () => {
    const routes = distillApiRoutes([
      {
        document: {
          paths: {'/generate/{dataset}': {}},
          servers: [{url: 'https://{projectId}.api.sanity.io/{apiVersion}/agent/action'}],
        },
        slug: 'agent-actions',
        title: 'Agent Actions',
      },
    ])

    expect(routes[0]).toMatchObject({
      host: 'project',
      pathPatterns: ['agent/action/generate/{dataset}'],
    })
  })

  test('extracts a literal version from the server base path', () => {
    const routes = distillApiRoutes([
      {
        document: {
          paths: {'/prompt': {}},
          servers: [{url: 'https://api.sanity.io/vX/agent'}],
        },
        slug: 'content-agent',
        title: 'Content Agent',
      },
    ])

    expect(routes[0]).toMatchObject({
      defaultApiVersion: 'vX',
      host: 'global',
      pathPatterns: ['agent/prompt'],
    })
  })

  test('extracts a version embedded in path templates', () => {
    const routes = distillApiRoutes([
      {
        document: {
          paths: {'/v2024-07-01/access/requests/me': {}},
          servers: [{url: 'https://api.sanity.io'}],
        },
        slug: 'access-api',
        title: 'Access API',
      },
    ])

    expect(routes[0]).toMatchObject({
      defaultApiVersion: 'v2024-07-01',
      pathPatterns: ['access/requests/me'],
    })
  })

  test('strips a leading {apiVersion} placeholder from path templates', () => {
    const routes = distillApiRoutes([
      {
        document: {
          paths: {'/{apiVersion}/applications': {}},
          servers: [{url: 'https://api.sanity.io'}],
        },
        slug: 'applications-api',
        title: 'Applications API',
      },
    ])

    expect(routes[0]).toMatchObject({pathPatterns: ['applications']})
    expect(routes[0].defaultApiVersion).toBeUndefined()
  })

  test('emits one entry per host for dual-host specs', () => {
    const routes = distillApiRoutes([
      {
        document: {
          paths: {'/media-libraries/{libraryId}/query': {}},
          servers: [
            {url: 'https://api.sanity.io/{apiVersion}'},
            {url: 'https://{projectId}.api.sanity.io/{apiVersion}'},
          ],
        },
        slug: 'media-library',
        title: 'Media Library API',
      },
    ])

    expect(routes.map((route) => route.host)).toEqual(['global', 'project'])
    expect(routes[0].pathPatterns).toEqual(routes[1].pathPatterns)
  })

  test('skips non-Sanity servers and specs without servers or paths', () => {
    const routes = distillApiRoutes([
      {
        document: {
          paths: {'/somewhere': {}},
          servers: [{url: 'https://example.com/api'}],
        },
        slug: 'external',
        title: 'External API',
      },
      {document: {paths: {'/no-servers': {}}}, slug: 'no-servers', title: 'No servers'},
      {
        document: {servers: [{url: 'https://api.sanity.io/{apiVersion}'}]},
        slug: 'no-paths',
        title: 'No paths',
      },
    ])

    expect(routes).toEqual([])
  })

  test('produces deterministic output regardless of input order', () => {
    const specs = [
      {
        document: {
          paths: {'/a': {}, '/b': {}},
          servers: [{url: 'https://api.sanity.io/{apiVersion}'}],
        },
        slug: 'zeta',
        title: 'Z',
      },
      {
        document: {
          paths: {'/c': {}},
          servers: [{url: 'https://api.sanity.io/{apiVersion}'}],
        },
        slug: 'alpha',
        title: 'A',
      },
    ]

    const routes = distillApiRoutes(specs)
    expect(routes.map((route) => route.slug)).toEqual(['alpha', 'zeta'])
    expect(routes[1].pathPatterns).toEqual(['a', 'b'])
    expect(distillApiRoutes(specs.toReversed())).toEqual(routes)
  })
})
