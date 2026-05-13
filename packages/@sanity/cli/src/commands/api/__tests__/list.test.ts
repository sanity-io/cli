import {testCommand} from '@sanity/cli-test'
import nock from 'nock'
import open from 'open'
import {describe, expect, test} from 'vitest'

import {ApiListCommand} from '../list.js'
import {
  JOBS_SPEC_YAML,
  mockIndexAndSpecs,
  MUTATE_SPEC_YAML,
  setupApiTestCleanup,
} from './fixtures.js'

describe('#api:list', () => {
  setupApiTestCleanup()

  test('renders the operation table', async () => {
    mockIndexAndSpecs([{slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML}])

    const {stdout} = await testCommand(ApiListCommand)

    expect(stdout).toContain('METHOD')
    expect(stdout).toContain('ENDPOINT')
    expect(stdout).toContain('SPEC')
    expect(stdout).toContain('OPERATION')
    expect(stdout).toContain('DESCRIPTION')
    expect(stdout).toContain('GET')
    expect(stdout).toContain('v2021-06-07/jobs/:jobId')
    expect(stdout).toContain('jobs')
    expect(stdout).toContain('jobStatus')
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
      optionalQueryParams: ['detail'],
      pathParams: ['jobId'],
      requiredQueryParams: [],
      spec: 'jobs',
      summary: 'Get the status of a job',
    })
  })

  test('--method narrows to a single HTTP verb', async () => {
    mockIndexAndSpecs([
      {slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML},
      {slug: 'mutate', title: 'Mutate API', yaml: MUTATE_SPEC_YAML},
    ])

    const {stdout} = await testCommand(ApiListCommand, ['--method=POST', '--json'])
    const parsed = JSON.parse(stdout)
    expect(parsed.every((op: {method: string}) => op.method === 'POST')).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].operationId).toBe('mutateDocuments')
  })

  test('--capability narrows to one capability bucket', async () => {
    mockIndexAndSpecs([
      {slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML},
      {slug: 'mutate', title: 'Mutate API', yaml: MUTATE_SPEC_YAML},
    ])

    const {stdout} = await testCommand(ApiListCommand, ['--capability=destructive', '--json'])
    const parsed = JSON.parse(stdout)
    expect(parsed.every((op: {capability: string}) => op.capability === 'destructive')).toBe(true)
    expect(parsed.map((op: {operationId: string}) => op.operationId)).toEqual(['dropDataset'])
  })

  test('--grep matches substring across endpoint, operationId, and summary', async () => {
    mockIndexAndSpecs([
      {slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML},
      {slug: 'mutate', title: 'Mutate API', yaml: MUTATE_SPEC_YAML},
    ])

    // 'mutations' only appears in `mutateDocuments`'s summary
    // ("Apply mutations") — neither endpoint nor `dropDataset`'s
    // summary mentions the word, so the filter narrows cleanly.
    const {stdout} = await testCommand(ApiListCommand, ['--grep=mutations', '--json'])
    const parsed = JSON.parse(stdout)
    expect(parsed.map((op: {operationId: string}) => op.operationId)).toEqual(['mutateDocuments'])
  })

  test('--grep is case-insensitive', async () => {
    mockIndexAndSpecs([{slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML}])

    const {stdout} = await testCommand(ApiListCommand, ['--grep=JOBSTATUS', '--json'])
    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].operationId).toBe('jobStatus')
  })

  test('--method + --grep combine (AND semantics)', async () => {
    mockIndexAndSpecs([
      {slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML},
      {slug: 'mutate', title: 'Mutate API', yaml: MUTATE_SPEC_YAML},
    ])

    const {stdout} = await testCommand(ApiListCommand, [
      '--method=DELETE',
      '--grep=dataset',
      '--json',
    ])
    const parsed = JSON.parse(stdout)
    expect(parsed.map((op: {operationId: string}) => op.operationId)).toEqual(['dropDataset'])
  })

  test('filters with no matches surface a filter-aware empty message', async () => {
    mockIndexAndSpecs([{slug: 'jobs', title: 'Jobs API', yaml: JOBS_SPEC_YAML}])

    const {stdout} = await testCommand(ApiListCommand, ['--method=DELETE'])
    expect(stdout).toContain('No operations match method=DELETE')
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
    expect(stdout).toContain('No operations match spec="nope"')
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
