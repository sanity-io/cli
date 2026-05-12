import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ListOpenApiCommand} from '../list.js'

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

/**
 * `sanity openapi list` is a deprecation forwarder for `sanity api list`.
 * These tests assert the forwarder semantics: stderr warning + delegation
 * to the canonical command.
 */
describe('#openapi:list (deprecation forwarder)', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanity-cli-openapi-list-test-'))
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

  test('emits a deprecation warning and delegates to api list', async () => {
    await seedCache(tmpDir, 'rev1', JOBS_SPEC_YAML)
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: [{description: '', revision: 'rev1', slug: 'jobs', title: 'Jobs API'}]})

    const {stderr, stdout} = await testCommand(ListOpenApiCommand)

    // Warning on stderr, naming the canonical command.
    expect(stderr).toContain('deprecated')
    expect(stderr).toContain('sanity api list')

    // Stdout is the canonical `api list` output — operation row table.
    expect(stdout).toContain('METHOD')
    expect(stdout).toContain('v2021-06-07/jobs/:jobId')
  })

  test('forwards --json flag through', async () => {
    await seedCache(tmpDir, 'rev1', JOBS_SPEC_YAML)
    nock('https://www.sanity.io')
      .get('/docs/api/openapi')
      .reply(200, {specs: [{description: '', revision: 'rev1', slug: 'jobs', title: 'Jobs API'}]})

    const {stderr, stdout} = await testCommand(ListOpenApiCommand, ['--json'])
    expect(stderr).toContain('deprecated')

    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]).toMatchObject({operationId: 'jobStatus', spec: 'jobs'})
  })

  test('forwards --web flag', async () => {
    const {stdout} = await testCommand(ListOpenApiCommand, ['--web'])
    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference')
  })
})
