import {testCommand} from '@sanity/cli-test'
import nock, {cleanAll, pendingMocks} from 'nock'
import open from 'open'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ListOpenApiCommand} from '../list.js'

const INDEX_PAYLOAD = {
  specs: [
    {description: 'Job ops', revision: 'rev1', slug: 'jobs', title: 'Jobs API'},
    {description: '', revision: 'rev2', slug: 'mutate', title: 'Mutate API'},
  ],
}

/**
 * `sanity openapi list` is deprecated but preserves the pre-deprecation
 * output shape for the duration of the deprecation window. These tests
 * lock that contract: one row per spec, `{title, slug, description}`.
 * The new operation-level shape lives on `sanity api list`.
 */
describe('#openapi:list (deprecated, back-compat shape)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('emits a deprecation warning on stderr', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').reply(200, INDEX_PAYLOAD)

    const {stderr} = await testCommand(ListOpenApiCommand)
    expect(stderr).toContain('deprecated')
    expect(stderr).toContain('sanity api list')
  })

  test('--json emits one row per spec (back-compat shape)', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').reply(200, INDEX_PAYLOAD)

    const {stdout} = await testCommand(ListOpenApiCommand, ['--json'])

    const parsed = JSON.parse(stdout)
    expect(parsed).toEqual([
      {description: 'Job ops', slug: 'jobs', title: 'Jobs API'},
      {description: '', slug: 'mutate', title: 'Mutate API'},
    ])
    // `revision` from the docs index must not leak into the public shape.
    expect(parsed[0]).not.toHaveProperty('revision')
  })

  test('default output is the pre-deprecation human format', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').reply(200, INDEX_PAYLOAD)

    const {stdout} = await testCommand(ListOpenApiCommand)
    expect(stdout).toContain('Found 2 OpenAPI specification(s):')
    expect(stdout).toContain('Title: Jobs API')
    expect(stdout).toContain('Slug: jobs')
    expect(stdout).toContain('Description: Job ops')
    expect(stdout).toContain("Use 'sanity openapi get <slug>'")
  })

  test('omits the description line when description is empty', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').reply(200, INDEX_PAYLOAD)

    const {stdout} = await testCommand(ListOpenApiCommand)
    // mutate has no description — should not render a blank "Description:" line
    expect(stdout).toContain('Slug: mutate')
    const mutateSection = stdout.slice(stdout.indexOf('Slug: mutate'))
    expect(mutateSection).not.toMatch(/Description: /)
  })

  test('handles an empty index without crashing', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').reply(200, {specs: []})

    const {stdout} = await testCommand(ListOpenApiCommand)
    expect(stdout).toContain('No OpenAPI specifications available.')
  })

  test('--web opens browser without hitting the index endpoint', async () => {
    const {stdout} = await testCommand(ListOpenApiCommand, ['--web'])
    expect(stdout).toContain('Opening https://www.sanity.io/docs/http-reference')
    expect(open).toHaveBeenCalledWith('https://www.sanity.io/docs/http-reference')
  })

  test('errors cleanly when the docs service is unreachable', async () => {
    nock('https://www.sanity.io').get('/docs/api/openapi').replyWithError('Network error')

    const {error} = await testCommand(ListOpenApiCommand)
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('OpenAPI service is currently unavailable')
    // `openapi list` wraps with `this.error(..., {exit: 1})` directly,
    // so the exit code is on the error. (api/list.ts propagates the
    // plain Error from the seam, which oclif handles separately.)
    expect(error?.oclif?.exit).toBe(1)
  })
})
