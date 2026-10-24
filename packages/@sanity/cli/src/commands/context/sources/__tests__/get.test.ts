import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {datasetSource, filesSource, webSource} from '../../__tests__/fixtures.js'
import {GetSourceCommand} from '../get.js'

const mockSourcesGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context sources get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {sources: {get: mockSourcesGet}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints a website source with its crawl options and latest sync', async () => {
    mockSourcesGet.mockResolvedValue(webSource)

    const {error, stdout} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-def456'])

    if (error) throw error
    expect(mockSourcesGet).toHaveBeenCalledWith({sourceId: 'source-def456'})
    expect(stdout).toContain('Type:           web')
    expect(stdout).toContain('URL:            https://example.com/docs')
    expect(stdout).toContain('Crawl options:')
    expect(stdout).toContain('Sync frequency: weekly')
    expect(stdout).toContain('Documents:      5 (4 converted, 1 skipped, 0 failed)')
    expect(stdout).toContain('Latest sync:    sync-ghi789 (completed)')
  })

  test('prints a website source without scheduled syncs', async () => {
    mockSourcesGet.mockResolvedValue({...webSource, syncFrequency: null})

    const {error, stdout} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-def456'])

    if (error) throw error
    expect(stdout).toContain('Sync frequency: off')
  })

  test('prints a dataset source', async () => {
    mockSourcesGet.mockResolvedValue(datasetSource)

    const {error, stdout} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-dataset'])

    if (error) throw error
    expect(stdout).toContain('Project:        proj123')
    expect(stdout).toContain('Dataset:        production')
    expect(stdout).toContain('Query:          *[_type == "article"]')
    expect(stdout).toContain('Sync frequency: off')
  })

  test('prints a files source before its first sync', async () => {
    mockSourcesGet.mockResolvedValue({
      ...filesSource,
      filename: null,
      lastSyncedAt: null,
      latestSync: null,
      sizeBytes: null,
    })

    const {error, stdout} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-files'])

    if (error) throw error
    expect(stdout).toContain('File:           -')
    expect(stdout).toContain('Latest sync:    -')
    expect(stdout).toContain('Last synced:    -')
  })

  test('outputs JSON with --json', async () => {
    mockSourcesGet.mockResolvedValue(filesSource)

    const {error, stdout} = await testCommand(GetSourceCommand, [
      'kb-abc123',
      'source-files',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(filesSource)
  })

  test('errors with a friendly message on 404', async () => {
    mockSourcesGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-missing'])

    expect(error?.message).toContain(
      'Source "source-missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockSourcesGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-def456'])

    expect(error?.message).toContain('Failed to get source: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })
})
