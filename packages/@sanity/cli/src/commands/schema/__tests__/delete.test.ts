import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {deleteSchemaAction} from '../../../actions/schema/deleteSchemaAction.js'
import {DeleteSchemaCommand} from '../delete.js'

// Mock the delete schema action
vi.mock('../../../actions/schema/deleteSchemaAction.js', () => ({
  deleteSchemaAction: vi.fn(),
}))

// Mock the manifest extractor
vi.mock('../../../actions/schema/utils/manifestExtractor.js', () => ({
  createManifestExtractor: vi.fn(() => vi.fn()),
}))

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

const mockedDeleteSchemaAction = vi.mocked(deleteSchemaAction)

describe('schema delete', () => {
  beforeEach(() => {
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
    expect(stdout).toContain('--extract-manifest')
    expect(stdout).toContain('--manifest-dir')
    expect(stdout).toContain('--verbose')
  })

  test('deletes a single schema successfully', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, ['--ids', 'sanity.workspace.schema.workspaceName'])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: 'sanity.workspace.schema.workspaceName',
      }),
      expect.any(Object),
    )
  })

  test('deletes multiple schemas successfully', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.workspace1,sanity.workspace.schema.workspace2',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: 'sanity.workspace.schema.workspace1,sanity.workspace.schema.workspace2',
      }),
      expect.any(Object),
    )
  })

  test('uses custom dataset when --dataset flag is provided', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.workspaceName',
      '--dataset',
      'staging',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'staging',
        ids: 'sanity.workspace.schema.workspaceName',
      }),
      expect.any(Object),
    )
  })

  test('disables manifest extraction with --no-extract-manifest', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.workspaceName',
      '--no-extract-manifest',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        'extract-manifest': false,
        ids: 'sanity.workspace.schema.workspaceName',
      }),
      expect.any(Object),
    )
  })

  test('uses custom manifest directory when --manifest-dir is provided', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.workspaceName',
      '--manifest-dir',
      './custom/path',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: 'sanity.workspace.schema.workspaceName',
        'manifest-dir': './custom/path',
      }),
      expect.any(Object),
    )
  })

  test('enables verbose logging when --verbose is provided', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('success')

    await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.workspaceName',
      '--verbose',
    ])

    expect(mockedDeleteSchemaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: 'sanity.workspace.schema.workspaceName',
        verbose: true,
      }),
      expect.any(Object),
    )
  })

  test('handles action failure', async () => {
    mockedDeleteSchemaAction.mockResolvedValue('failure')

    const {error} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.workspaceName',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete schemas')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles action errors gracefully', async () => {
    mockedDeleteSchemaAction.mockRejectedValue(new Error('Schema delete failed'))

    const {error} = await testCommand(DeleteSchemaCommand, [
      '--ids',
      'sanity.workspace.schema.workspaceName',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete schemas: Schema delete failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('requires --ids flag', async () => {
    const {error} = await testCommand(DeleteSchemaCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing required flag ids')
  })
})
