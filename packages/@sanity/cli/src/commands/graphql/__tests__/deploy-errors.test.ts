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

describe('#graphql:deploy errors', {timeout: 30 * 1000}, () => {
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

  test('fails on breaking changes without --force in non-interactive mode', async () => {
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

    const {error, stdout} = await testCommand(GraphQLDeployCommand, [])

    expect(error).toBeDefined()
    expect(error?.message).toContain('Dangerous changes found')
    expect(error?.message).toContain('--force')
    expect(stdout).toContain('Found BREAKING changes')
    expect(stdout).toContain('Field "oldField" was removed')
  })

  describe('error handling', () => {
    test.each([
      {
        deployReply: null,
        description: 'validation errors',
        expectedError: 'GraphQL schema is not valid',
        headReply: 404,
        validateReply: {
          body: {
            breakingChanges: [],
            dangerousChanges: [],
            validationError: 'Invalid schema: type "Post" has no fields',
          },
          status: 200,
        },
      },
      {
        deployReply: {
          body: {error: 'Internal Server Error', message: 'Deploy failed'},
          status: 500,
        },
        description: 'deploy failures',
        expectedError: 'Failed to deploy GraphQL API',
        headReply: 404,
        validateReply: {
          body: {breakingChanges: [], dangerousChanges: [], validationError: null},
          status: 200,
        },
      },
      {
        deployReply: null,
        description: 'getCurrentSchemaProps 500 error',
        expectedError: true, // Just check error is defined
        headReply: 500,
        validateReply: null,
      },
    ])('handles $description', async ({deployReply, expectedError, headReply, validateReply}) => {
      nock('https://ppsg7ml5.api.sanity.io')
        .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
        .reply(headReply)

      if (validateReply) {
        mockApi({
          apiHost: 'https://ppsg7ml5.api.sanity.io',
          apiVersion: GRAPHQL_API_VERSION,
          method: 'post',
          uri: '/apis/graphql/test/default/validate',
        }).reply(validateReply.status, validateReply.body)
      }

      if (deployReply) {
        mockApi({
          apiHost: 'https://ppsg7ml5.api.sanity.io',
          apiVersion: GRAPHQL_API_VERSION,
          method: 'put',
          uri: '/apis/graphql/test/default',
        }).reply(deployReply.status, deployReply.body)
      }

      const {error} = await testCommand(GraphQLDeployCommand, ['--force'])

      expect(error).toBeDefined()
      if (typeof expectedError === 'string') {
        expect(error?.message).toContain(expectedError)
      }
    })
  })

  test('rejects invalid --generation flag', async () => {
    const {error} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen4'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('--generation=gen4 to be one of: gen1, gen2, gen3')
  })

  test('rejects invalid API ID', async () => {
    const {error} = await testCommand(GraphQLDeployCommand, ['--api', 'MyAPI'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('GraphQL API with id "MyAPI" not found')
  })
})
