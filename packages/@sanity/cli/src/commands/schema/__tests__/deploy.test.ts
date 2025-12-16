import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {deploySchemas} from '../../../actions/schema/deploySchemas.js'
import {DeploySchemaCommand} from '../deploy.js'

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

vi.mock('../../../actions/schema/deploySchemas.js', () => ({
  deploySchemas: vi.fn(),
}))

const mockDeploySchemas = vi.mocked(deploySchemas)

describe('#schema:deploy', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should show --help text', async () => {
    const {stdout} = await runCommand('schema deploy --help')

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

  test('should deploy schemas successfully', async () => {
    mockDeploySchemas.mockResolvedValue('success')

    await testCommand(DeploySchemaCommand)

    expect(mockDeploySchemas).toHaveBeenCalled()
  })

  test('should deploy schema by workspace with --workspace flag', async () => {
    mockDeploySchemas.mockResolvedValue('success')

    await testCommand(DeploySchemaCommand, ['--workspace', 'default'])

    expect(mockDeploySchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: 'default',
      }),
      expect.any(Object),
    )
  })

  test('should deploy schemas with ID suffix with --tag flag', async () => {
    mockDeploySchemas.mockResolvedValue('success')

    await testCommand(DeploySchemaCommand, ['--tag', 'test'])

    expect(mockDeploySchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: 'test',
      }),
      expect.any(Object),
    )
  })

  test('should enable verbose logging with --verbose flag', async () => {
    mockDeploySchemas.mockResolvedValue('success')

    await testCommand(DeploySchemaCommand, ['--verbose'])

    expect(mockDeploySchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        verbose: true,
      }),
      expect.any(Object),
    )
  })

  test('should skip manifest extraction with --no-extract-manifest flag', async () => {
    mockDeploySchemas.mockResolvedValue('success')

    await testCommand(DeploySchemaCommand, ['--no-extract-manifest'])

    expect(mockDeploySchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        'extract-manifest': false,
      }),
      expect.any(Object),
    )
  })

  test('should use manifest directory with --manifest-dir flag', async () => {
    mockDeploySchemas.mockResolvedValue('success')

    await testCommand(DeploySchemaCommand, ['--manifest-dir', './test'])

    expect(mockDeploySchemas).toHaveBeenCalledWith(
      expect.objectContaining({
        'manifest-dir': './test',
      }),
      expect.any(Object),
    )
  })

  test('handles action failure', async () => {
    mockDeploySchemas.mockResolvedValue('failure')

    const {error} = await testCommand(DeploySchemaCommand)

    expect(mockDeploySchemas).toHaveBeenCalled()

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to deploy schemas')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles action errors gracefully', async () => {
    mockDeploySchemas.mockRejectedValue(new Error('Manifest does not exist'))

    const {error} = await testCommand(DeploySchemaCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to deploy schemas:\nError: Manifest does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })
})
