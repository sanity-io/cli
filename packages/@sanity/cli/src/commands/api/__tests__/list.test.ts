import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

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

const MUTATE_SPEC_YAML = `
openapi: 3.1.1
info:
  title: Mutate API
  version: 'v2024-01-01'
servers:
  - url: 'https://api.sanity.io/{apiVersion}'
    variables:
      apiVersion:
        default: 'v2024-01-01'
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
`

async function seedCache(
  cacheRoot: string,
  specs: Array<{revision: string; slug: string; yaml: string}>,
) {
  const apiDir = path.join(cacheRoot, 'api')
  await fs.mkdir(path.join(apiDir, 'specs'), {recursive: true})
  const revisions: Record<string, string> = {}
  for (const spec of specs) {
    revisions[spec.slug] = spec.revision
    await fs.writeFile(path.join(apiDir, 'specs', `${spec.slug}.yaml`), spec.yaml, 'utf8')
  }
  await fs.writeFile(path.join(apiDir, 'revisions.json'), JSON.stringify(revisions), 'utf8')
}

describe('#api:list', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanity-cli-api-list-test-'))
    process.env.SANITY_CLI_CACHE_PATH = tmpDir
  })

  afterEach(async () => {
    delete process.env.SANITY_CLI_CACHE_PATH
    await fs.rm(tmpDir, {force: true, recursive: true})
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('renders the operation table when cache is warm', async () => {
    await seedCache(tmpDir, [{revision: 'rev1', slug: 'jobs', yaml: JOBS_SPEC_YAML}])

    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {
        specs: [{description: 'Job ops', revision: 'rev1', slug: 'jobs', title: 'Jobs API'}],
      })

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
    await seedCache(tmpDir, [{revision: 'rev1', slug: 'jobs', yaml: JOBS_SPEC_YAML}])

    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: [{description: '', revision: 'rev1', slug: 'jobs', title: 'Jobs API'}]})

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

  test('--spec narrows to a single spec', async () => {
    await seedCache(tmpDir, [
      {revision: 'rev1', slug: 'jobs', yaml: JOBS_SPEC_YAML},
      {revision: 'rev2', slug: 'mutate', yaml: MUTATE_SPEC_YAML},
    ])

    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {
        specs: [
          {description: '', revision: 'rev1', slug: 'jobs', title: 'Jobs'},
          {description: '', revision: 'rev2', slug: 'mutate', title: 'Mutate'},
        ],
      })

    const {stdout} = await testCommand(ApiListCommand, ['--spec=jobs', '--json'])

    const parsed = JSON.parse(stdout)
    expect(parsed.every((op: {spec: string}) => op.spec === 'jobs')).toBe(true)
    expect(parsed).toHaveLength(1)
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

  test('refetches when upstream revision changes', async () => {
    await seedCache(tmpDir, [{revision: 'rev1', slug: 'jobs', yaml: JOBS_SPEC_YAML}])

    // Upstream advances to rev2 → CLI should refetch
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: [{description: '', revision: 'rev2', slug: 'jobs', title: 'Jobs'}]})

    nock('https://www.sanity.io')
      .get('/docs/api/openapi/jobs')
      .query({format: 'yaml'})
      .reply(200, JOBS_SPEC_YAML)

    const {stdout} = await testCommand(ApiListCommand)
    expect(stdout).toContain('v2021-06-07/jobs/:jobId')

    // Cache now reflects rev2
    const revisions = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'api', 'revisions.json'), 'utf8'),
    )
    expect(revisions.jobs).toBe('rev2')
  })
})
