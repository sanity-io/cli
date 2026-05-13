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
  test('treats GET / HEAD / OPTIONS as read', async () => {
    expect(classifyCapability('GET')).toBe('read')
    expect(classifyCapability('get')).toBe('read')
    expect(classifyCapability('HEAD')).toBe('read')
    expect(classifyCapability('OPTIONS')).toBe('read')
  })

  test('treats PATCH / PUT / DELETE as destructive', async () => {
    expect(classifyCapability('PATCH')).toBe('destructive')
    expect(classifyCapability('PUT')).toBe('destructive')
    expect(classifyCapability('DELETE')).toBe('destructive')
    expect(classifyCapability('delete')).toBe('destructive')
  })

  test('treats POST and unknown methods as write', async () => {
    expect(classifyCapability('POST')).toBe('write')
    expect(classifyCapability('TRACE')).toBe('write')
  })
})

describe('parseOpenApi', () => {
  test('renders endpoints with :name placeholders and api-version prefix', async () => {
    const operations = await parseOpenApi('jobs', JOBS_SPEC)
    expect(operations.map((op) => op.endpoint).toSorted()).toEqual([
      'v2021-06-07/jobs/:jobId',
      'v2021-06-07/jobs/:jobId/listen',
    ])
  })

  test('captures path params (names only)', async () => {
    const operations = await parseOpenApi('jobs', JOBS_SPEC)
    expect(operations[0].pathParams).toEqual(['jobId'])
  })

  test('captures required query params (excludes optional)', async () => {
    const operations = await parseOpenApi('query', QUERY_SPEC)
    expect(operations[0].requiredQueryParams).toEqual(['query'])
  })

  test('detects SSE streaming responses', async () => {
    const operations = await parseOpenApi('jobs', JOBS_SPEC)
    const jobStatus = operations.find((op) => op.operationId === 'jobStatus')!
    const jobListen = operations.find((op) => op.operationId === 'jobListen')!
    expect(jobStatus.isStreaming).toBe(false)
    expect(jobListen.isStreaming).toBe(true)
  })

  test('classifies capabilities by method', async () => {
    const operations = await parseOpenApi('mutate', MUTATE_SPEC)
    const post = operations.find((op) => op.method === 'POST')!
    const del = operations.find((op) => op.method === 'DELETE')!
    expect(post.capability).toBe('write')
    expect(del.capability).toBe('destructive')
  })

  test('rejects invalid OpenAPI documents', async () => {
    await expect(parseOpenApi('bad', 'just a string')).rejects.toThrow(/failed to parse/)
  })

  test('skips operations without an operationId', async () => {
    const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/v1"
paths:
  /a:
    get:
      operationId: hasId
      responses:
        '200':
          description: ok
  /b:
    get:
      responses:
        '200':
          description: ok
`
    const operations = await parseOpenApi('t', spec)
    expect(operations.map((op) => op.operationId)).toEqual(['hasId'])
  })

  // Regression: the version segment must come from the resolved server
  // URL pathname, NOT info.version. The four shapes we hit on real specs:
  describe('version-segment shape', () => {
    test('apiVersion variable default fills the pathname segment', async () => {
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
      const operations = await parseOpenApi('t', spec)
      expect(operations[0].endpoint).toBe('v2021-06-07/projects')
    })

    test('literal path segment in server URL is preserved (content-agent shape)', async () => {
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
      const operations = await parseOpenApi('t', spec)
      expect(operations[0].endpoint).toBe('vX/agent/:organizationId/threads/:threadId')
    })

    test('version baked into OpenAPI path keys (user-attributes shape)', async () => {
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
      const operations = await parseOpenApi('t', spec)
      expect(operations[0].endpoint).toBe(
        'v2026-04-27/organizations/:organizationId/attribute-definitions',
      )
    })

    test('info.version is never used as a path prefix', async () => {
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
      const operations = await parseOpenApi('t', spec)
      expect(operations[0].endpoint).not.toMatch(/^1\.0\.0/)
      expect(operations[0].endpoint.startsWith('v2021-06-07')).toBe(true)
    })
  })
})

describe('toUrlPatternForm', () => {
  test('converts {name} to :name', async () => {
    expect(toUrlPatternForm('/jobs/{jobId}')).toBe('/jobs/:jobId')
    expect(toUrlPatternForm('/data/query/{dataset}')).toBe('/data/query/:dataset')
    expect(toUrlPatternForm('/projects/{projectId}/datasets/{dataset}')).toBe(
      '/projects/:projectId/datasets/:dataset',
    )
  })

  test('leaves URLs without placeholders unchanged', async () => {
    expect(toUrlPatternForm('/health')).toBe('/health')
  })
})
