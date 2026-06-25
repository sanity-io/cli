import {Readable} from 'node:stream'

import {getProjectCliClient, ProjectRootNotFoundError} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {sanityImport} from '@sanity/import'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ImportDatasetCommand} from '../../../../src/commands/datasets/import.js'

const mockPromptForDataset = vi.hoisted(() => vi.fn())
const mockPromptForDatasetName = vi.hoisted(() => vi.fn())
const mockListDatasets = vi.hoisted(() => vi.fn())
const mockCreateDataset = vi.hoisted(() => vi.fn())

vi.mock('../../../../src/prompts/promptForDataset.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/prompts/promptForDataset.js')>()
  return {
    ...actual,
    promptForDataset: mockPromptForDataset,
  }
})

vi.mock('../../../src/prompts/promptForDatasetName.js', () => ({
  promptForDatasetName: mockPromptForDatasetName,
}))

vi.mock('../../../src/services/datasets.js', () => ({
  createDataset: mockCreateDataset,
  listDatasets: mockListDatasets,
}))

vi.mock('@sanity/import', () => ({
  sanityImport: vi.fn().mockResolvedValue({numDocs: 0, warnings: []}),
}))

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      config: vi.fn().mockReturnValue({dataset: 'test-dataset', projectId: 'test-project'}),
    }),
  }
})

vi.mock('@sanity/cli-core/request', () => ({
  createRequester: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({body: Readable.from([])})),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    default: {
      ...actual,
      createReadStream: vi.fn().mockReturnValue(Readable.from([])),
      statSync: vi.fn().mockReturnValue({isDirectory: () => false}),
    },
  }
})

const mockSanityImport = vi.mocked(sanityImport)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

const defaultMocks = {
  cliConfig: {api: {dataset: 'test-dataset', projectId: 'test-project'}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const BASE_FLAGS = ['test-source.ndjson', '--dataset', 'test-dataset', '--token', 'test-token']

describe('#dataset:import', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('these should be SanityCommand getProjectId unit tests', () => {
    test('falls back to CLI config project ID', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'test-project'}),
      )
    })

    test('--project-id flag overrides CLI config', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error} = await testCommand(
        ImportDatasetCommand,
        [...BASE_FLAGS, '--project-id', 'flag-project'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'flag-project'}),
      )
    })

    test('supports deprecated --project flag', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 1, warnings: []})

      const {error, stderr} = await testCommand(
        ImportDatasetCommand,
        [...BASE_FLAGS, '--project', 'deprecated-project'],
        {
          mocks: {
            ...defaultMocks,
            cliConfig: {api: {dataset: 'test-dataset'}},
          },
        },
      )

      if (error) throw error
      expect(stderr).toContain('"project" flag has been deprecated')
      expect(mockGetProjectCliClient).toHaveBeenCalledWith(
        expect.objectContaining({projectId: 'deprecated-project'}),
      )
    })

    test('errors when no project root and no --project-id', async () => {
      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: {
          cliConfigError: new ProjectRootNotFoundError('No project root found'),
          token: 'test-token',
        },
      })

      expect(error).toBeInstanceOf(Error)
      expect(error?.message).toContain('Unable to determine project ID')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('client configuration', () => {
    test('creates client with correct options when --token is provided', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 0, warnings: []})

      const {error} = await testCommand(ImportDatasetCommand, BASE_FLAGS, {
        mocks: defaultMocks,
      })

      if (error) throw error
      expect(mockGetProjectCliClient).toHaveBeenCalledWith({
        apiVersion: 'v2025-02-19',
        dataset: 'test-dataset',
        projectId: 'test-project',
        requireUser: true,
        token: 'test-token',
      })
    })

    test('uses stored CLI token when --token is not provided', async () => {
      mockSanityImport.mockResolvedValueOnce({numDocs: 5, warnings: []})

      const {error, stdout} = await testCommand(
        ImportDatasetCommand,
        ['test-source.ndjson', '--dataset', 'test-dataset'],
        {mocks: defaultMocks},
      )

      if (error) throw error
      expect(stdout).toContain('Done! Imported 5 documents')
      expect(mockGetProjectCliClient).toHaveBeenCalledWith({
        apiVersion: 'v2025-02-19',
        dataset: 'test-dataset',
        projectId: 'test-project',
        requireUser: true,
      })
    })
  })
})
