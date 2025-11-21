import {runCommand} from '@oclif/test'
import {getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import * as deleteSchemaAction from '../../../actions/schema/deleteSchemaAction.js'
import {DeleteSchemaCommand} from '../delete.js'

// Mock the config functions
vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      dataset: 'production',
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

// Mock the delete schema action
vi.mock('../../../actions/schema/deleteSchemaAction.js', () => ({
  deleteSchemaAction: vi.fn(),
}))

// Get the mocked functions
const mockedGetProjectCliClient = vi.mocked(getProjectCliClient)
const mockedDeleteSchemaAction = vi.mocked(deleteSchemaAction.deleteSchemaAction)

describe('schema delete', () => {
  beforeEach(() => {
    // Setup a basic mock client
    mockedGetProjectCliClient.mockResolvedValue({
      config: () => ({
        dataset: 'production',
        projectId: 'test-project',
      }),
      withConfig: vi.fn().mockReturnThis(),
    } as never)

    // Default to successful deletion
    mockedDeleteSchemaAction.mockResolvedValue('success')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['schema delete', '--help'])

    expect(stdout).toContain('Delete schema documents by id')
    expect(stdout).toContain('--ids')
    expect(stdout).toContain('--dataset')
    expect(stdout).toContain('--manifest-dir')
    expect(stdout).toContain('--extract-manifest')
    expect(stdout).toContain('--verbose')
  })

  test('deletes a single schema successfully', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, ['--ids', 'sanity.workspace.schema.default'])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: 'sanity.workspace.schema.default',
      }),
      expect.objectContaining({
        apiClient: expect.any(Function),
        output: expect.objectContaining({
          error: expect.any(Function),
          print: expect.any(Function),
        }),
        workDir: '/test/path',
      }),
    )
  })

  test('deletes multiple schemas successfully', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.default,sanity.workspace.schema.staging',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: 'sanity.workspace.schema.default,sanity.workspace.schema.staging',
      }),
      expect.any(Object),
    )
  })

  test('uses custom dataset when --dataset flag is provided', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.default',
      '--dataset',
      'staging',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'staging',
        ids: 'sanity.workspace.schema.default',
      }),
      expect.any(Object),
    )
  })

  test('uses custom manifest directory when --manifest-dir flag is provided', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.default',
      '--manifest-dir',
      './custom/path',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        'manifest-dir': './custom/path',
      }),
      expect.any(Object),
    )
  })

  test('supports --no-extract-manifest flag', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.default',
      '--no-extract-manifest',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        'extract-manifest': false,
      }),
      expect.any(Object),
    )
  })

  test('supports --verbose flag', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.default',
      '--verbose',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        verbose: true,
      }),
      expect.any(Object),
    )
  })

  test('handles action failure', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('failure')

    const {error} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.default',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Schema delete failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles action errors gracefully', async () => {
    mockedDeleteSchemaAction.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.default',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Schema delete failed: Network error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('requires --ids flag', async () => {
    const {error} = await testCommand(DeleteSchemaCommand, [])

    expect(error).toBeInstanceOf(Error)
    // oclif will error about missing required flag
    expect(error?.message).toContain('--ids')
  })

  test('default extract-manifest is true', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, ['--ids', 'sanity.workspace.schema.default'])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        'extract-manifest': true,
      }),
      expect.any(Object),
    )
  })

  test('default verbose is false', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, ['--ids', 'sanity.workspace.schema.default'])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        verbose: false,
      }),
      expect.any(Object),
    )
  })
})
