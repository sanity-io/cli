import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import chalk from 'chalk'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DOCUMENTS_API_VERSION} from '../../../actions/documents/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {GetDocumentCommand} from '../get.js'

// Mock the config functions
vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

const mockGetCliConfig = vi.mocked(getCliConfig)
const testProjectId = 'test-project'
const testDataset = 'production'

// Chalk spies for colorization testing
vi.mock('chalk', async (importOriginal) => {
  const chalk = await importOriginal<typeof import('chalk')>()

  return {
    default: {
      ...chalk.default,
      green: vi.fn().mockImplementation((a: string) => a),
      white: vi.fn().mockImplementation((a: string) => a),
    },
  }
})

describe('#documents:get', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pendingMocks = nock.pendingMocks()
    nock.cleanAll()
    expect(pendingMocks).toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['documents get', '--help'])

    expect(stdout).toContain('Get and print a document by ID')
    expect(stdout).toContain('ARGUMENTS')
    expect(stdout).toContain('DOCUMENTID')
  })

  test('retrieves and displays a document successfully', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      content: 'This is a test post',
      title: 'Test Post',
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DOCUMENTS_API_VERSION,
      uri: `/data/doc/${testDataset}/test-doc`,
    }).reply(200, {
      documents: [mockDoc],
    })

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(stdout).toContain('"_id": "test-doc"')
    expect(stdout).toContain('"title": "Test Post"')
  })

  test('displays colorized output when --pretty flag is used', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DOCUMENTS_API_VERSION,
      uri: `/data/doc/${testDataset}/test-doc`,
    }).reply(200, {
      documents: [mockDoc],
    })

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc', '--pretty'])

    // Check that the output contains the document data
    expect(stdout).toContain('test-doc')
    expect(stdout).toContain('Test Post')
    expect(stdout).toContain('_id')
    expect(stdout).toContain('_type')
    expect(stdout).toContain('title')

    // Check that chalk colorization methods were called
    expect(chalk.white).toHaveBeenCalled() // For keys and punctuators
    expect(chalk.green).toHaveBeenCalled() // For strings
  })

  test('uses custom dataset when --dataset flag is provided', async () => {
    const mockDoc = {
      _id: 'test-doc',
      _type: 'post',
      title: 'Test Post',
    }

    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DOCUMENTS_API_VERSION,
      uri: `/data/doc/staging/test-doc`,
    }).reply(200, {
      documents: [mockDoc],
    })

    const {stdout} = await testCommand(GetDocumentCommand, ['test-doc', '--dataset', 'staging'])

    expect(stdout).toContain('"_id": "test-doc"')
    expect(stdout).toContain('"title": "Test Post"')
  })

  test('throws error when document is not found', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DOCUMENTS_API_VERSION,
      uri: `/data/doc/${testDataset}/nonexistent-doc`,
    }).reply(200, {
      documents: [],
      omitted: [
        {
          id: 'nonexistent-doc',
          reason: 'existence',
        },
      ],
    })

    const {error} = await testCommand(GetDocumentCommand, ['nonexistent-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Document "nonexistent-doc" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no project ID is configured', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: undefined,
      },
    })

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no dataset is configured and none provided', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: undefined,
        projectId: testProjectId,
      },
    })

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles client errors gracefully', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: testDataset,
        projectId: testProjectId,
      },
    })

    mockApi({
      apiHost: `https://${testProjectId}.api.sanity.io`,
      apiVersion: DOCUMENTS_API_VERSION,
      uri: `/data/doc/${testDataset}/test-doc`,
    }).reply(500, {
      error: {
        description: 'Network error',
        type: 'serverError',
      },
    })

    const {error} = await testCommand(GetDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch document')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('requires document ID argument', async () => {
    const {error} = await testCommand(GetDocumentCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
    expect(error?.oclif?.exit).toBe(2)
  })
})
