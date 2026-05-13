import {describe, expect, test} from 'vitest'

import {classifyCapability, parseOpenApi, toUrlPatternForm} from '../parser.js'

const JOBS_SPEC = `
openapi: 3.1.1
info:
  title: Jobs API
  version: 'v2021-06-07'
  description: Manage jobs
security:
  - BearerAuth: []
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
          description: The job identifier.
          schema:
            type: string
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: string }
                  state: { type: string }
                  authors: { type: array, items: { type: string } }
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
          description: The GROQ query string
          schema:
            type: string
        - in: query
          name: perspective
          required: false
          schema:
            type: string
            enum: ['raw', 'published', 'drafts']
            default: 'raw'
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
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [mutations]
              properties:
                mutations:
                  type: array
                  description: A list of mutations to apply.
                  items:
                    type: object
                    properties:
                      create: { type: object }
                      delete: { type: object }
                transactionId:
                  type: string
                  description: Optional transaction identifier.
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

const REF_SPEC = `
openapi: 3.1.1
info:
  title: With Refs
  version: 'v2024-01-01'
servers:
  - url: "https://api.sanity.io/{apiVersion}"
    variables:
      apiVersion:
        default: 'v2024-01-01'
security:
  - bearerAuth: []
paths:
  /things:
    post:
      operationId: createThing
      summary: Create a thing
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateThingRequest'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Thing'
        '404':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
components:
  schemas:
    CreateThingRequest:
      type: object
      properties:
        name: { type: string }
    Thing:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
    ErrorResponse:
      type: object
      properties:
        message: { type: string }
`

const COMPOSITION_SPEC = `
openapi: 3.1.1
info:
  title: Composition
  version: 'v2024-01-01'
servers:
  - url: "https://api.sanity.io/{apiVersion}"
    variables:
      apiVersion:
        default: 'v2024-01-01'
paths:
  /generate:
    post:
      operationId: generate
      requestBody:
        required: true
        content:
          application/json:
            schema:
              allOf:
                - type: object
                  required: [target]
                  properties:
                    target: { type: string }
                - $ref: '#/components/schemas/InstructionContext'
                - type: object
                  properties:
                    locale: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
  /classify:
    post:
      operationId: classify
      requestBody:
        required: true
        content:
          application/json:
            schema:
              oneOf:
                - $ref: '#/components/schemas/TextInput'
                - $ref: '#/components/schemas/ImageInput'
      responses:
        '200':
          description: ok
components:
  schemas:
    InstructionContext:
      type: object
    TextInput:
      type: object
    ImageInput:
      type: object
`

const UPLOAD_SPEC = `
openapi: 3.0.3
info:
  title: Upload
  version: 'v2024-01-01'
servers:
  - url: "https://api.sanity.io/{apiVersion}"
    variables:
      apiVersion:
        default: 'v2024-01-01'
paths:
  /upload/image:
    post:
      operationId: uploadImage
      requestBody:
        required: true
        content:
          image/jpeg:
            schema:
              type: string
              format: binary
      responses:
        '200':
          description: ok
  /upload/multipart:
    post:
      operationId: uploadMultipart
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file: { type: string, format: binary }
      responses:
        '200':
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

describe('parseOpenApi — spec-level metadata', () => {
  test('extracts title, description, version, slug', async () => {
    const result = await parseOpenApi('jobs', JOBS_SPEC)
    expect(result.slug).toBe('jobs')
    expect(result.title).toBe('Jobs API')
    expect(result.version).toBe('v2021-06-07')
    expect(result.description).toBe('Manage jobs')
  })

  test('rejects invalid OpenAPI documents', async () => {
    await expect(parseOpenApi('bad', 'just a string')).rejects.toThrow(/failed to parse/)
  })
})

describe('parseOpenApi — operations', () => {
  test('renders endpoints with :name placeholders and api-version prefix', async () => {
    const result = await parseOpenApi('jobs', JOBS_SPEC)
    expect(result.operations.map((op) => op.endpoint).toSorted()).toEqual([
      'v2021-06-07/jobs/:jobId',
      'v2021-06-07/jobs/:jobId/listen',
    ])
  })

  test('detects SSE streaming responses', async () => {
    const result = await parseOpenApi('jobs', JOBS_SPEC)
    const jobStatus = result.operations.find((op) => op.operationId === 'jobStatus')!
    const jobListen = result.operations.find((op) => op.operationId === 'jobListen')!
    expect(jobStatus.isStreaming).toBe(false)
    expect(jobListen.isStreaming).toBe(true)
  })

  test('detects SSE streaming on any 2xx status, not just 200', async () => {
    const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/v1"
paths:
  /watch:
    post:
      operationId: startWatch
      responses:
        '201':
          content:
            text/event-stream:
              schema:
                type: string
`
    const result = await parseOpenApi('t', spec)
    expect(result.operations[0].isStreaming).toBe(true)
  })

  test('classifies capabilities by method', async () => {
    const result = await parseOpenApi('mutate', MUTATE_SPEC)
    const post = result.operations.find((op) => op.method === 'POST')!
    const del = result.operations.find((op) => op.method === 'DELETE')!
    expect(post.capability).toBe('write')
    expect(del.capability).toBe('destructive')
  })

  test('synthesizes a deterministic operationId when the spec omits one', async () => {
    // Some real-world specs (e.g. `mutation`) don't declare operationId.
    // Synthesize `<method>_<path>` so each row stays uniquely addressable.
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
  /data/mutate/{dataset}:
    post:
      responses:
        '200':
          description: ok
`
    const result = await parseOpenApi('t', spec)
    expect(result.operations.map((op) => op.operationId).toSorted()).toEqual([
      'hasId',
      'post_data_mutate_dataset',
    ])
  })

  test('rejects specs whose operationIds collide (authored + synthesized)', async () => {
    // The risky case: an authored operationId matches what
    // `synthesizeOperationId` would emit for another path. Without the
    // post-loop check, `--operation=get_jobs` would silently resolve to
    // whichever record sorted last in the index.
    const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/v1"
paths:
  /jobs:
    get:
      responses:
        '200':
          description: ok
  /something-else:
    get:
      operationId: get_jobs
      responses:
        '200':
          description: ok
`
    await expect(parseOpenApi('t', spec)).rejects.toThrow(/duplicate operationId/)
  })

  test('rejects specs whose authored operationIds collide', async () => {
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
      operationId: dup
      responses:
        '200':
          description: ok
  /b:
    get:
      operationId: dup
      responses:
        '200':
          description: ok
`
    await expect(parseOpenApi('t', spec)).rejects.toThrow(/duplicate operationId/)
  })
})

describe('parseOpenApi — parameters', () => {
  test('extracts path params with type, required, description', async () => {
    const result = await parseOpenApi('jobs', JOBS_SPEC)
    const op = result.operations.find((o) => o.operationId === 'jobStatus')!
    expect(op.pathParams).toEqual([
      {
        description: 'The job identifier.',
        in: 'path',
        name: 'jobId',
        required: true,
        type: 'string',
      },
    ])
  })

  test('resolves `$ref` to components.parameters (path params must survive)', async () => {
    const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/v1"
paths:
  /things/{dataset}:
    parameters:
      - $ref: '#/components/parameters/datasetParam'
    get:
      operationId: getThing
      responses:
        '200':
          description: ok
components:
  parameters:
    datasetParam:
      in: path
      name: dataset
      required: true
      description: The dataset slug
      schema:
        type: string
`
    const result = await parseOpenApi('t', spec)
    expect(result.operations[0].pathParams).toEqual([
      {
        description: 'The dataset slug',
        in: 'path',
        name: 'dataset',
        required: true,
        type: 'string',
      },
    ])
  })

  test('operation-level params override path-item-level params on (name, in)', async () => {
    // Per OpenAPI 3.x — when a (name, in) appears at both levels, the
    // operation-level one wins, no duplicate row in the output.
    const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/v1"
paths:
  /things/{dataset}:
    parameters:
      - in: path
        name: dataset
        required: true
        description: original (path-item-level)
        schema:
          type: string
    get:
      operationId: getThing
      parameters:
        - in: path
          name: dataset
          required: true
          description: overridden (op-level)
          schema:
            type: string
      responses:
        '200':
          description: ok
`
    const result = await parseOpenApi('t', spec)
    expect(result.operations[0].pathParams).toHaveLength(1)
    expect(result.operations[0].pathParams[0].description).toBe('overridden (op-level)')
  })

  test('separates required and optional query params; carries enum + default', async () => {
    const result = await parseOpenApi('query', QUERY_SPEC)
    const op = result.operations[0]
    const required = op.queryParams.filter((p) => p.required)
    const optional = op.queryParams.filter((p) => !p.required)
    expect(required.map((p) => p.name)).toEqual(['query'])
    expect(required[0].description).toBe('The GROQ query string')
    expect(optional.map((p) => p.name)).toEqual(['perspective'])
    expect(optional[0].enum).toEqual(['raw', 'published', 'drafts'])
    expect(optional[0].default).toBe('raw')
  })
})

describe('parseOpenApi — request body', () => {
  test('extracts inline JSON body fields with required flags and descriptions', async () => {
    const result = await parseOpenApi('mutate', MUTATE_SPEC)
    const op = result.operations.find((o) => o.operationId === 'mutateDataset')!
    expect(op.requestBody?.contentType).toBe('application/json')
    expect(op.requestBody?.required).toBe(true)
    const fieldsByName = Object.fromEntries(op.requestBody!.fields.map((f) => [f.name, f]))
    expect(fieldsByName.mutations.required).toBe(true)
    expect(fieldsByName.mutations.type).toBe('object[]')
    expect(fieldsByName.mutations.description).toBe('A list of mutations to apply.')
    expect(fieldsByName.transactionId.required).toBe(false)
    expect(fieldsByName.transactionId.type).toBe('string')
  })

  test('links $ref body schemas without expanding them; surfaces ref names', async () => {
    const result = await parseOpenApi('ref', REF_SPEC)
    const op = result.operations[0]
    expect(op.requestBody?.refs).toContain('CreateThingRequest')
    expect(op.requestBody?.schemaSummary).toBe('CreateThingRequest')
  })

  test('flattens allOf properties across inline variants; records ref variants', async () => {
    const result = await parseOpenApi('comp', COMPOSITION_SPEC)
    const op = result.operations.find((o) => o.operationId === 'generate')!
    const fieldsByName = Object.fromEntries(op.requestBody!.fields.map((f) => [f.name, f]))
    expect(Object.keys(fieldsByName).toSorted()).toEqual(['locale', 'target'])
    expect(fieldsByName.target.required).toBe(true)
    expect(op.requestBody?.refs).toContain('InstructionContext')
  })

  test('oneOf of refs surfaces all ref names; no fields expanded', async () => {
    const result = await parseOpenApi('comp', COMPOSITION_SPEC)
    const op = result.operations.find((o) => o.operationId === 'classify')!
    expect(op.requestBody?.fields).toEqual([])
    expect(op.requestBody?.refs.toSorted()).toEqual(['ImageInput', 'TextInput'])
  })

  test('array<$ref> body fields surface the element schema name on `ref`', async () => {
    // Without this, the `Schemas referenced` footer silently omits
    // the element type, and agents miss a drill-target.
    const spec = `
openapi: 3.1.1
info:
  title: T
  version: '1.0.0'
servers:
  - url: "https://api.sanity.io/v1"
paths:
  /bulk:
    post:
      operationId: bulkCreate
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [items]
              properties:
                items:
                  type: array
                  items:
                    $ref: '#/components/schemas/Item'
      responses:
        '200':
          description: ok
components:
  schemas:
    Item:
      type: object
      properties:
        id: { type: string }
`
    const result = await parseOpenApi('t', spec)
    const op = result.operations[0]
    const items = op.requestBody!.fields.find((f) => f.name === 'items')!
    expect(items.type).toBe('Item[]')
    expect(items.ref).toBe('Item')
  })

  test('non-JSON body kept opaque (schemaSummary names the content type)', async () => {
    const result = await parseOpenApi('upload', UPLOAD_SPEC)
    const image = result.operations.find((o) => o.operationId === 'uploadImage')!
    expect(image.requestBody?.contentType).toBe('image/jpeg')
    expect(image.requestBody?.fields).toEqual([])
    expect(image.requestBody?.schemaSummary).toBe('<image/jpeg>')

    const multipart = result.operations.find((o) => o.operationId === 'uploadMultipart')!
    expect(multipart.requestBody?.contentType).toBe('multipart/form-data')
    expect(multipart.requestBody?.schemaSummary).toBe('<multipart/form-data>')
  })
})

describe('parseOpenApi — responses', () => {
  test('captures multiple responses sorted by status', async () => {
    const result = await parseOpenApi('ref', REF_SPEC)
    const op = result.operations[0]
    expect(op.responses.map((r) => r.status)).toEqual([200, 404])
  })

  test('records ref name when response schema is a $ref', async () => {
    const result = await parseOpenApi('ref', REF_SPEC)
    const op = result.operations[0]
    const ok = op.responses.find((r) => r.status === 200)!
    expect(ok.ref).toBe('Thing')
    expect(ok.schemaSummary).toBe('Thing')
  })

  test('inlines property names for inline JSON responses', async () => {
    const result = await parseOpenApi('jobs', JOBS_SPEC)
    const op = result.operations.find((o) => o.operationId === 'jobStatus')!
    const ok = op.responses.find((r) => r.status === 200)!
    expect(ok.schemaSummary).toBe('{ id, state, authors }')
  })
})

describe('parseOpenApi — security', () => {
  test("inherits top-level security on operations that don't override", async () => {
    const result = await parseOpenApi('jobs', JOBS_SPEC)
    const op = result.operations[0]
    expect(op.security).toEqual([{scheme: 'BearerAuth'}])
  })

  test('normalizes scheme case (bearerAuth → BearerAuth)', async () => {
    const result = await parseOpenApi('ref', REF_SPEC)
    const op = result.operations[0]
    expect(op.security).toEqual([{scheme: 'BearerAuth'}])
  })
})

describe('parseOpenApi — version-segment shape', () => {
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
    const result = await parseOpenApi('t', spec)
    expect(result.operations[0].endpoint).toBe('v2021-06-07/projects')
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
    const result = await parseOpenApi('t', spec)
    expect(result.operations[0].endpoint).toBe('vX/agent/:organizationId/threads/:threadId')
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
    const result = await parseOpenApi('t', spec)
    expect(result.operations[0].endpoint).toBe(
      'v2026-04-27/organizations/:organizationId/attribute-definitions',
    )
  })

  test('info.version is never used as a path prefix', async () => {
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
    const result = await parseOpenApi('t', spec)
    expect(result.operations[0].endpoint).not.toMatch(/^1\.0\.0/)
    expect(result.operations[0].endpoint.startsWith('v2021-06-07')).toBe(true)
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

describe('parseOpenApi — schemas', () => {
  test('threads components.schemas through ParsedSpec.schemas', async () => {
    const result = await parseOpenApi('ref', REF_SPEC)
    expect(Object.keys(result.schemas).toSorted()).toEqual([
      'CreateThingRequest',
      'ErrorResponse',
      'Thing',
    ])
    const thing = result.schemas.Thing as Record<string, unknown>
    expect(thing.type).toBe('object')
  })

  test('returns an empty object when components.schemas is missing', async () => {
    const spec = `openapi: 3.1.1\ninfo:\n  title: T\n  version: '1'\nservers:\n  - url: https://api.sanity.io/v1\npaths: {}\n`
    const result = await parseOpenApi('t', spec)
    expect(result.schemas).toEqual({})
  })
})
