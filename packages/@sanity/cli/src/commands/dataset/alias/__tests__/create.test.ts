import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {CreateAliasCommand} from '../create.js'

vi.mock('../../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock(import('../../../../../../cli-core/src/services/apiClient.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)
const mockGetCliConfig = vi.mocked(getCliConfig)

const setupMockClient = ({
  aliases = [],
  createAliasResponse = {aliasName: 'test-alias', datasetName: 'production'},
  datasets = [{name: 'production'}],
  features = ['advancedDatasetManagement'],
}: {
  aliases?: Array<{datasetName: string | null; name: string}>
  createAliasResponse?: {aliasName: string; datasetName: string | null}
  datasets?: Array<{name: string}>
  features?: string[]
} = {}) => {
  const mockClient = {
    datasets: {
      list: vi.fn().mockResolvedValue(datasets),
    },
    request: vi.fn(),
  }

  mockClient.request.mockImplementation((config) => {
    if (config.uri === '/features') {
      return Promise.resolve(features)
    }
    if (config.uri === '/aliases') {
      return Promise.resolve(aliases)
    }
    if (config.uri?.startsWith('/aliases/') && config.method === 'PUT') {
      return Promise.resolve(createAliasResponse)
    }
    return Promise.resolve({})
  })

  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
}

describe('dataset:alias:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates alias with valid arguments', async () => {
    setupMockClient()

    const {stdout} = await testCommand(CreateAliasCommand, ['test-alias', 'production'])

    expect(stdout).toContain(
      'Dataset alias ~test-alias created and linked to production successfully',
    )
  })

  test('creates alias with ~ prefix', async () => {
    setupMockClient()

    const {stdout} = await testCommand(CreateAliasCommand, ['~test-alias', 'production'])

    expect(stdout).toContain(
      'Dataset alias ~test-alias created and linked to production successfully',
    )
  })

  test('fails when alias already exists', async () => {
    setupMockClient({
      aliases: [{datasetName: 'production', name: 'existing-alias'}],
    })

    const {error} = await testCommand(CreateAliasCommand, ['existing-alias', 'production'])

    expect(error?.message).toContain('Dataset alias "~existing-alias" already exists')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when project lacks advanced dataset management feature', async () => {
    setupMockClient({
      features: [],
    })

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'])

    expect(error?.message).toContain('This project cannot create a dataset alias')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when target dataset does not exist', async () => {
    setupMockClient({
      datasets: [{name: 'production'}],
    })

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'nonexistent'])

    expect(error?.message).toContain('Dataset "nonexistent" does not exist')
    expect(error?.message).toContain('Available datasets: production')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails with invalid alias name', async () => {
    setupMockClient()

    const {error} = await testCommand(CreateAliasCommand, ['a', 'production'])

    expect(error?.message).toContain('Alias name must be at least two characters long')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails with invalid target dataset name', async () => {
    setupMockClient()

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'Invalid Dataset'])

    expect(error?.message).toContain('Dataset name must be all lowercase characters')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no project ID available', async () => {
    mockGetCliConfig.mockResolvedValueOnce({
      api: {},
    })

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors gracefully', async () => {
    const mockClient = {
      datasets: {
        list: vi.fn().mockResolvedValue([{name: 'production'}]),
      },
      request: vi.fn(),
    }

    mockClient.request.mockImplementation((config) => {
      if (config.uri === '/features') {
        return Promise.resolve(['advancedDatasetManagement'])
      }
      if (config.uri === '/aliases') {
        return Promise.resolve([])
      }
      if (config.uri?.startsWith('/aliases/') && config.method === 'PUT') {
        return Promise.reject(new Error('API Error: Network timeout'))
      }
      return Promise.resolve({})
    })

    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    const {error} = await testCommand(CreateAliasCommand, ['test-alias', 'production'])

    expect(error?.message).toContain('Dataset alias creation failed: API Error: Network timeout')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('creates alias without target dataset', async () => {
    setupMockClient({
      createAliasResponse: {aliasName: 'test-alias', datasetName: null},
      datasets: [],
    })

    const {stdout} = await testCommand(CreateAliasCommand, ['test-alias'])

    expect(stdout).toContain('Dataset alias ~test-alias created successfully')
  })
})
