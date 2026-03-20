import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {addRegistry} from '../../../actions/registry/addRegistry.js'
import {AddRegistryCommand} from '../add.js'

vi.mock('../../../actions/registry/addRegistry.js', () => ({
  addRegistry: vi.fn(),
}))

const mockedAddRegistry = vi.mocked(addRegistry)

const defaultMocks = {
  cliConfig: {api: {projectId: 'test-project'}},
  isInteractive: true,
  projectRoot: {
    directory: '/test/studio',
    path: '/test/studio/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#registry:add', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('runs addRegistry and prints results', async () => {
    mockedAddRegistry.mockResolvedValueOnce({
      addedFiles: ['schemaTypes/author.ts'],
      dryRun: false,
      manifest: {
        files: [],
        name: 'sanity-core',
        version: '1.0.0',
      },
      manualSteps: [],
      projectRoot: '/test/studio',
      skippedFiles: [],
      updatedFiles: ['sanity.config.ts'],
    })

    const {error, stdout} = await testCommand(
      AddRegistryCommand,
      ['https://github.com/acme/registry.git', '--path', 'registry/studio'],
      {mocks: defaultMocks},
    )

    if (error) throw error

    expect(mockedAddRegistry).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
        local: false,
        overwrite: false,
        projectRoot: '/test/studio',
        source: 'https://github.com/acme/registry.git',
        subdir: 'registry/studio',
      }),
    )
    expect(stdout).toContain('Registry install completed')
    expect(stdout).toContain('Added files (1)')
    expect(stdout).toContain('Updated files (1)')
  })

  test('passes dry-run and overwrite flags', async () => {
    mockedAddRegistry.mockResolvedValueOnce({
      addedFiles: ['schemaTypes/product.ts'],
      dryRun: true,
      manifest: {
        files: [],
        name: 'commerce-kit',
        version: '1.2.0',
      },
      manualSteps: ['Update schema export manually'],
      projectRoot: '/test/studio',
      skippedFiles: [{file: 'schemaTypes/index.ts', reason: 'already exists'}],
      updatedFiles: [],
    })

    const {error, stdout} = await testCommand(
      AddRegistryCommand,
      ['https://github.com/acme/registry.git', '--dry-run', '--overwrite'],
      {mocks: defaultMocks},
    )

    if (error) throw error

    expect(mockedAddRegistry).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        local: false,
        overwrite: true,
      }),
    )
    expect(stdout).toContain('Dry run completed')
    expect(stdout).toContain('Manual follow-up required')
    expect(stdout).toContain('Skipped files (1)')
  })

  test('passes local flag for local registry sources', async () => {
    mockedAddRegistry.mockResolvedValueOnce({
      addedFiles: [],
      dryRun: true,
      manifest: {
        files: [],
        name: 'local-registry',
        version: '1.0.0',
      },
      manualSteps: [],
      projectRoot: '/test/studio',
      skippedFiles: [],
      updatedFiles: [],
    })

    const {error} = await testCommand(
      AddRegistryCommand,
      ['./examples/registry-demo', '--local', '--dry-run'],
      {mocks: defaultMocks},
    )

    if (error) throw error

    expect(mockedAddRegistry).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        local: true,
        source: './examples/registry-demo',
      }),
    )
  })
})
