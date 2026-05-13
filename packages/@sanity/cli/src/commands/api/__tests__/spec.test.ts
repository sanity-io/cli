import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ApiSpecCommand} from '../spec.js'

const JOBS_SPEC_YAML = `
openapi: 3.1.1
info:
  title: Jobs API
  version: 'v2021-06-07'
  description: Manage jobs
security:
  - BearerAuth: []
servers:
  - url: 'https://api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2021-06-07'
paths:
  /jobs/{jobId}:
    get:
      summary: Get the status of a job
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
`

const REF_SPEC_YAML = `
openapi: 3.1.1
info:
  title: Refs API
  version: 'v2024-01-01'
servers:
  - url: 'https://api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2024-01-01'
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
`

function mockIndexAndSpec(slug: string, yaml: string, title = slug) {
  nock('https://www.sanity.io')
    .get('/docs/api/openapi')
    .reply(200, {
      specs: [{description: '', revision: '', slug, title}],
    })
  nock('https://www.sanity.io')
    .get(`/docs/api/openapi/${slug}`)
    .query({format: 'yaml'})
    .reply(200, yaml)
}

describe('#api:spec', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('default renders the structured human view', async () => {
    mockIndexAndSpec('jobs', JOBS_SPEC_YAML, 'Jobs API')

    const {stdout} = await testCommand(ApiSpecCommand, ['jobs'])

    // Header
    expect(stdout).toContain('Jobs API — v2021-06-07')
    expect(stdout).toContain('Docs: https://www.sanity.io/docs/http-reference/jobs')
    // Operation block
    expect(stdout).toContain('GET  v2021-06-07/jobs/:jobId  ·  jobStatus  ·  read')
    expect(stdout).toContain('Path params:')
    expect(stdout).toContain('jobId  string  required')
    expect(stdout).toContain('The job identifier.')
    expect(stdout).toContain('Responses:')
    expect(stdout).toContain('200  application/json  { id, state }')
    expect(stdout).toContain('Auth: BearerAuth')
  })

  test('--format=json emits the structured per-operation envelope', async () => {
    mockIndexAndSpec('jobs', JOBS_SPEC_YAML, 'Jobs API')

    const {stdout} = await testCommand(ApiSpecCommand, ['jobs', '--format=json'])

    const parsed = JSON.parse(stdout)
    expect(parsed).toMatchObject({
      docsUrl: 'https://www.sanity.io/docs/http-reference/jobs',
      spec: 'jobs',
      title: 'Jobs API',
      version: 'v2021-06-07',
    })
    expect(parsed.operations).toHaveLength(1)
    const op = parsed.operations[0]
    expect(op).toMatchObject({
      capability: 'read',
      endpoint: 'v2021-06-07/jobs/:jobId',
      method: 'GET',
      operationId: 'jobStatus',
    })
    expect(op.pathParams[0]).toMatchObject({
      in: 'path',
      name: 'jobId',
      required: true,
      type: 'string',
    })
  })

  test('--format=openapi passes through the raw YAML', async () => {
    mockIndexAndSpec('jobs', JOBS_SPEC_YAML)

    const {stdout} = await testCommand(ApiSpecCommand, ['jobs', '--format=openapi'])
    expect(stdout).toContain('openapi: 3.1.1')
    expect(stdout).toContain('operationId: jobStatus')
    // YAML, not JSON
    expect(stdout.trim().startsWith('{')).toBe(false)
  })

  test('--operation narrows to a single operation', async () => {
    mockIndexAndSpec('jobs', JOBS_SPEC_YAML)

    const {stdout} = await testCommand(ApiSpecCommand, [
      'jobs',
      '--operation=jobStatus',
      '--format=json',
    ])
    const parsed = JSON.parse(stdout)
    expect(parsed.operations).toHaveLength(1)
    expect(parsed.operations[0].operationId).toBe('jobStatus')
  })

  test('--operation errors with known operationIds on unknown id', async () => {
    mockIndexAndSpec('jobs', JOBS_SPEC_YAML)

    const {error} = await testCommand(ApiSpecCommand, ['jobs', '--operation=nope'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Operation "nope" not found')
    expect(error?.message).toContain('jobStatus')
  })

  test('--schema prints a component schema (YAML default)', async () => {
    mockIndexAndSpec('refs', REF_SPEC_YAML)

    const {stdout} = await testCommand(ApiSpecCommand, ['refs', '--schema', 'Thing'])
    expect(stdout).toContain('type: object')
    expect(stdout).toContain('id:')
    expect(stdout).toContain('name:')
  })

  test('--schema --format=json prints the schema as JSON', async () => {
    mockIndexAndSpec('refs', REF_SPEC_YAML)

    const {stdout} = await testCommand(ApiSpecCommand, [
      'refs',
      '--schema',
      'Thing',
      '--format=json',
    ])
    const parsed = JSON.parse(stdout)
    expect(parsed).toEqual({
      properties: {id: {type: 'string'}, name: {type: 'string'}},
      type: 'object',
    })
  })

  test('--schema errors with known schemas on unknown name', async () => {
    mockIndexAndSpec('refs', REF_SPEC_YAML)

    const {error} = await testCommand(ApiSpecCommand, ['refs', '--schema', 'Nope'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Schema "Nope" not found')
    expect(error?.message).toContain('CreateThingRequest')
    expect(error?.message).toContain('Thing')
  })

  test('schemas-referenced footer points back at --schema', async () => {
    mockIndexAndSpec('refs', REF_SPEC_YAML)

    const {stdout} = await testCommand(ApiSpecCommand, ['refs'])
    expect(stdout).toContain('Schemas referenced: CreateThingRequest, Thing')
    expect(stdout).toContain('Resolve any: sanity api spec refs --schema <name>')
  })

  test('--web opens browser without hitting the docs endpoint', async () => {
    const {stdout} = await testCommand(ApiSpecCommand, ['jobs', '--web'])
    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference/jobs')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference/jobs')
  })

  test('unknown slug errors with a helpful hint', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {
        specs: [{description: '', revision: '', slug: 'jobs', title: 'Jobs'}],
      })

    const {error} = await testCommand(ApiSpecCommand, ['nope'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Spec "nope" not found')
    expect(error?.message).toContain('sanity api list')
  })

  test('errors cleanly when the docs service is unreachable', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').replyWithError('Network error')

    const {error} = await testCommand(ApiSpecCommand, ['jobs'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('OpenAPI service is currently unavailable')
  })
})
