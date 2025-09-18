import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {LinkAliasCommand} from '../link.js'

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
  aliases = [{datasetName: null, name: 'staging'}],
  datasets = [{name: 'production'}, {name: 'development'}],
  updateAliasResponse = {aliasName: 'staging', datasetName: 'production'},
}: {
  aliases?: Array<{datasetName: string | null; name: string}>
  datasets?: Array<{name: string}>
  updateAliasResponse?: {aliasName: string; datasetName: string | null}
} = {}) => {
  const mockClient = {
    datasets: {
      list: vi.fn().mockResolvedValue(datasets),
    },
    request: vi.fn(),
  }

  mockClient.request.mockImplementation((config) => {
    if (config.uri === '/aliases') {
      return Promise.resolve(aliases)
    }
    if (config.uri?.startsWith('/aliases/') && config.method === 'PATCH') {
      return Promise.resolve(updateAliasResponse)
    }
    return Promise.resolve({})
  })

  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
}

describe('dataset:alias:link', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('links alias with valid arguments', async () => {
    setupMockClient()

    const {stdout} = await testCommand(LinkAliasCommand, ['staging', 'production'])

    expect(stdout).toContain('Dataset alias ~staging linked to production successfully')
  })

  test('fails when no project ID', async () => {
    mockGetCliConfig.mockResolvedValueOnce({})

    const {error} = await testCommand(LinkAliasCommand, ['staging', 'production'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails with invalid alias name', async () => {
    setupMockClient()

    const {error} = await testCommand(LinkAliasCommand, [
      'invalid-alias-name-that-is-way-too-long-and-exceeds-the-maximum-allowed-length',
      'production',
    ])

    expect(error?.message).toContain('Alias name must be at most 64 characters')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails with invalid dataset name', async () => {
    setupMockClient()

    const {error} = await testCommand(LinkAliasCommand, ['staging', 'Invalid-Dataset'])

    expect(error?.message).toContain('Dataset name must be all lowercase characters')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when alias does not exist', async () => {
    setupMockClient({aliases: [{datasetName: null, name: 'staging'}]})

    const {error} = await testCommand(LinkAliasCommand, ['nonexistent', 'production'])

    expect(error?.message).toContain('Dataset alias "~nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when dataset does not exist', async () => {
    setupMockClient({datasets: [{name: 'production'}]})

    const {error} = await testCommand(LinkAliasCommand, ['staging', 'nonexistent'])

    expect(error?.message).toContain('Dataset "nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when alias already linked to same dataset', async () => {
    setupMockClient({aliases: [{datasetName: 'production', name: 'staging'}]})

    const {error} = await testCommand(LinkAliasCommand, ['staging', 'production'])

    expect(error?.message).toContain('Dataset alias ~staging already linked to production')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no datasets available', async () => {
    setupMockClient({datasets: []})

    const {error} = await testCommand(LinkAliasCommand, ['staging'])

    expect(error?.message).toContain('No datasets available to link to')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('re-links already-linked alias when using force flag', async () => {
    setupMockClient({
      aliases: [{datasetName: 'development', name: 'staging'}],
      updateAliasResponse: {aliasName: 'staging', datasetName: 'production'},
    })

    const {stderr, stdout} = await testCommand(LinkAliasCommand, [
      'staging',
      'production',
      '--force',
    ])

    expect(stderr).toContain("'--force' used: skipping confirmation, linking alias to")
    expect(stdout).toContain('Dataset alias ~staging linked to production successfully')
  })

  test('links unlinked alias without requiring confirmation', async () => {
    setupMockClient({aliases: [{datasetName: null, name: 'staging'}]})

    const {stdout} = await testCommand(LinkAliasCommand, ['staging', 'production'])

    expect(stdout).toContain('Dataset alias ~staging linked to production successfully')
    expect(stdout).not.toContain('confirmation')
  })

  test('handles API error gracefully', async () => {
    setupMockClient()

    const mockClient = {
      datasets: {list: vi.fn().mockResolvedValue([{name: 'production'}])},
      request: vi.fn().mockImplementation((config) => {
        if (config.uri === '/aliases')
          return Promise.resolve([{datasetName: null, name: 'staging'}])
        if (config.method === 'PATCH') throw new Error('API Error')
        return Promise.resolve({})
      }),
    }
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    const {error} = await testCommand(LinkAliasCommand, ['staging', 'production'])

    expect(error?.message).toContain('Dataset alias linking failed: API Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})
