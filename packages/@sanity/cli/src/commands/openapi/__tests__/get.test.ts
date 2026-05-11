import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {GetOpenApiCommand} from '../get.js'

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

async function seedCache(cacheRoot: string, revision: string, yaml: string) {
  const apiDir = path.join(cacheRoot, 'api')
  await fs.mkdir(path.join(apiDir, 'specs'), {recursive: true})
  await fs.writeFile(path.join(apiDir, 'specs', 'jobs.yaml'), yaml, 'utf8')
  await fs.writeFile(path.join(apiDir, 'revisions.json'), JSON.stringify({jobs: revision}), 'utf8')
}

function mockIndex(revision: string) {
  return nock('https://www.sanity.io')
    .get('/docs/api/openapi')
    .reply(200, {
      specs: [{description: '', revision, slug: 'jobs', title: 'Jobs API'}],
    })
}

/**
 * `sanity openapi get` is a deprecation forwarder for `sanity api spec`.
 * Tests assert: stderr warning, default-output change, legacy --format
 * translation (yaml → openapi).
 */
describe('#openapi:get (deprecation forwarder)', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanity-cli-openapi-get-test-'))
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

  test('emits deprecation warning and delegates (default = structured human view)', async () => {
    await seedCache(tmpDir, 'rev1', JOBS_SPEC_YAML)
    mockIndex('rev1')

    const {stderr, stdout} = await testCommand(GetOpenApiCommand, ['jobs'])

    expect(stderr).toContain('deprecated')
    expect(stderr).toContain('sanity api spec')

    // Default is structured human view (NOT raw YAML — that's the behavior change)
    expect(stdout).toContain('Jobs API — v2021-06-07')
    expect(stdout).toContain('GET  v2021-06-07/jobs/:jobId')
  })

  test('legacy --format=yaml translates to --format=openapi (raw YAML output)', async () => {
    await seedCache(tmpDir, 'rev1', JOBS_SPEC_YAML)
    mockIndex('rev1')

    const {stdout} = await testCommand(GetOpenApiCommand, ['jobs', '--format=yaml'])

    // Raw OpenAPI YAML byte-for-byte.
    expect(stdout).toContain('openapi: 3.1.1')
    expect(stdout).toContain('operationId: jobStatus')
  })

  test('legacy --format=json delegates to --format=json (now structured per-op JSON)', async () => {
    await seedCache(tmpDir, 'rev1', JOBS_SPEC_YAML)
    mockIndex('rev1')

    const {stdout} = await testCommand(GetOpenApiCommand, ['jobs', '--format=json'])

    const parsed = JSON.parse(stdout)
    expect(parsed).toMatchObject({spec: 'jobs', version: 'v2021-06-07'})
    expect(parsed.operations).toHaveLength(1)
  })

  test('forwards --web flag', async () => {
    const {stdout} = await testCommand(GetOpenApiCommand, ['jobs', '--web'])
    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference/jobs')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference/jobs')
  })
})
