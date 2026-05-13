import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import open from 'open'
import {describe, expect, test} from 'vitest'

import {ApiSpecCommand} from '../spec.js'
import {JOBS_SPEC_YAML, mockIndexAndSpecs, setupApiTestCleanup} from './fixtures.js'

const OPTIONAL_QUERY_SPEC_YAML = `
openapi: 3.1.1
info:
  title: Search API
  version: 'v2024-01-01'
servers:
  - url: 'https://api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2024-01-01'
paths:
  /things:
    get:
      summary: List things
      operationId: listThings
      parameters:
        - in: query
          name: limit
          schema:
            type: integer
      responses:
        '200':
          description: ok
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

describe('#api:spec', () => {
  setupApiTestCleanup()

  test('default renders the structured human view', async () => {
    mockIndexAndSpecs([{slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML}])

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
    mockIndexAndSpecs([{slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML}])

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
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_SPEC_YAML}])

    const {stdout} = await testCommand(ApiSpecCommand, ['jobs', '--format=openapi'])
    expect(stdout).toContain('openapi: 3.1.1')
    expect(stdout).toContain('operationId: jobStatus')
    // YAML, not JSON
    expect(stdout.trim().startsWith('{')).toBe(false)
  })

  test('--operation narrows to a single operation', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_SPEC_YAML}])

    const {stdout} = await testCommand(ApiSpecCommand, [
      'jobs',
      '--operation=jobStatus',
      '--format=json',
    ])
    const parsed = JSON.parse(stdout)
    expect(parsed.operations).toHaveLength(1)
    expect(parsed.operations[0].operationId).toBe('jobStatus')
  })

  test('--operation conflicts with --format=openapi', async () => {
    // The raw YAML passthrough is the upstream spec verbatim — narrowing
    // to a single operation would either silently produce a mismatched
    // output or require slicing the YAML. We refuse upfront so a typo
    // in `--operation` doesn't succeed silently. No index fetch should
    // happen for this argv combo.
    const {error} = await testCommand(ApiSpecCommand, [
      'jobs',
      '--operation=jobStatus',
      '--format=openapi',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Cannot narrow `--format=openapi`')
  })

  test('--operation errors with known operationIds on unknown id', async () => {
    mockIndexAndSpecs([{slug: 'jobs', yaml: JOBS_SPEC_YAML}])

    const {error} = await testCommand(ApiSpecCommand, ['jobs', '--operation=nope'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Operation "nope" not found')
    expect(error?.message).toContain('jobStatus')
  })

  test('--schema prints a component schema (JSON default)', async () => {
    // Agents are the primary consumer following a `$ref` pointer; JSON
    // is parseable without a YAML library. Humans opt into YAML with
    // `--format=yaml`.
    mockIndexAndSpecs([{slug: 'refs', yaml: REF_SPEC_YAML}])

    const {stdout} = await testCommand(ApiSpecCommand, ['refs', '--schema', 'Thing'])
    const parsed = JSON.parse(stdout)
    expect(parsed).toEqual({
      properties: {id: {type: 'string'}, name: {type: 'string'}},
      type: 'object',
    })
  })

  test('--schema --format=yaml prints the schema as YAML', async () => {
    mockIndexAndSpecs([{slug: 'refs', yaml: REF_SPEC_YAML}])

    const {stdout} = await testCommand(ApiSpecCommand, [
      'refs',
      '--schema',
      'Thing',
      '--format=yaml',
    ])
    expect(stdout).toContain('type: object')
    expect(stdout).toContain('id:')
    expect(stdout).toContain('name:')
    // YAML output, not JSON: opening character is not `{`.
    expect(stdout.trim().startsWith('{')).toBe(false)
  })

  test('--schema --format=json prints the schema as JSON (matches default)', async () => {
    mockIndexAndSpecs([{slug: 'refs', yaml: REF_SPEC_YAML}])

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
    mockIndexAndSpecs([{slug: 'refs', yaml: REF_SPEC_YAML}])

    const {error} = await testCommand(ApiSpecCommand, ['refs', '--schema', 'Nope'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Schema "Nope" not found')
    expect(error?.message).toContain('CreateThingRequest')
    expect(error?.message).toContain('Thing')
  })

  test('--schema rejects prototype method names (no Object.prototype walk)', async () => {
    // `--schema toString` previously slipped past the `in` guard and
    // rendered `Object.prototype.toString` as JSON `undefined`. With
    // `Object.hasOwn` it's surfaced as not-found cleanly.
    mockIndexAndSpecs([{slug: 'refs', yaml: REF_SPEC_YAML}])
    const {error} = await testCommand(ApiSpecCommand, ['refs', '--schema', 'toString'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Schema "toString" not found')
  })

  test('--schema conflicts with --operation', async () => {
    // Without the guard, `--schema X --operation typoId` would silently
    // succeed: the schema branch returns before the operation lookup
    // ever runs. The guard fires before any index fetch, so no nock
    // mocks are registered.
    const {error} = await testCommand(ApiSpecCommand, [
      'refs',
      '--schema',
      'Thing',
      '--operation=anything',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('`--operation` is not compatible with `--schema`')
  })

  test('--schema conflicts with --format=openapi', async () => {
    // Guard fires before any index fetch — no mocks registered.
    const {error} = await testCommand(ApiSpecCommand, [
      'refs',
      '--schema',
      'Thing',
      '--format=openapi',
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('`--format=openapi` is not compatible with `--schema`')
  })

  test('parse errors propagate distinctly from service-unavailable', async () => {
    // A spec with duplicate operationIds is the canonical "spec is bad,
    // service is fine" case. Without the parse/fetch split in
    // `loadSingleSpecOrThrow`, the user would get the misleading
    // "service is unavailable" message.
    const DUPE_YAML = `
openapi: 3.1.1
info:
  title: Dupe API
  version: 'v1'
servers:
  - url: 'https://api.sanity.io/v1'
paths:
  /a:
    get:
      operationId: same
      responses: {'200': {description: ok}}
  /b:
    get:
      operationId: same
      responses: {'200': {description: ok}}
`
    mockIndexAndSpecs([{slug: 'dupe', yaml: DUPE_YAML}])
    const {error} = await testCommand(ApiSpecCommand, ['dupe'])
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('duplicate operationId')
    expect(error?.message).not.toContain('service is currently unavailable')
  })

  test('omits "Query params (required)" when only optional params exist', async () => {
    // Empty-section regression: an operation with only optional query
    // params used to render a dead `Query params (required): (none)`
    // block. The gate keeps the required block out entirely when there's
    // nothing to show.
    mockIndexAndSpecs([{slug: 'search', title: 'Search API', yaml: OPTIONAL_QUERY_SPEC_YAML}])

    const {stdout} = await testCommand(ApiSpecCommand, ['search'])
    expect(stdout).not.toContain('Query params (required)')
    expect(stdout).toContain('Query params (optional)')
    expect(stdout).toContain('limit  integer  optional')
  })

  test('schemas-referenced footer points back at --schema', async () => {
    mockIndexAndSpecs([{slug: 'refs', yaml: REF_SPEC_YAML}])

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
