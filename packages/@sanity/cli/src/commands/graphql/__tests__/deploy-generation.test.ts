import {isInteractive} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest'

import {GRAPHQL_API_VERSION} from '../../../services/graphql.js'
import {GraphQLDeployCommand} from '../deploy.js'

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    isInteractive: vi.fn(),
  }
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    confirm: vi.fn(),
  }
})

describe('#graphql:deploy generation', {timeout: 30 * 1000}, () => {
  let cwd: string

  beforeAll(async () => {
    cwd = await testFixture('basic-studio')
    process.chdir(cwd)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending).toEqual([])
  })

  test('uses specified generation flag and maintains existing', async () => {
    // Test: maintains existing gen2 when no flag specified
    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
      })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: null,
    })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, {
      location: '/v1/graphql/test/default',
    })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, [])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
  })

  test('changes generation with --force from gen2 to gen3', async () => {
    vi.mocked(isInteractive).mockReturnValue(false)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
      })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [],
      dangerousChanges: [],
      validationError: null,
    })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, {
      location: '/v1/graphql/test/default',
    })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, [
      '--generation',
      'gen3',
      '--force',
    ])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
  })

  test('prompts for generation change in interactive mode', async () => {
    vi.mocked(isInteractive).mockReturnValue(true)
    vi.mocked(confirm).mockResolvedValue(false) // User declines

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
      })

    const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen3'])

    expect(error).toBeUndefined()
    expect(stderr).not.toContain('Deployed!')
  })

  test('fails changing generation in non-interactive mode without --force', async () => {
    vi.mocked(isInteractive).mockReturnValue(false)

    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen2',
        'x-sanity-graphql-playground': 'true',
      })

    const {error} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen3'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('differs from the one currently deployed')
    expect(error?.message).toContain('--force')
  })
})
