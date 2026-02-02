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
