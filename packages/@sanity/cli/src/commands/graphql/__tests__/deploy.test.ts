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

describe('#graphql:deploy', {timeout: 30 * 1000}, () => {
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

  test('successfully deploys GraphQL API with no existing deployment', async () => {
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

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, {
      location: '/v1/graphql/test/default',
    })

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('Project: ppsg7ml5')
    expect(stdout).toContain('Dataset: test')
    expect(stdout).toContain('Tag:')
    expect(stdout).toContain('default')
    expect(stdout).toContain('URL:')
    expect(stdout).toContain('https://ppsg7ml5.api.sanity.io/v2025-09-19/graphql/test/default')
    expect(stderr).toContain('Deployed!')
  })

  test('handles breaking and dangerous changes with --force flag', async () => {
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
      dangerousChanges: [
        {
          description: 'Field "count" changed type from "Int" to "String"',
          type: 'FIELD_CHANGED_TYPE',
        },
      ],
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

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, ['--force'])

    expect(error).toBeUndefined()
    expect(stderr).toContain('Dangerous changes. Forced')
    expect(stderr).toContain('Deployed!')
    expect(stdout).toContain('Project: ppsg7ml5')
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

  describe('dry-run mode', () => {
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

  describe('generation resolution', () => {
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

    test('rejects invalid --generation flag', async () => {
      const {error} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen4'])

      expect(error).toBeDefined()
      expect(error?.message).toContain('--generation=gen4 to be one of: gen1, gen2, gen3')
    })
  })

  describe('configuration', () => {
    test('--playground flag overrides existing config', async () => {
      nock('https://ppsg7ml5.api.sanity.io')
        .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
        .reply(200, '', {
          'x-sanity-graphql-generation': 'gen3',
          'x-sanity-graphql-playground': 'false', // Currently disabled
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

      const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--playground'])

      expect(error).toBeUndefined()
      expect(stderr).toContain('Deployed!')
    })

    test('prompts for playground in interactive mode for new deployment', async () => {
      vi.mocked(isInteractive).mockReturnValue(true)
      vi.mocked(confirm).mockResolvedValue(true)

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

      mockApi({
        apiHost: 'https://ppsg7ml5.api.sanity.io',
        apiVersion: GRAPHQL_API_VERSION,
        method: 'put',
        uri: '/apis/graphql/test/default',
      }).reply(200, {
        location: '/v1/graphql/test/default',
      })

      const {error, stderr} = await testCommand(GraphQLDeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stderr).toContain('Deployed!')
      expect(vi.mocked(confirm)).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Do you want to enable a GraphQL playground?',
        }),
      )
    })

    test('rejects invalid API ID', async () => {
      const {error} = await testCommand(GraphQLDeployCommand, ['--api', 'MyAPI'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('GraphQL API with id "MyAPI" not found')
    })
  })

  describe('advanced options', () => {
    test('handles various location response formats', async () => {
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

      // Test with versioned location path
      mockApi({
        apiHost: 'https://ppsg7ml5.api.sanity.io',
        apiVersion: GRAPHQL_API_VERSION,
        method: 'put',
        uri: '/apis/graphql/test/default',
      }).reply(200, {
        location: '/v2021-06-07/graphql/test/default',
      })

      const {error, stdout} = await testCommand(GraphQLDeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('https://ppsg7ml5.api.sanity.io/v2025-09-19/graphql/test/default')
    })

    test('supports --with-union-cache flag', async () => {
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

      mockApi({
        apiHost: 'https://ppsg7ml5.api.sanity.io',
        apiVersion: GRAPHQL_API_VERSION,
        method: 'put',
        uri: '/apis/graphql/test/default',
      }).reply(200, {
        location: '/v1/graphql/test/default',
      })

      const {error, stderr} = await testCommand(
        GraphQLDeployCommand,
        ['--with-union-cache', '--force'],
        {
          config: {root: cwd},
        },
      )

      expect(error).toBeUndefined()
      expect(stderr).toContain('Deployed!')
    })
  })

  describe('interactive mode', () => {
    test('prompts and allows user to decline dangerous changes', async () => {
      vi.mocked(isInteractive).mockReturnValue(true)
      vi.mocked(confirm).mockResolvedValue(false)

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

      expect(error).toBeUndefined()
      expect(stdout).toContain('Found BREAKING changes')
      expect(vi.mocked(confirm)).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Do you want to deploy a new API despite the dangerous changes?',
        }),
      )
    })
  })
})
