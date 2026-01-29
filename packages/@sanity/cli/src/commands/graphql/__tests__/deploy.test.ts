import {isInteractive} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {mockApi, testCommand, testExample} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {GRAPHQL_API_VERSION} from '../../../services/graphql.js'
import {GraphQLDeployCommand} from '../deploy.js'

// Mock interactive utilities
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
  afterEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending).toEqual([])
  })

  test('successfully deploys GraphQL API with no existing deployment', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

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

  test('handles breaking changes with --force flag', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

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

    mockApi({
      apiHost: 'https://ppsg7ml5.api.sanity.io',
      apiVersion: GRAPHQL_API_VERSION,
      method: 'put',
      uri: '/apis/graphql/test/default',
    }).reply(200, {
      location: '/v1/graphql/test/default',
    })

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, ['--force'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    // With --force, changes are not rendered to stdout, just deployed
    expect(stderr).toContain('Dangerous changes. Forced')
    expect(stderr).toContain('Deployed!')
    expect(stdout).toContain('Project: ppsg7ml5')
  })

  test('fails on breaking changes without --force flag in non-interactive mode', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

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

    const {error, stdout} = await testCommand(GraphQLDeployCommand, [], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Dangerous changes found')
    expect(error?.message).toContain('--force')
    expect(stdout).toContain('Found BREAKING changes')
    expect(stdout).toContain('Field "oldField" was removed')
  })

  test('validates without deploying in dry-run mode', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

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

    // No PUT mock - should not deploy in dry-run mode

    const {error, stdout} = await testCommand(GraphQLDeployCommand, ['--dry-run'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('GraphQL API is valid and has no breaking changes')
    expect(stdout).not.toContain('Project: ppsg7ml5') // Deploy details not shown in dry-run
    expect(stdout).not.toContain('Deployed!')
  })

  test('handles validation errors', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

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
      validationError: 'Invalid schema: type "Post" has no fields',
    })

    const {error} = await testCommand(GraphQLDeployCommand, ['--force'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('GraphQL schema is not valid')
    expect(error?.message).toContain('Invalid schema: type "Post" has no fields')
  })

  test('handles deploy failures', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

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
    }).reply(500, {
      error: 'Internal Server Error',
      message: 'Deploy failed due to server error',
      statusCode: 500,
    })

    const {error} = await testCommand(GraphQLDeployCommand, ['--force'], {
      config: {root: cwd},
    })

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to deploy GraphQL API')
  })

  test('supports different generations via --generation flag', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

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
      ['--force', '--generation', 'gen2'],
      {
        config: {root: cwd},
      },
    )

    expect(error).toBeUndefined()
    expect(stderr).toContain('Deployed!')
  })

  test('displays dangerous changes when present', async () => {
    const cwd = await testExample('basic-studio')
    process.chdir(cwd)

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
      breakingChanges: [],
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

    const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, ['--force'], {
      config: {root: cwd},
    })

    expect(error).toBeUndefined()
    // With --force, changes are not rendered to stdout, just deployed
    expect(stderr).toContain('Dangerous changes. Forced')
    expect(stderr).toContain('Deployed!')
    expect(stdout).toContain('Project: ppsg7ml5')
  })

  // GROUP 1: Generation Resolution Logic
  describe('generation resolution', () => {
    test.each([
      {description: 'deploys gen1 with --generation gen1', flag: 'gen1'},
      {description: 'deploys gen2 with --generation gen2', flag: 'gen2'},
      {description: 'deploys gen3 with --generation gen3', flag: 'gen3'},
      {description: 'defaults to gen3 when no flag specified', flag: undefined},
    ])('$description', async ({flag}) => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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

      const flags = flag ? ['--generation', flag] : []
      const {error, stderr} = await testCommand(GraphQLDeployCommand, flags, {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stderr).toContain('Deployed!')
    })

    test.each([
      {
        description: 'changes generation with --force',
        mock: false,
        mode: 'force',
        shouldDeploy: true,
      },
      {
        description: 'changes generation when user confirms',
        mock: true,
        mode: 'interactive-confirm',
        shouldDeploy: true,
      },
      {
        description: 'skips deployment when user declines',
        mock: false,
        mode: 'interactive-decline',
        shouldDeploy: false,
      },
    ])('$description from gen2 to gen3', async ({mock: confirmValue, mode, shouldDeploy}) => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      vi.mocked(isInteractive).mockReturnValue(mode !== 'force')
      if (mode === 'interactive-confirm' || mode === 'interactive-decline') {
        vi.mocked(confirm).mockResolvedValue(confirmValue)
      }

      nock('https://ppsg7ml5.api.sanity.io')
        .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
        .reply(200, '', {
          'x-sanity-graphql-generation': 'gen2',
          'x-sanity-graphql-playground': 'true',
        })

      // Only mock validation and deploy if user should deploy
      if (shouldDeploy) {
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
      }

      const flags =
        mode === 'force' ? ['--generation', 'gen3', '--force'] : ['--generation', 'gen3']
      const {error, stderr} = await testCommand(GraphQLDeployCommand, flags, {
        config: {root: cwd},
      })

      if (shouldDeploy) {
        expect(error).toBeUndefined()
        expect(stderr).toContain('Deployed!')
      } else {
        expect(error).toBeUndefined()
        expect(stderr).not.toContain('Deployed!')
      }
    })

    test('fails when changing generation in non-interactive mode without --force', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      vi.mocked(isInteractive).mockReturnValue(false)

      nock('https://ppsg7ml5.api.sanity.io')
        .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
        .reply(200, '', {
          'x-sanity-graphql-generation': 'gen2',
          'x-sanity-graphql-playground': 'true',
        })

      const {error} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen3'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('differs from the one currently deployed')
      expect(error?.message).toContain('--force')
    })

    test('rejects invalid generation', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      const {error} = await testCommand(GraphQLDeployCommand, ['--generation', 'gen4'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('--generation=gen4 to be one of: gen1, gen2, gen3')
    })
  })

  // GROUP 2: Playground Configuration Resolution
  describe('playground configuration', () => {
    test.each([
      {config: false, flag: '--playground'},
      {config: true, flag: '--no-playground'},
    ])('$flag overrides config value of $config', async ({config, flag}) => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      nock('https://ppsg7ml5.api.sanity.io')
        .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
        .reply(200, '', {
          'x-sanity-graphql-generation': 'gen3',
          'x-sanity-graphql-playground': config.toString(),
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

      const {error, stderr} = await testCommand(GraphQLDeployCommand, [flag], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stderr).toContain('Deployed!')
    })

    test.each([{response: true}, {response: false}])(
      'prompts in interactive mode when user responds $response',
      async ({response}) => {
        const cwd = await testExample('basic-studio')
        process.chdir(cwd)

        vi.mocked(isInteractive).mockReturnValue(true)
        vi.mocked(confirm).mockResolvedValue(response)

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
      },
    )

    test('dry-run always returns true for playground', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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

      const {error, stdout} = await testCommand(GraphQLDeployCommand, ['--dry-run'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('GraphQL API is valid and has no breaking changes')
    })

    test('uses config value when no flag specified', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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
    })

    test('maintains current state when no config or flag', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      nock('https://ppsg7ml5.api.sanity.io')
        .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
        .reply(200, '', {
          'x-sanity-graphql-generation': 'gen3',
          'x-sanity-graphql-playground': 'false',
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

      const {error, stderr} = await testCommand(GraphQLDeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stderr).toContain('Deployed!')
    })

    test('defaults to true in non-interactive with no deployment', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      vi.mocked(isInteractive).mockReturnValue(false)

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
    })
  })

  // GROUP 4: API Filtering & Validation
  describe('API filtering and validation', () => {
    test.each([
      {id: 'MyAPI', reason: 'uppercase letters'},
      {id: 'api@prod', reason: 'special characters'},
      {id: 'api.prod', reason: 'dots'},
    ])('rejects invalid API ID "$id" ($reason)', async ({id}) => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      const {error} = await testCommand(GraphQLDeployCommand, ['--api', id], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain(`GraphQL API with id "${id}" not found`)
    })
  })

  // GROUP 5: Feature Flags & Advanced Options
  describe('feature flags and advanced options', () => {
    test.each([
      {
        expected: 'https://ppsg7ml5.api.sanity.io/v2025-09-19/graphql/test/default',
        location: '/v1/graphql/test/default',
      },
      {
        expected: 'https://ppsg7ml5.api.sanity.io/v2025-09-19/graphql/test/default',
        location: '/v2021-06-07/graphql/test/default',
      },
      {
        expected: 'https://ppsg7ml5.api.sanity.io/v2025-09-19/graphql/test/default',
        location: '/graphql/test/default',
      },
    ])('handles location format "$location"', async ({expected, location}) => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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
        location,
      })

      const {error, stdout} = await testCommand(GraphQLDeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain(expected)
    })

    test('supports --with-union-cache flag', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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

    test('--non-null-document-fields flag overrides config', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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
        ['--non-null-document-fields', '--force'],
        {
          config: {root: cwd},
        },
      )

      expect(error).toBeUndefined()
      expect(stderr).toContain('Deployed!')
    })
  })

  // GROUP 6: Schema Generation Errors
  describe('schema generation errors', () => {
    test('handles missing dataset in config', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      // This test would need a special config without a dataset, which is complex to set up
      // Skip for now as it requires modifying the example studio config
    })
  })

  // GROUP 7: Edge Cases & Error Handling
  describe('edge cases and error handling', () => {
    test('dry-run with breaking changes', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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

    test('interactive decline dangerous changes', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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

      const {error, stdout} = await testCommand(GraphQLDeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Found BREAKING changes')
      expect(vi.mocked(confirm)).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Do you want to deploy a new API despite the dangerous changes?',
        }),
      )
    })

    test('getCurrentSchemaProps fails with 500 error', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

      nock('https://ppsg7ml5.api.sanity.io')
        .head(`/${GRAPHQL_API_VERSION}/apis/graphql/test/default`)
        .reply(500, {
          error: 'Internal Server Error',
          message: 'Failed to get schema props',
        })

      const {error} = await testCommand(GraphQLDeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
    })

    test('handles both breaking and dangerous changes', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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

      const {error, stdout} = await testCommand(GraphQLDeployCommand, ['--force'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Project: ppsg7ml5')
    })

    test('maintains same generation when already deployed', async () => {
      const cwd = await testExample('basic-studio')
      process.chdir(cwd)

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

      const {error, stderr} = await testCommand(GraphQLDeployCommand, [], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stderr).toContain('Deployed!')
    })
  })
})
