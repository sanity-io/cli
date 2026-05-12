import {describe, expect, test} from 'vitest'

import {classifyCapability, parseOpenApi, toUrlPatternForm} from '../parser.js'

const JOBS_SPEC = `
openapi: 3.1.1
info:
  title: Jobs API
  version: 'v2021-06-07'
  description: Manage jobs
servers:
  - url: "https://api.sanity.io/{apiVersion}"
    variables:
      apiVersion:
        default: 'v2021-06-07'
paths:
  /jobs/{jobId}:
    get:
      summary: Get job status
      operationId: jobStatus
      parameters:
        - in: path
          name: jobId
          required: true
          schema:
            type: string
      responses:
        '200':
          description: ok
  /jobs/{jobId}/listen:
    get:
      summary: Listen for job updates
      operationId: jobListen
      parameters:
        - in: path
          name: jobId
          required: true
          schema:
            type: string
      responses:
        '200':
          content:
            text/event-stream:
              schema:
                type: string
`

const QUERY_SPEC = `
openapi: 3.0.3
info:
  title: Query API
  version: 'v2024-01-01'
servers:
  - url: "https://{projectId}.api.sanity.io/{apiVersion}"
    variables:
      apiVersion:
        default: 'v2024-01-01'
      projectId:
        default: 'your-project-id'
paths:
  /data/query/{dataset}:
    get:
      summary: Run a GROQ query
      operationId: queryDataset
      parameters:
        - in: path
          name: dataset
          required: true
          schema:
            type: string
        - in: query
          name: query
          required: true
          schema:
            type: string
        - in: query
          name: perspective
          required: false
          schema:
            type: string
      responses:
        '200':
          description: ok
`

const MUTATE_SPEC = `
openapi: 3.0.3
info:
  title: Mutate API
  version: 'v2024-01-01'
servers:
  - url: "https://{projectId}.api.sanity.io/{apiVersion}"
    variables:
      apiVersion:
        default: 'v2024-01-01'
      projectId:
        default: 'your-project-id'
paths:
  /data/mutate/{dataset}:
    post:
      summary: Apply mutations
      operationId: mutateDataset
      parameters:
        - in: path
          name: dataset
          required: true
          schema:
            type: string
      responses:
        '200':
          description: ok
  /projects/{projectId}:
    delete:
      summary: Delete project
      operationId: deleteProject
      parameters:
        - in: path
          name: projectId
          required: true
          schema:
            type: string
      responses:
        '204':
          description: ok
`

describe('classifyCapability', () => {
  test('treats GET / HEAD / OPTIONS as read', () => {
    expect(classifyCapability('GET')).toBe('read')
    expect(classifyCapability('get')).toBe('read')
    expect(classifyCapability('HEAD')).toBe('read')
    expect(classifyCapability('OPTIONS')).toBe('read')
  })

  test('treats PATCH / PUT / DELETE as destructive', () => {
    expect(classifyCapability('PATCH')).toBe('destructive')
    expect(classifyCapability('PUT')).toBe('destructive')
    expect(classifyCapability('DELETE')).toBe('destructive')
    expect(classifyCapability('delete')).toBe('destructive')
  })

  test('treats POST and unknown methods as write', () => {
    expect(classifyCapability('POST')).toBe('write')
    expect(classifyCapability('TRACE')).toBe('write')
  })
})

describe('parseOpenApi', () => {
  test('extracts spec metadata', () => {
    const result = parseOpenApi('jobs', JOBS_SPEC)
    expect(result.slug).toBe('jobs')
    expect(result.title).toBe('Jobs API')
    expect(result.version).toBe('v2021-06-07')
    expect(result.description).toBe('Manage jobs')
  })

  test('renders endpoints with :name placeholders and api-version prefix', () => {
    const result = parseOpenApi('jobs', JOBS_SPEC)
    expect(result.operations.map((op) => op.endpoint).toSorted()).toEqual([
      'v2021-06-07/jobs/:jobId',
      'v2021-06-07/jobs/:jobId/listen',
    ])
  })

  test('captures path params (names only)', () => {
    const result = parseOpenApi('jobs', JOBS_SPEC)
    expect(result.operations[0].pathParams).toEqual(['jobId'])
  })

  test('captures required query params (excludes optional)', () => {
    const result = parseOpenApi('query', QUERY_SPEC)
    const op = result.operations[0]
    expect(op.requiredQueryParams).toEqual(['query'])
  })

  test('detects SSE streaming responses', () => {
    const result = parseOpenApi('jobs', JOBS_SPEC)
    const jobStatus = result.operations.find((op) => op.operationId === 'jobStatus')!
    const jobListen = result.operations.find((op) => op.operationId === 'jobListen')!
    expect(jobStatus.isStreaming).toBe(false)
    expect(jobListen.isStreaming).toBe(true)
  })

  test('classifies capabilities by method', () => {
    const mutate = parseOpenApi('mutate', MUTATE_SPEC)
    const post = mutate.operations.find((op) => op.method === 'POST')!
    const del = mutate.operations.find((op) => op.method === 'DELETE')!
    expect(post.capability).toBe('write')
    expect(del.capability).toBe('destructive')
  })

  test('substitutes {apiVersion} in server template, leaves {projectId} as :projectId', () => {
    const result = parseOpenApi('query', QUERY_SPEC)
    expect(result.serverTemplate).toBe('https://:projectId.api.sanity.io/v2024-01-01')
  })

  test('throws on non-object root', () => {
    expect(() => parseOpenApi('bad', 'just a string')).toThrow(/did not parse to an object/)
  })

  // Regression: the version segment must come from the resolved server
  // URL pathname, NOT info.version. The four shapes we hit on real specs:
  describe('version-segment shape', () => {
    test('apiVersion variable default fills the pathname segment', () => {
      // jobs / projects-api / media-library shape
      const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/{apiVersion}"
    variables:
      apiVersion:
        default: 'v2021-06-07'
paths:
  /projects:
    get:
      operationId: listProjects
      responses:
        '200':
          description: ok
`
      const result = parseOpenApi('t', spec)
      expect(result.operations[0].endpoint).toBe('v2021-06-07/projects')
    })

    test('literal path segment in server URL is preserved (content-agent shape)', () => {
      const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/vX/agent"
paths:
  /{organizationId}/threads/{threadId}:
    get:
      operationId: getThread
      responses:
        '200':
          description: ok
`
      const result = parseOpenApi('t', spec)
      expect(result.operations[0].endpoint).toBe('vX/agent/:organizationId/threads/:threadId')
    })

    test('version baked into OpenAPI path keys (user-attributes shape)', () => {
      const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0'
servers:
  - url: "https://api.sanity.io"
paths:
  /v2026-04-27/organizations/{organizationId}/attribute-definitions:
    get:
      operationId: listAttrs
      responses:
        '200':
          description: ok
`
      const result = parseOpenApi('t', spec)
      expect(result.operations[0].endpoint).toBe(
        'v2026-04-27/organizations/:organizationId/attribute-definitions',
      )
    })

    test('info.version is never used as a path prefix', () => {
      // The bug we fixed: info.version='1.0.0' MUST NOT prefix the endpoint.
      const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/{apiVersion}"
    variables:
      apiVersion:
        default: 'v2021-06-07'
paths:
  /projects:
    get:
      operationId: listProjects
      responses:
        '200':
          description: ok
`
      const result = parseOpenApi('t', spec)
      expect(result.operations[0].endpoint).not.toMatch(/^1\.0\.0/)
      expect(result.operations[0].endpoint.startsWith('v2021-06-07')).toBe(true)
    })
  })
})

describe('toUrlPatternForm', () => {
  test('converts {name} to :name', () => {
    expect(toUrlPatternForm('/jobs/{jobId}')).toBe('/jobs/:jobId')
    expect(toUrlPatternForm('/data/query/{dataset}')).toBe('/data/query/:dataset')
    expect(toUrlPatternForm('/projects/{projectId}/datasets/{dataset}')).toBe(
      '/projects/:projectId/datasets/:dataset',
    )
  })

  test('leaves URLs without placeholders unchanged', () => {
    expect(toUrlPatternForm('/health')).toBe('/health')
  })
})
