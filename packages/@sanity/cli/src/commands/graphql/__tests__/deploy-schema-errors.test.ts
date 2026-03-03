import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {SchemaError} from '../../../actions/graphql/SchemaError.js'
import {type ExtractedGraphQLAPI} from '../../../actions/graphql/types.js'
import {GraphQLDeployCommand} from '../deploy.js'

const mockExtractGraphQLAPIs = vi.hoisted(() => vi.fn())
const mockConfirm = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/graphql/extractGraphQLAPIs.js', () => ({
  extractGraphQLAPIs: mockExtractGraphQLAPIs,
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: mockConfirm,
  }
})

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

  describe('per-API extraction errors', () => {
    test('reports per-API schema errors and exits with code 1', async () => {
      const apis: ExtractedGraphQLAPI[] = [
        {
          dataset: 'production',
          projectId: 'test-project',
          schemaErrors: [
            {
              path: [{kind: 'type' as const, name: 'post', type: 'document'}],
              problems: [{message: 'Unknown type: "badRef"', severity: 'error' as const}],
            },
          ],
        },
      ]
      mockExtractGraphQLAPIs.mockResolvedValue(apis)

      const {error, stderr} = await testCommand(GraphQLDeployCommand, [], {mocks: defaultMocks})

      expect(error).toBeDefined()
      expect(error?.oclif?.exit).toBe(1)
      expect(stderr).toContain('Schema errors in production/default:')
    })

    test('reports per-API extraction errors and exits with code 1', async () => {
      const apis: ExtractedGraphQLAPI[] = [
        {
          dataset: 'production',
          extractionError: 'Cannot read properties of undefined',
          projectId: 'test-project',
        },
      ]
      mockExtractGraphQLAPIs.mockResolvedValue(apis)

      const {error, stdout} = await testCommand(GraphQLDeployCommand, [], {mocks: defaultMocks})

      expect(error).toBeDefined()
      expect(error?.oclif?.exit).toBe(1)
      expect(stdout).toContain('Cannot read properties of undefined')
    })

    test('reports all per-API errors instead of stopping at first', async () => {
      const apis: ExtractedGraphQLAPI[] = [
        {
          dataset: 'production',
          id: 'api-one',
          projectId: 'test-project',
          schemaErrors: [
            {
              path: [{kind: 'type' as const, name: 'post', type: 'document'}],
              problems: [{message: 'Error in api-one', severity: 'error' as const}],
            },
          ],
        },
        {
          dataset: 'staging',
          extractionError: 'Error in api-two',
          id: 'api-two',
          projectId: 'test-project',
        },
      ]
      mockExtractGraphQLAPIs.mockResolvedValue(apis)

      const {error, stderr, stdout} = await testCommand(GraphQLDeployCommand, [], {
        mocks: defaultMocks,
      })

      expect(error).toBeDefined()
      expect(error?.oclif?.exit).toBe(1)
      // Both errors should be reported, not just the first
      expect(stderr).toContain('Schema errors in production/default:')
      expect(stdout).toContain('Error in api-two')
    })

    test('handles missing extraction result', async () => {
      const apis: ExtractedGraphQLAPI[] = [
        {
          dataset: 'production',
          projectId: 'test-project',
          // No extracted, no schemaErrors, no extractionError
        },
      ]
      mockExtractGraphQLAPIs.mockResolvedValue(apis)

      const {error, stdout} = await testCommand(GraphQLDeployCommand, [], {mocks: defaultMocks})

      expect(error).toBeDefined()
      expect(error?.oclif?.exit).toBe(1)
      expect(stdout).toContain('No extraction result')
    })
  })

  describe('multi-API flag override', () => {
    const multiApiMocks = {
      ...defaultMocks,
      cliConfig: {
        api: {dataset: 'production', projectId: 'test-project'},
        graphql: [{id: 'api-1', tag: 'default'}, {id: 'api-2', tag: 'staging'}],
      },
    }

    test('warns and prompts when flags override multiple APIs', async () => {
      const apis: ExtractedGraphQLAPI[] = [
        {dataset: 'production', extracted: {interfaces: [], types: []}, projectId: 'test-project'},
        {dataset: 'staging', extracted: {interfaces: [], types: []}, projectId: 'test-project'},
      ]
      mockExtractGraphQLAPIs.mockResolvedValue(apis)
      mockConfirm.mockResolvedValue(false)

      const {error, stderr} = await testCommand(GraphQLDeployCommand, ['--tag', 'custom'], {
        mocks: multiApiMocks,
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Operation cancelled')
      expect(stderr).toContain('--tag')
      expect(stderr).toContain('for ALL APIs')
    })

    test('skips confirmation with --force when flags override multiple APIs', async () => {
      const apis: ExtractedGraphQLAPI[] = [
        {dataset: 'production', extracted: {interfaces: [], types: []}, projectId: 'test-project'},
        {dataset: 'staging', extracted: {interfaces: [], types: []}, projectId: 'test-project'},
      ]
      mockExtractGraphQLAPIs.mockResolvedValue(apis)

      const {stderr} = await testCommand(
        GraphQLDeployCommand,
        ['--tag', 'custom', '--force', '--dry-run'],
        {mocks: multiApiMocks},
      )

      expect(stderr).toContain('--force specified, continuing')
      // Should not prompt
      expect(mockConfirm).not.toHaveBeenCalled()
    })
  })
})
