import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {source} from '../../__tests__/fixtures.js'
import {GetSourceCommand} from '../get.js'

const mockSourcesGet = vi.hoisted(() => vi.fn())
const mockSourcesContent = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

const sourceContent = {
  content: '# Refunds\nRefunds are processed within 5 days.',
  slice: {end: 2, start: 1},
  sourceId: 'source-def456',
  totalLines: 2,
}

describe('context sources get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {sources: {content: mockSourcesContent, get: mockSourcesGet}},
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints source details', async () => {
    mockSourcesGet.mockResolvedValue(source)

    const {error, stdout} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-def456'])

    if (error) throw error
    expect(stdout).toContain('ID:        source-def456')
    expect(stdout).toContain('Filename:  refunds.md')
    expect(stdout).toContain('URL:       https://example.com/docs/refunds')
    expect(stdout).toContain('Topics:    billing, refunds')
    expect(stdout).toContain('Distilled: 2026-08-01T00:30:00.000Z')
    expect(mockSourcesGet).toHaveBeenCalledWith({sourceId: 'source-def456'})
    expect(mockSourcesContent).not.toHaveBeenCalled()
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('prints dashes for missing optional details', async () => {
    mockSourcesGet.mockResolvedValue({
      ...source,
      canonicalUrl: null,
      distilledAt: null,
      fetchedAt: null,
      tldr: null,
      topics: null,
    })

    const {error, stdout} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-def456'])

    if (error) throw error
    expect(stdout).toContain('URL:       -')
    expect(stdout).toContain('Topics:    -')
    expect(stdout).toContain('Summary:   -')
  })

  test('outputs JSON with --json', async () => {
    mockSourcesGet.mockResolvedValue(source)

    const {error, stdout} = await testCommand(GetSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(source)
  })

  test('prints the distilled content with --content', async () => {
    mockSourcesContent.mockResolvedValue(sourceContent)

    const {error, stdout} = await testCommand(GetSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--content',
    ])

    if (error) throw error
    expect(stdout).toBe(`${sourceContent.content}\n`)
    expect(mockSourcesContent).toHaveBeenCalledWith({sourceId: 'source-def456'})
    expect(mockSourcesGet).not.toHaveBeenCalled()
  })

  test('requests a line range with --lines', async () => {
    mockSourcesContent.mockResolvedValue(sourceContent)

    const {error} = await testCommand(GetSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--content',
      '--lines',
      '10:20',
    ])

    if (error) throw error
    expect(mockSourcesContent).toHaveBeenCalledWith({
      endLine: 20,
      sourceId: 'source-def456',
      startLine: 10,
    })
  })

  test('outputs the content response as JSON with --content --json', async () => {
    mockSourcesContent.mockResolvedValue(sourceContent)

    const {error, stdout} = await testCommand(GetSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--content',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(sourceContent)
  })

  test.each(['10', '0:5', '20:10', 'a:b', '1:2:3'])('rejects --lines %s', async (lines) => {
    const {error} = await testCommand(GetSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--content',
      '--lines',
      lines,
    ])

    expect(error?.message).toContain('`--lines` must be a range like 10:20')
    expect(mockSourcesContent).not.toHaveBeenCalled()
  })

  test('requires --content for --lines', async () => {
    const {error} = await testCommand(GetSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--lines',
      '1:2',
    ])

    expect(error?.message).toContain('--content')
    expect(mockSourcesGet).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockSourcesGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Source "source-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockSourcesGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetSourceCommand, ['kb-abc123', 'source-def456'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to get source')
    expect(error?.oclif?.exit).toBe(1)
  })
})
