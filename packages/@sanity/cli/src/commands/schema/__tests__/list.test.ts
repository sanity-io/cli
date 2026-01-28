import {runCommand} from '@oclif/test'
import {mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {extractManifestSafe} from '../../../actions/manifest/extractManifest.js'
import {createManifestReader} from '../../../actions/schema/utils/manifestReader.js'
import {SCHEMA_API_VERSION} from '../../../services/schemas.js'
import {NO_DATASET_ID, NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {ListSchemaCommand} from '../list.js'

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

vi.mock('../../../actions/manifest/extractManifest.js')
vi.mock('../../../actions/schema/utils/manifestReader.js')

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

describe('#schema:list', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedCreateManifestReader.mockReturnValue({
      getManifest: vi.fn().mockResolvedValue(mockManifest),
      getWorkspaceSchema: vi.fn(),
    })

    mockExtractManifestSafe.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should show --help text', async () => {
    const {stdout} = await runCommand(['schema', 'list', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Lists all schemas in the current dataset.

      USAGE
        $ sanity schema list [--extract-manifest] [--id <schema_id>] [--json]
          [--manifest-dir <directory>]

      FLAGS
        --[no-]extract-manifest     Disables manifest generation - the command will
                                    fail if no manifest exists
        --id=<schema_id>            Fetch a single schema by id
        --json                      Get schema as json
        --manifest-dir=<directory>  [default: ./dist/static] Directory containing
                                    manifest file

      DESCRIPTION
        Lists all schemas in the current dataset.

        **Note**: This command is experimental and subject to change.

        This operation (re-)generates a manifest file describing the sanity config
        workspace by default.
        To re-use an existing manifest file, use --no-extract-manifest.

      EXAMPLES
        List all schemas found in any workspace dataset in a table

          $ sanity schema list

        Get a schema for a given id

          $ sanity schema list --id _.schemas.workspaceName

        Get stored schemas as pretty-printed json-array

          $ sanity schema list --json

        Get singular stored schema as pretty-printed json-object

          $ sanity schema list --json --id _.schemas.workspaceName

        Runs using a pre-existing manifest file. Config changes in sanity.config
        will not be picked up in this case.

          $ sanity schema list --no-extract-manifest

      "
    `)
  })

  test('should list schemas', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${testProjectId}/datasets/production/schemas`,
    }).reply(200, {
      _createdAt: '2025-01-21T18:49:44Z',
      _id: '_.schemas.default',
      workspace: mockManifest.workspaces[0],
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: `/projects/${testProjectId}/datasets/staging/schemas`,
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const {stdout} = await testCommand(ListSchemaCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain(
      'Id                  Workspace   Dataset      ProjectId      CreatedAt           ',
    )
    expect(stdout).toContain(
      '_.schemas.staging   staging     staging      test-project   2025-05-28T18:49:44Z',
    )
    expect(stdout).toContain(
      '_.schemas.default   default     production   test-project   2025-01-21T18:49:44Z',
    )
  })

  test('should list a specific schema based on id flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.staging',
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.staging',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const {stdout} = await testCommand(ListSchemaCommand, ['--id', '_.schemas.staging'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain(
      'Id                  Workspace   Dataset   ProjectId      CreatedAt           ',
    )
    expect(stdout).toContain(
      '_.schemas.staging   staging     staging   test-project   2025-05-28T18:49:44Z',
    )
  })

  test('should list schemas in json', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, {
      _createdAt: '2025-01-21T18:49:44Z',
      _id: '_.schemas.default',
      workspace: mockManifest.workspaces[0],
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const {stdout} = await testCommand(ListSchemaCommand, ['--json'], {mocks: defaultMocks})

    // eslint-disable-next-line no-useless-escape
    expect(stdout).toContain(`\"_id\": \"_.schemas.default\"`)
  })

  test('should list a specific schema based on id flag in json', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.staging',
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.staging',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    const {stdout} = await testCommand(ListSchemaCommand, ['--id', '_.schemas.staging', '--json'], {
      mocks: defaultMocks,
    })

    // eslint-disable-next-line no-useless-escape
    expect(stdout).toContain(`\"_id\": \"_.schemas.staging\"`)
  })

  test.each([
    {desc: 'no project ID is found', projectId: undefined},
    {desc: 'project ID is empty string', projectId: ''},
  ])('throws an error if $desc', async ({projectId}) => {
    const {error} = await testCommand(ListSchemaCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset: 'production', projectId}},
      },
    })

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {dataset: undefined, desc: 'no dataset is found'},
    {dataset: '', desc: 'dataset is empty string'},
  ])('throws an error if $desc', async ({dataset}) => {
    const {error} = await testCommand(ListSchemaCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset, projectId: 'test-project'}},
      },
    })

    expect(error?.message).toContain(NO_DATASET_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {
      desc: 'empty string',
      expectedError: 'id argument is empty',
      id: '',
    },
    {
      desc: 'invalid characters (!)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      id: 'test-id!!',
    },
    {
      desc: 'invalid characters (@)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      id: '_.schemas.default@tag',
    },
    {
      desc: 'starts with dash',
      expectedError: 'id cannot start with - (dash)',
      id: '-_.schemas.default',
    },
    {
      desc: 'consecutive periods',
      expectedError: 'id cannot have consecutive . (period) characters',
      id: '_.schemas..default',
    },
    {
      desc: 'missing required prefix',
      expectedError: 'id must either match _.schemas.<workspaceName>',
      id: 'schemas.default',
    },
    {
      desc: 'incorrect prefix',
      expectedError: 'id must either match _.schemas.<workspaceName>',
      id: 'sanity.schemas.default',
    },
    {
      desc: 'workspace name with invalid characters (space)',
      expectedError: 'id can only contain characters in [a-zA-Z0-9._-]',
      id: '_.schemas.my workspace',
    },
  ])('throws error when id is $desc', async ({expectedError, id}) => {
    const {error} = await testCommand(ListSchemaCommand, ['--id', id], {mocks: defaultMocks})

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if no schemas are found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, [])

    const {error} = await testCommand(ListSchemaCommand, [], {mocks: defaultMocks})

    expect(error?.message).toContain('No schemas found in datasets ["production","staging"]')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if a specific schema based on id flag is not found', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas/_.schemas.staging',
    }).reply(200, [])
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas/_.schemas.staging',
    }).reply(200, [])

    const {error} = await testCommand(ListSchemaCommand, ['--id', '_.schemas.staging'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain(
      'Schema for id "_.schemas.staging" not found in datasets ["production","staging"]',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if schema request fails', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(400, {
      error: 'Bad request',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, [])

    const {error} = await testCommand(ListSchemaCommand, [], {mocks: defaultMocks})

    expect(error?.message).toContain('↳ Failed to fetch schema from "production":\n  Bad request')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws an error if schema request fails due to permissions', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(401)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, [])

    const {stderr} = await testCommand(ListSchemaCommand, [], {mocks: defaultMocks})

    expect(stderr).toContain('↳ No permissions to read schema from "production".')
  })

  test('skips manifest extraction with no-extract-manifest flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, {
      _createdAt: '2025-01-21T18:49:44Z',
      _id: '_.schemas.default',
      workspace: mockManifest.workspaces[0],
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, {
      _createdAt: '2025-05-28T18:49:44Z',
      _id: '_.schemas.staging',
      workspace: mockManifest.workspaces[1],
    })

    await testCommand(ListSchemaCommand, ['--no-extract-manifest'], {mocks: defaultMocks})

    expect(mockExtractManifestSafe).not.toHaveBeenCalled()
  })
})
