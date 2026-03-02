import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {SchemaError} from '../../../actions/graphql/SchemaError.js'
import {GraphQLDeployCommand} from '../deploy.js'

const mockExtractGraphQLAPIs = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/graphql/extractGraphQLAPIs.js', () => ({
  extractGraphQLAPIs: mockExtractGraphQLAPIs,
}))

const defaultMocks = {
  cliConfig: {api: {dataset: 'production', projectId: 'test-project'}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#graphql:deploy schema errors', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('catches SchemaError from extractGraphQLAPIs and prints formatted errors', async () => {
    const problemGroups = [
      {
        path: [{kind: 'type' as const, name: 'post', type: 'document'}],
        problems: [{message: 'Unknown type: "nonExistent"', severity: 'error' as const}],
      },
      {
        path: [
          {kind: 'type' as const, name: 'author', type: 'document'},
          {kind: 'property' as const, name: 'bio'},
        ],
        problems: [{message: 'Invalid field definition', severity: 'error' as const}],
      },
    ]

    mockExtractGraphQLAPIs.mockRejectedValue(new SchemaError(problemGroups))

    const {error, stderr} = await testCommand(GraphQLDeployCommand, [], {mocks: defaultMocks})

    expect(error).toBeDefined()
    expect(error?.message).toContain('Fix the schema errors above and try again')
    expect(error?.oclif?.exit).toBe(1)
    expect(stderr).toContain('Found errors in schema:')
  })

  test('includes original error message when extractGraphQLAPIs fails with non-SchemaError', async () => {
    mockExtractGraphQLAPIs.mockRejectedValue(new Error('Vite failed to load config'))

    const {error} = await testCommand(GraphQLDeployCommand, [], {mocks: defaultMocks})

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to resolve GraphQL APIs')
    expect(error?.message).toContain('Vite failed to load config')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('does not treat warning-only schema errors as SchemaError', async () => {
    // When the worker encounters a schema error with only warning-severity problems,
    // it re-throws the original error (not a SchemaError). This ensures warnings
    // don't silently swallow the error — the user sees the original error message
    // rather than the "Fix the schema errors above" message meant for actual errors.
    const warningError = new Error('Schema validation produced warnings')
    mockExtractGraphQLAPIs.mockRejectedValue(warningError)

    const {error, stderr} = await testCommand(GraphQLDeployCommand, [], {mocks: defaultMocks})

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to resolve GraphQL APIs')
    expect(error?.message).toContain('Schema validation produced warnings')
    // Should NOT show the SchemaError-specific message
    expect(stderr).not.toContain('Found errors in schema:')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('includes original message for multi-workspace config errors', async () => {
    mockExtractGraphQLAPIs.mockRejectedValue(
      new Error(
        'Multiple workspaces/sources configured. You must define an array of GraphQL APIs in `sanity.cli.ts`',
      ),
    )

    const {error} = await testCommand(GraphQLDeployCommand, [], {mocks: defaultMocks})

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to resolve GraphQL APIs')
    expect(error?.message).toContain('Multiple workspaces/sources configured')
    expect(error?.oclif?.exit).toBe(1)
  })
})
