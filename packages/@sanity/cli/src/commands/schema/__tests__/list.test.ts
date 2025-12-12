import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {listSchemas} from '../../../actions/schema/listSchemas.js'
import {ListSchemaCommand} from '../list.js'

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', async () => ({
  findProjectRoot: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      dataset: 'production',
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../actions/schema/listSchemas.js', () => ({
  listSchemas: vi.fn(),
}))

const mockListSchemas = vi.mocked(listSchemas)

describe('#schema:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should show --help text', async () => {
    const {stdout} = await runCommand('schema list --help')

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

  test('should list schemas successfully', async () => {
    mockListSchemas.mockResolvedValue('success')

    await testCommand(ListSchemaCommand)

    expect(mockListSchemas).toHaveBeenCalled()
  })

  test('should list a specific schema with --id flag', async () => {
    mockListSchemas.mockResolvedValue('success')

    await testCommand(ListSchemaCommand, ['--id', '_.schemas.default'])

    expect(mockListSchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '_.schemas.default',
      }),
      expect.any(Object),
    )
  })

  test('should list schemas as json with --json flag', async () => {
    mockListSchemas.mockResolvedValue('success')

    await testCommand(ListSchemaCommand, ['--json'])

    expect(mockListSchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        json: true,
      }),
      expect.any(Object),
    )
  })

  test('should skip manifest extraction with --no-extract-manifest flag', async () => {
    mockListSchemas.mockResolvedValue('success')

    await testCommand(ListSchemaCommand, ['--no-extract-manifest'])

    expect(mockListSchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        'extract-manifest': false,
      }),
      expect.any(Object),
    )
  })

  test('should use manifest directory with --manifest-dir flag', async () => {
    mockListSchemas.mockResolvedValue('success')

    await testCommand(ListSchemaCommand, ['--manifest-dir', './test'])

    expect(mockListSchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        'manifest-dir': './test',
      }),
      expect.any(Object),
    )
  })

  test('handles action failure', async () => {
    mockListSchemas.mockResolvedValue('failure')

    const {error} = await testCommand(ListSchemaCommand)

    expect(mockListSchemas).toHaveBeenCalled()

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list schemas')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles action errors gracefully', async () => {
    mockListSchemas.mockRejectedValue(new Error('Manifest does not exist'))

    const {error} = await testCommand(ListSchemaCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list schemas:\nError: Manifest does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })
})
