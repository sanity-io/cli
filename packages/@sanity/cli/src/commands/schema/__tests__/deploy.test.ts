import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {extractManifestSafe} from '../../../actions/manifest/extractManifest.js'
import {createManifestReader} from '../../../actions/schema/utils/manifestReader.js'
import {SCHEMA_API_VERSION} from '../../../services/schemas.js'
import {NO_DATASET_ID, NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DeploySchemaCommand} from '../deploy.js'

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

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', async () => ({
  findProjectRoot: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn(),
}))

vi.mock('../../../actions/manifest/extractManifest.js')
vi.mock('../../../actions/schema/utils/manifestReader.js')

const mockedGetCliConfig = vi.mocked(getCliConfig)
const mockExtractManifestSafe = vi.mocked(extractManifestSafe)
const mockedCreateManifestReader = vi.mocked(createManifestReader)

describe('#schema:deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks()

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

  test('should show --help text', async () => {
    const {stdout} = await runCommand(['schema', 'deploy', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Deploy schema documents into workspace datasets.

      USAGE
        $ sanity schema deploy [--extract-manifest] [--manifest-dir <directory>]
          [--tag <tag>] [--verbose] [--workspace <name>]

      FLAGS
        --[no-]extract-manifest     Disables manifest generation - the command will
                                    fail if no manifest exists
        --manifest-dir=<directory>  [default: ./dist/static] Directory containing
                                    manifest file
        --tag=<tag>                 Add a tag suffix to the schema id
        --verbose                   Print detailed information during deployment
        --workspace=<name>          The name of the workspace to deploy a schema for

      DESCRIPTION
        Deploy schema documents into workspace datasets.

        **Note**: This command is experimental and subject to change.

        This operation (re-)generates a manifest file describing the sanity config
        workspace by default.
        To re-use an existing manifest file, use --no-extract-manifest.

      EXAMPLES
        Deploy all workspace schemas

          $ sanity schema deploy

        Deploy the schema for only the workspace "default"

          $ sanity schema deploy --workspace default

        Runs using a pre-existing manifest file. Config changes in sanity.config
        will not be picked up in this case.

          $ sanity schema deploy --no-extract-manifest

      "
    `)
  })

  test('should deploy schemas', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, undefined)

    const {stdout} = await testCommand(DeploySchemaCommand)

    expect(stdout).toContain('Deployed 2/2 schemas')
    expect(stdout).toContain('↳ List deployed schemas with: sanity schema list')
  })

  test('should deploy a specific schema based on workspace flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)

    const {stdout} = await testCommand(DeploySchemaCommand, ['--workspace', 'default'])

    expect(stdout).toContain('Deployed 1/1 schemas')
    expect(stdout).toContain('↳ List deployed schemas with: sanity schema list')
  })

  test('should enable verbose logging with verbose flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, undefined)

    const {stdout} = await testCommand(DeploySchemaCommand, ['--verbose'])

    expect(stdout).toContain(
      '↳ schemaId: _.schemas.default, projectId: test-project, dataset: production',
    )
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

    const {error} = await testCommand(DeploySchemaCommand)

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

    const {error} = await testCommand(DeploySchemaCommand)

    expect(error?.message).toContain(NO_DATASET_ID)
  })

  test.each([{flag: 'tag'}, {flag: 'workspace'}])(
    'throws error when $flag flag is empty string',
    async ({flag}) => {
      const {error} = await testCommand(DeploySchemaCommand, [`--${flag}`, ''])

      expect(error?.message).toContain(`${flag} argument is empty`)
    },
  )

  test.each([
    {
      desc: 'contains period',
      expectedError: 'tag cannot contain . (period)',
      tag: 'test.tag',
    },
    {
      desc: 'starts with dash',
      expectedError: 'tag cannot start with - (dash)',
      tag: '-testtag',
    },
    {
      desc: 'contains invalid character (space)',
      expectedError: 'tag can only contain characters in [a-zA-Z0-9_-]',
      tag: 'test tag',
    },
    {
      desc: 'contains invalid character (@)',
      expectedError: 'tag can only contain characters in [a-zA-Z0-9_-]',
      tag: 'test@tag',
    },
    {
      desc: 'contains invalid character (!)',
      expectedError: 'tag can only contain characters in [a-zA-Z0-9_-]',
      tag: 'test!',
    },
    {
      desc: 'contains multiple periods',
      expectedError: 'tag cannot contain . (period)',
      tag: 'test.tag.name',
    },
  ])('throws error when tag $desc', async ({expectedError, tag}) => {
    const {error} = await testCommand(DeploySchemaCommand, ['--tag', tag])

    expect(error?.message).toContain(expectedError)
  })

  test.each([
    {
      desc: 'valid tag with alphanumeric',
      tag: 'v1',
    },
    {
      desc: 'valid tag with underscore',
      tag: 'feature_branch',
    },
    {
      desc: 'valid tag with dash in middle',
      tag: 'test-tag',
    },
    {
      desc: 'valid tag with mixed case',
      tag: 'TestTag123',
    },
  ])('successfully parses $desc', async ({tag}) => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, undefined)

    const {error} = await testCommand(DeploySchemaCommand, ['--tag', tag])

    expect(error).toBeUndefined()
  })

  test('throw an error if some schemas fail to deploy', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(404, undefined)

    const {error, stdout} = await testCommand(DeploySchemaCommand)

    expect(error?.message).toContain(
      'Failed to deploy 1/2 schemas. Successfully deployed 1/2 schemas.',
    )
    expect(stdout).toContain('↳ List deployed schemas with: sanity schema list')
  })

  test('throws an error if workspace is not found', async () => {
    const {error} = await testCommand(DeploySchemaCommand, ['--workspace', 'test'])

    expect(error?.message).toContain('Found no workspaces named "test"')
  })

  test('throws an error if schema request fails', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(400, {
      error: 'Bad request',
    })
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(400, {
      error: 'Bad request',
    })

    const {error} = await testCommand(DeploySchemaCommand)

    expect(error?.message).toContain('↳ Error when storing schemas')
  })

  test('throws an error if schema request fails due to permissions', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(401)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, undefined)

    const {stderr} = await testCommand(DeploySchemaCommand)

    expect(stderr).toContain('↳ No permissions to write schema for workspace "default"')
  })

  test('skips manifest extraction with no-extract-manifest flag', async () => {
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/schemas',
    }).reply(200, undefined)
    mockApi({
      apiVersion: SCHEMA_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/staging/schemas',
    }).reply(200, undefined)

    await testCommand(DeploySchemaCommand, ['--no-extract-manifest'])

    expect(mockExtractManifestSafe).not.toHaveBeenCalled()
  })
})
