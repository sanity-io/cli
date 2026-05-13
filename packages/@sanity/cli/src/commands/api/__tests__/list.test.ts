import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ApiListCommand} from '../list.js'

const JOBS_SPEC_YAML = `
openapi: 3.1.1
info:
  title: Jobs API
  version: 'v2021-06-07'
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
          schema:
            type: string
      responses:
        '200':
          description: ok
`

function mockIndexAndSpecs(specs: Array<{slug: string; title?: string; yaml: string}>) {
  nock('https://www.sanity.io')
    .get('/docs/api/openapi')
    .reply(200, {
      specs: specs.map((s) => ({
        description: '',
        revision: '',
        slug: s.slug,
        title: s.title ?? s.slug,
      })),
    })
  for (const spec of specs) {
    nock('https://www.sanity.io')
      .get(`/docs/api/openapi/${spec.slug}`)
      .query({format: 'yaml'})
      .reply(200, spec.yaml)
  }
}

describe('#api:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('renders the operation table', async () => {
    mockIndexAndSpecs([{slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML}])

    const {stdout} = await testCommand(ApiListCommand)

    expect(stdout).toContain('METHOD')
    expect(stdout).toContain('ENDPOINT')
    expect(stdout).toContain('SPEC')
    expect(stdout).toContain('DESCRIPTION')
    expect(stdout).toContain('GET')
    expect(stdout).toContain('v2021-06-07/jobs/:jobId')
    expect(stdout).toContain('jobs')
    expect(stdout).toContain('Get the status of a job')
  })

  test('emits an operation array under --json', async () => {
    mockIndexAndSpecs([{slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML}])

    const {stdout} = await testCommand(ApiListCommand, ['--json'])

    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      capability: 'read',
      docsUrl: 'https://www.sanity.io/docs/http-reference/jobs',
      endpoint: 'v2021-06-07/jobs/:jobId',
      isStreaming: false,
      method: 'GET',
      operationId: 'jobStatus',
      pathParams: ['jobId'],
      requiredQueryParams: [],
      spec: 'jobs',
      summary: 'Get the status of a job',
    })
  })

  test('--spec narrows to a single spec and only fetches that spec', async () => {
    // Index advertises both specs; `--spec=jobs` should push the filter
    // down into the loader — only the jobs spec body is fetched.
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {
        specs: [
          {description: '', revision: '', slug: 'jobs', title: 'Jobs'},
          {description: '', revision: '', slug: 'mutate', title: 'Mutate'},
        ],
      })
    nock('https://www.sanity.io')
      .get('/docs/api/openapi/jobs')
      .query({format: 'yaml'})
      .reply(200, JOBS_SPEC_YAML)
    // No mock for /docs/api/openapi/mutate — the assertion that no mocks
    // are left pending in afterEach proves we didn't fetch it.

    const {stdout} = await testCommand(ApiListCommand, ['--spec=jobs', '--json'])

    const parsed = JSON.parse(stdout)
    expect(parsed.every((op: {spec: string}) => op.spec === 'jobs')).toBe(true)
    expect(parsed).toHaveLength(1)
  })

  test('--spec=<unknown-slug> emits the empty-result message', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {
        specs: [{description: '', revision: '', slug: 'jobs', title: 'Jobs'}],
      })
    // No per-spec mock — the unknown slug shouldn't trigger a fetch.

    const {stdout} = await testCommand(ApiListCommand, ['--spec=nope'])
    expect(stdout).toContain('No operations found for spec "nope"')
  })

  test('--web opens browser (open is globally mocked)', async () => {
    const {stdout} = await testCommand(ApiListCommand, ['--web'])
    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference')
  })

  test('errors cleanly when the docs service is unreachable', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').replyWithError('Network error')

    const {error} = await testCommand(ApiListCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('OpenAPI service is currently unavailable')
  })

  test('skips entries whose spec endpoint returns 404', async () => {
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {
        specs: [
          {description: '', revision: '', slug: 'jobs', title: 'Jobs'},
          {description: '', revision: '', slug: 'missing', title: 'Missing'},
        ],
      })

    nock('https://www.sanity.io')
      .get('/docs/api/openapi/jobs')
      .query({format: 'yaml'})
      .reply(200, JOBS_SPEC_YAML)

    nock('https://www.sanity.io')
      .get('/docs/api/openapi/missing')
      .query({format: 'yaml'})
      .reply(404)

    const {stdout} = await testCommand(ApiListCommand, ['--json'])

    const parsed = JSON.parse(stdout)
    expect(parsed.every((op: {spec: string}) => op.spec === 'jobs')).toBe(true)
  })

  test('one spec 5xx does not break the whole listing', async () => {
    // Per-spec fetch errors must not poison the run — the docstring on
    // fetchAndParseEntry promises this. Without the try/catch widening,
    // a single Promise.all rejection surfaces "service unavailable" for
    // every other healthy spec.
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {
        specs: [
          {description: '', revision: '', slug: 'jobs', title: 'Jobs'},
          {description: '', revision: '', slug: 'broken', title: 'Broken'},
        ],
      })

    nock('https://www.sanity.io')
      .get('/docs/api/openapi/jobs')
      .query({format: 'yaml'})
      .reply(200, JOBS_SPEC_YAML)

    nock('https://www.sanity.io')
      .get('/docs/api/openapi/broken')
      .query({format: 'yaml'})
      .reply(500, 'internal server error')

    const {stdout} = await testCommand(ApiListCommand, ['--json'])

    const parsed = JSON.parse(stdout)
    expect(parsed.every((op: {spec: string}) => op.spec === 'jobs')).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
  })

  test('honors SANITY_DOCS_API_URL for base-URL override', async () => {
    process.env.SANITY_DOCS_API_URL = 'https://preview.sanity.io/docs'
    try {
      nock('https://preview.sanity.io')
        .get('/docs/api/openapi')
        .reply(200, {
          specs: [{description: '', revision: '', slug: 'jobs', title: 'Jobs'}],
        })
      nock('https://preview.sanity.io')
        .get('/docs/api/openapi/jobs')
        .query({format: 'yaml'})
        .reply(200, JOBS_SPEC_YAML)

      const {stdout} = await testCommand(ApiListCommand, ['--json'])
      expect(JSON.parse(stdout)).toHaveLength(1)
    } finally {
      delete process.env.SANITY_DOCS_API_URL
    }
  })

  test('attaches SANITY_DOCS_API_BYPASS_TOKEN as the Vercel bypass header', async () => {
    process.env.SANITY_DOCS_API_BYPASS_TOKEN = 'secret-token'
    try {
      nock('https://www.sanity.io', {reqheaders: {'x-vercel-protection-bypass': 'secret-token'}})
        .get('/docs/api/openapi')
        .reply(200, {
          specs: [{description: '', revision: '', slug: 'jobs', title: 'Jobs'}],
        })
      nock('https://www.sanity.io', {reqheaders: {'x-vercel-protection-bypass': 'secret-token'}})
        .get('/docs/api/openapi/jobs')
        .query({format: 'yaml'})
        .reply(200, JOBS_SPEC_YAML)

      const {stdout} = await testCommand(ApiListCommand, ['--json'])
      expect(JSON.parse(stdout)).toHaveLength(1)
    } finally {
      delete process.env.SANITY_DOCS_API_BYPASS_TOKEN
    }
  })
})
