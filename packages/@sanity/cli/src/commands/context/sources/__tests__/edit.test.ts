import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {datasetSource, webSource} from '../../__tests__/fixtures.js'
import {EditSourceCommand} from '../edit.js'

const mockSourcesEdit = vi.hoisted(() => vi.fn())
const mockSourcesGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    spinner: vi.fn().mockReturnValue({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    }),
  }
})

describe('context sources edit', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {sources: {edit: mockSourcesEdit, get: mockSourcesGet}},
    })
    mockSourcesEdit.mockResolvedValue(webSource)
    mockSourcesGet.mockResolvedValue(webSource)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('renames a source and sets its sync frequency', async () => {
    const {error} = await testCommand(EditSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--title',
      '  Product docs  ',
      '--sync-frequency',
      'monthly',
    ])

    if (error) throw error
    expect(mockSourcesEdit).toHaveBeenCalledWith({
      sourceId: 'source-def456',
      syncFrequency: 'monthly',
      title: 'Product docs',
    })
    expect(mockSourcesGet).not.toHaveBeenCalled()
  })

  test('turns scheduled syncs off with --sync-frequency off', async () => {
    const {error} = await testCommand(EditSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--sync-frequency',
      'off',
    ])

    if (error) throw error
    expect(mockSourcesEdit).toHaveBeenCalledWith({sourceId: 'source-def456', syncFrequency: null})
  })

  test('merges crawl flags onto the stored crawl options', async () => {
    const {error} = await testCommand(EditSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--exclude-path',
      '^/blog/',
      '--page-limit',
      '200',
      '--confirm-deletions',
    ])

    if (error) throw error
    expect(mockSourcesEdit).toHaveBeenCalledWith({
      confirmDeletions: true,
      crawlOptions: {excludePaths: ['^/blog/'], includePaths: ['^/docs/'], pageLimit: 200},
      sourceId: 'source-def456',
    })
  })

  test('sends only the crawl flags for a source that is not a website', async () => {
    mockSourcesGet.mockResolvedValue(datasetSource)

    const {error} = await testCommand(EditSourceCommand, [
      'kb-abc123',
      'source-dataset',
      '--max-depth',
      '2',
    ])

    if (error) throw error
    expect(mockSourcesEdit).toHaveBeenCalledWith({
      crawlOptions: {maxDepth: 2},
      sourceId: 'source-dataset',
    })
  })

  test("changes a dataset source's query", async () => {
    const {error} = await testCommand(EditSourceCommand, [
      'kb-abc123',
      'source-dataset',
      '--query',
      '*[_type == "post"]',
    ])

    if (error) throw error
    expect(mockSourcesEdit).toHaveBeenCalledWith({
      query: '*[_type == "post"]',
      sourceId: 'source-dataset',
    })
  })

  test('errors when no change is given', async () => {
    const {error} = await testCommand(EditSourceCommand, ['kb-abc123', 'source-def456'])

    expect(error).toBeInstanceOf(Error)
    expect(mockSourcesEdit).not.toHaveBeenCalled()
  })

  test.each([
    ['--title', 'Title cannot be empty'],
    ['--query', 'Query cannot be empty'],
  ])('errors when %s is empty', async (flag, message) => {
    const {error} = await testCommand(EditSourceCommand, ['kb-abc123', 'source-def456', flag, ' '])

    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(2)
    expect(mockSourcesEdit).not.toHaveBeenCalled()
  })

  test('tells how to apply crawl options that would delete many documents', async () => {
    const conflict = httpError(409, 'The new crawl options would delete 40 of 50 documents')
    Object.assign(conflict, {
      response: {
        ...(conflict as unknown as {response: object}).response,
        body: {code: 'sourceDeletionsUnconfirmed'},
      },
    })
    mockSourcesEdit.mockRejectedValue(conflict)

    const {error} = await testCommand(EditSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--include-path',
      '^/docs/v2/',
    ])

    expect(error?.message).toContain('would delete 40 of 50 documents')
    expect(error?.message).toContain('Run again with --confirm-deletions')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with a friendly message on 404', async () => {
    mockSourcesEdit.mockRejectedValue(httpError(404))

    const {error} = await testCommand(EditSourceCommand, [
      'kb-abc123',
      'source-missing',
      '--title',
      'Docs',
    ])

    expect(error?.message).toContain(
      'Source "source-missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockSourcesEdit.mockRejectedValue(httpError(403, 'Scheduled syncs are not in your plan'))

    const {error} = await testCommand(EditSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--sync-frequency',
      'weekly',
    ])

    expect(error?.message).toContain(
      'Failed to update source: Scheduled syncs are not in your plan',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts content-bearing flags from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'sources',
        'edit',
        'kb-abc123',
        'source-def456',
        '--title=Internal',
        '--query=*[_type == "secret"]',
        '--include-path=^/secret/',
        '--sync-frequency=weekly',
      ],
      EditSourceCommand.telemetry,
    )

    expect(result.extraArguments).toEqual([
      '--title',
      '--query',
      '--include-path',
      '--sync-frequency=weekly',
    ])
  })
})
