import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {extractManifestSafe} from '../../../actions/manifest/extractManifest.js'
import {createManifestReader} from '../../../actions/schema/utils/manifestReader.js'
import {SCHEMA_API_VERSION} from '../../../services/schemas.js'
import {NO_DATASET_ID, NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DeleteSchemaCommand} from '../delete.js'

const mockManifest = {
  createdAt: '2024-01-01T00:00:00.000Z',
  studioVersion: '3.0.0',
  version: 3,
  workspaces: [
    {
      basePath: '/',
      dataset: 'production',
      icon: null,
      name: 'default',
      projectId: 'test-project',
      schema: 'default.create-schema.json',
      tools: 'default.create-tools.json',
    },
    {
      basePath: '/staging',
      dataset: 'staging',
      icon: null,
      name: 'staging',
      projectId: 'test-project',
      schema: 'staging.create-schema.json',
      tools: 'staging.create-tools.json',
    },
  ],
}

const mockSchemas = ['_.schemas.default', '_.schemas.staging']

vi.mock('../../../actions/manifest/extractManifest.js')
vi.mock('../../../actions/schema/utils/manifestReader.js')

const mockedGetCliConfig = vi.mocked(getCliConfig)
const mockExtractManifestSafe = vi.mocked(extractManifestSafe)
const mockedCreateManifestReader = vi.mocked(createManifestReader)
const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {dataset: 'production', projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#schema:delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    for (const schema of mockSchemas) {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        uri: `/projects/test-project/datasets/production/schemas/${schema}`,
      }).reply(200, [{}])
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        uri: `/projects/test-project/datasets/staging/schemas/${schema}`,
      }).reply(200, [{}])
    }

    mockedGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: 'test-project',
      },
    })

    mockedCreateManifestReader.mockReturnValue({
      getManifest: vi.fn().mockResolvedValue(mockManifest),
      getWorkspaceSchema: vi.fn(),
    })

    mockExtractManifestSafe.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['schema delete', '--help'])

    expect(stdout).toContain('Delete schema documents by id')
    expect(stdout).toContain('--ids')
    expect(stdout).toContain('--dataset')
    expect(stdout).toContain('--extract-manifest')
    expect(stdout).toContain('--manifest-dir')
    expect(stdout).toContain('--verbose')
  })

  test('successfully deletes a single schema', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(200, {deleted: true})

    const {error, stdout} = await testCommand(
      DeleteSchemaCommand,
      ['--ids', 'sanity.workspace.schema.workspaceName'],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('Successfully deleted 1/1 schemas')
    expect(error).toBeUndefined()
  })

  test('successfully deletes multiple schemas', async () => {
    for (const schema of mockSchemas) {
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'delete',
        uri: `/projects/test-project/datasets/production/schemas/${schema}`,
      }).reply(200, {deleted: true})
      mockApi({
        apiVersion: SCHEMA_API_VERSION,
        method: 'delete',
        uri: `/projects/test-project/datasets/staging/schemas/${schema}`,
      }).reply(200, {deleted: true})
    }

    const {error, stdout} = await testCommand(
      DeleteSchemaCommand,
      ['--ids', '_.schemas.default,_.schemas.staging'],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('Successfully deleted 2/2 schemas')
    expect(error).toBeUndefined()
  })

  test('filters schemas by dataset when dataset flag is provided', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})

    const {error, stdout} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.default',
      '--dataset',
      'production',
    ])

    expect(stdout).toContain('Successfully deleted 1/1 schemas')
    expect(error).toBeUndefined()
  })

  test.each([
    {desc: 'no project ID is found', projectId: undefined},
    {desc: 'project ID is empty string', projectId: ''},
  ])('throws an error if $desc', async ({projectId}) => {
    mockedGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId,
      },
    })

    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.default'])

    expect(error?.message).toContain(NO_PROJECT_ID)
  })

  test.each([
    {dataset: undefined, desc: 'no dataset is found'},
    {dataset: '', desc: 'dataset is empty string'},
  ])('throws an error if $desc', async ({dataset}) => {
    mockedGetCliConfig.mockResolvedValue({
      api: {
        dataset,
        projectId: 'test-project',
      },
    })

    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.default'])

    expect(error?.message).toContain(NO_DATASET_ID)
  })

  test('throws an error if ids is an empty string', async () => {
    const {error} = await testCommand(DeleteSchemaCommand, ['--ids'])

    expect(error?.message).toContain('Flag --ids expects a value')
  })

  test.each([
    {
      desc: 'ids with invalid characters (!)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      ids: 'test-id!!',
    },
    {
      desc: 'ids with invalid characters (@)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      ids: '_.schemas.default@tag',
    },
    {
      desc: 'id starts with dash',
      expectedError: 'id cannot start with - (dash)',
      ids: '-_.schemas.default',
    },
    {
      desc: 'id has consecutive periods',
      expectedError: 'id cannot have consecutive . (period) characters',
      ids: '_.schemas..default',
    },
    {
      desc: 'id missing required prefix',
      expectedError: 'id must either match _.schemas.<workspaceName>',
      ids: 'schemas.default',
    },
    {
      desc: 'id has invalid workspace name (space)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      ids: '_.schemas.default workspace',
    },
    {
      desc: 'duplicate ids in comma-separated list',
      expectedError: 'ids contains duplicates',
      ids: '_.schemas.default,_.schemas.default',
    },
    {
      desc: 'comma-separated with one duplicate',
      expectedError: 'ids contains duplicates',
      ids: '_.schemas.production,_.schemas.staging,_.schemas.production',
    },
    {
      desc: 'all entries are empty after trimming',
      expectedError: 'ids contains no valid id strings',
      ids: ' , , ',
    },
  ])('throws error when $desc', async ({expectedError, ids}) => {
    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', ids])

    expect(error?.message).toContain(expectedError)
  })

  test('throws error when dataset flag is not provided a value', async () => {
    const {error} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.default',
      '--dataset',
    ])

    expect(error?.message).toContain('Flag --dataset expects a value')
  })

  test('throws an error when schema is not found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/test-project/datasets/production/schemas/_.schemas.nonexistent`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/test-project/datasets/staging/schemas/_.schemas.nonexistent`,
    }).reply(200, [])

    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.nonexistent'])

    expect(error?.message).toContain('Deleted 0/1 schemas')
    expect(error?.message).toContain('not found')
  })

  test('throws an error when some schemas are not found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/test-project/datasets/production/schemas/_.schemas.nonexistent`,
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/test-project/datasets/staging/schemas/_.schemas.nonexistent`,
    }).reply(200, [])

    const {error} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.default,_.schemas.nonexistent',
    ])

    expect(error?.message).toContain('Deleted 1/2 schemas')
  })

  test('throws an error if delete request fails', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(403, {
      error: 'Delete failed',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(403, {
      error: 'Delete failed',
    })

    const {error} = await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.default'])

    expect(error?.message).toContain('Failed to delete schema')
  })

  test('outputs a verbose warning when verbose flag is enabled', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(403, {
      error: 'Delete failed',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(403, {
      error: 'Delete failed',
    })

    const {error, stderr} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      '_.schemas.default',
      '--verbose',
    ])

    expect(stderr).toContain('Failed to delete schema "_.schemas.default"')
    expect(stderr).toContain('DeleteIdError: Delete failed')
    expect(error?.message).toContain('Deleted 0/1 schemas')
  })

  test('outputs a warning on projectId mismatch', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})

    const mismatchManifest = {
      ...mockManifest,
      workspaces: [
        {...mockManifest.workspaces[0], projectId: 'test-project'},
        {...mockManifest.workspaces[1], projectId: 'different-project'},
      ],
    }

    mockedCreateManifestReader.mockReturnValue({
      getManifest: vi.fn().mockResolvedValue(mismatchManifest),
      getWorkspaceSchema: vi.fn(),
    })

    const {stderr, stdout} = await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.default'])

    expect(stderr).toContain('No permissions to read schema for workspace "staging"')
    expect(stdout).toContain('Successfully deleted 1/1 schemas')
  })

  test('skips manifest extraction with no-extract-manifest flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.default',
    }).reply(200, {deleted: true})
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.default',
    }).reply(200, {deleted: true})

    await testCommand(DeleteSchemaCommand, ['--ids', '_.schemas.default', '--no-manifest-extract'])

    expect(mockExtractManifestSafe).not.toHaveBeenCalled()
  })
})
