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

describe('#graphql:deploy dry-run', {timeout: 30 * 1000}, () => {
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

  test('validates without deploying and reports breaking changes', async () => {
    // Test valid schema (no breaking changes)
    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(404)

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

    const validResult = await testCommand(GraphQLDeployCommand, ['--dry-run'])

    expect(validResult.error).toBeUndefined()
    expect(validResult.stdout).toContain('GraphQL API is valid and has no breaking changes')
    expect(validResult.stdout).not.toContain('Project: ppsg7ml5')
    expect(validResult.stdout).not.toContain('Deployed!')
  })

  test('reports breaking changes and sets exit code', async () => {
    nock('https://ppsg7ml5.api.sanity.io')
      .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
      .reply(200, '', {
        'x-sanity-graphql-generation': 'gen3',
        'x-sanity-graphql-playground': 'true',
      })

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'post',
      uri: '/apis/graphql/test/default/validate',
    }).reply(200, {
      breakingChanges: [
        {
          description: 'Field "oldField" was removed from object type "Post"',
          type: 'FIELD_REMOVED',
        },
      ],
      dangerousChanges: [],
      validationError: null,
    })

    const {stdout} = await testCommand(GraphQLDeployCommand, ['--dry-run'], {
      config: {root: cwd},
    })

    expect(stdout).toContain('Found BREAKING changes')
    expect(stdout).toContain('Field "oldField" was removed')
    expect(process.exitCode).toBe(1)
    process.exitCode = 0 // Reset for other tests
  })
})
