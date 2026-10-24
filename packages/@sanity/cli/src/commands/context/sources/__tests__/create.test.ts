import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {filesSource, webSource} from '../../__tests__/fixtures.js'
import {CreateSourceCommand} from '../create.js'

const mockSourcesCreate = vi.hoisted(() => vi.fn())
const mockSourcesPreview = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())
const mockReadStream = vi.hoisted(() => vi.fn())

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

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {...actual, readFile: mockReadFile}
})

vi.mock('node:stream/consumers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:stream/consumers')>()
  return {...actual, text: mockReadStream}
})

describe('context sources create', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {sources: {create: mockSourcesCreate, preview: mockSourcesPreview}},
    })
    mockSourcesCreate.mockResolvedValue(webSource)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('adds a website source with crawl options and prints its first sync', async () => {
    const {error, stdout} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com/docs',
      '--include-path',
      '^/docs/',
      '--include-path',
      '^/guides/',
      '--exclude-path',
      '^/docs/old/',
      '--max-depth',
      '3',
      '--page-limit',
      '100',
      '--sitemap-only',
      '--no-ignore-query-params',
    ])

    if (error) throw error
    expect(mockSourcesCreate).toHaveBeenCalledWith({
      crawlOptions: {
        excludePaths: ['^/docs/old/'],
        ignoreQueryParameters: false,
        includePaths: ['^/docs/', '^/guides/'],
        maxDepth: 3,
        pageLimit: 100,
        sitemapOnly: true,
      },
      type: 'web',
      url: 'https://example.com/docs',
    })
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
    expect(stdout).toContain('Source ID: source-def456')
    expect(stdout).toContain('Sync ID: sync-ghi789 (completed)')
    expect(stdout).toContain('sanity context sources syncs get kb-abc123 source-def456 sync-ghi789')
  })

  test('adds a website source without crawl options', async () => {
    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
    ])

    if (error) throw error
    expect(mockSourcesCreate).toHaveBeenCalledWith({type: 'web', url: 'https://example.com'})
  })

  test('points at the source when its first sync has not started yet', async () => {
    mockSourcesCreate.mockResolvedValue({...webSource, latestSync: null})

    const {error, stdout} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
    ])

    if (error) throw error
    expect(stdout).toContain('sanity context sources get kb-abc123 source-def456')
  })

  test('outputs the source as JSON with --json', async () => {
    const {error, stdout} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(webSource)
  })

  test('estimates a crawl with --dry-run without adding the source', async () => {
    mockSourcesPreview.mockResolvedValue({
      groups: [
        {count: 120, prefix: '/docs/'},
        {count: 30, prefix: '/blog/'},
      ],
      otherCount: 5,
      totalPages: 155,
      truncated: false,
    })

    const {error, stdout} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
      '--page-limit',
      '500',
      '--dry-run',
    ])

    if (error) throw error
    expect(mockSourcesPreview).toHaveBeenCalledWith({
      crawlOptions: {pageLimit: 500},
      url: 'https://example.com',
    })
    expect(mockSourcesCreate).not.toHaveBeenCalled()
    expect(stdout).toContain('Pages: ~155')
    expect(stdout).toContain('/docs/')
    expect(stdout).toContain('(other)')
  })

  test('says when a dry run counted only part of the site, and outputs JSON', async () => {
    const preview = {groups: [], otherCount: 0, totalPages: 1000, truncated: true}
    mockSourcesPreview.mockResolvedValueOnce({
      groups: [{count: 3, prefix: '/'}],
      otherCount: 0,
      totalPages: 3,
      truncated: false,
    })
    const small = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
      '--dry-run',
    ])
    if (small.error) throw small.error
    expect(small.stdout).not.toContain('(other)')

    mockSourcesPreview.mockResolvedValue(preview)

    const {error, stdout} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
      '--dry-run',
    ])
    if (error) throw error
    expect(stdout).toContain('Pages: more than 1000')
    expect(stdout).not.toContain('Path')

    const json = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
      '--dry-run',
      '--json',
    ])
    if (json.error) throw json.error
    expect(JSON.parse(json.stdout)).toEqual(preview)
  })

  test('errors when a dry run fails', async () => {
    mockSourcesPreview.mockRejectedValue(httpError(404))

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-missing',
      '--url',
      'https://example.com',
      '--dry-run',
    ])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('requires --url for --dry-run', async () => {
    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--file',
      './a.pdf',
      '--dry-run',
    ])

    expect(error?.message).toContain('The --dry-run flag only applies to --url sources')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockSourcesPreview).not.toHaveBeenCalled()
  })

  test('adds a dataset source', async () => {
    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--query',
      '*[_type == "article"]',
      '--project-id',
      'proj123',
      '--dataset',
      'production',
    ])

    if (error) throw error
    expect(mockSourcesCreate).toHaveBeenCalledWith({
      query: '*[_type == "article"]',
      sanityDatasetId: 'production',
      sanityProjectId: 'proj123',
      type: 'sanity-dataset',
    })
  })

  test('errors when a dataset source is missing --project-id or --dataset', async () => {
    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--query',
      '*[_type == "article"]',
      '--project-id',
      'proj123',
    ])

    expect(error?.message).toContain('require --project-id and --dataset')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockSourcesCreate).not.toHaveBeenCalled()
  })

  test('uploads a local file, titled after the file by default', async () => {
    const fileContent = Buffer.from('%PDF-1.7')
    mockReadFile.mockResolvedValue(fileContent)
    mockSourcesCreate.mockResolvedValue(filesSource)

    const {error, stdout} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--file',
      './docs/handbook.pdf',
    ])

    if (error) throw error
    expect(mockReadFile).toHaveBeenCalledWith('./docs/handbook.pdf')
    expect(mockSourcesCreate).toHaveBeenCalledWith({
      contentType: 'application/pdf',
      file: fileContent,
      filename: 'handbook.pdf',
      title: 'handbook.pdf',
      type: 'files',
    })
    expect(stdout).toContain('Source ID: source-files')
  })

  test('uploads a file with an explicit title and content type', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--file',
      './data.bin',
      '--title',
      '  Data  ',
      '--content-type',
      'application/x-custom',
    ])

    if (error) throw error
    expect(mockSourcesCreate).toHaveBeenCalledWith(
      expect.objectContaining({contentType: 'application/x-custom', title: 'Data'}),
    )
  })

  test('errors when the file cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'))

    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123', '--file', './missing.pdf'])

    expect(error?.message).toContain('Failed to read file "./missing.pdf"')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockSourcesCreate).not.toHaveBeenCalled()
  })

  test('adds text read from a local file, titled after the file by default', async () => {
    mockReadFile.mockResolvedValue('# Refunds\nWithin 10 days.')

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--text',
      './refunds.md',
      '--content-type',
      'markdown',
    ])

    if (error) throw error
    expect(mockReadFile).toHaveBeenCalledWith('./refunds.md', 'utf8')
    expect(mockSourcesCreate).toHaveBeenCalledWith({
      content: '# Refunds\nWithin 10 days.',
      contentType: 'text/markdown',
      title: 'refunds.md',
      type: 'files',
    })
  })

  test('adds text read from stdin', async () => {
    mockReadStream.mockResolvedValue('Refunds are processed within 10 days.')

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--text',
      '-',
      '--title',
      'Refund policy',
      '--content-type',
      'text/plain',
    ])

    if (error) throw error
    expect(mockReadStream).toHaveBeenCalledWith(process.stdin)
    expect(mockSourcesCreate).toHaveBeenCalledWith({
      content: 'Refunds are processed within 10 days.',
      contentType: 'text/plain',
      title: 'Refund policy',
      type: 'files',
    })
  })

  test('requires a title for text read from stdin', async () => {
    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123', '--text', '-'])

    expect(error?.message).toContain('needs a title')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockReadStream).not.toHaveBeenCalled()
  })

  test('errors when the text cannot be read', async () => {
    mockReadStream.mockRejectedValue(new Error('stdin closed'))

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--text',
      '-',
      '--title',
      'Notes',
    ])

    expect(error?.message).toContain('Failed to read stdin: stdin closed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the text file cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123', '--text', './missing.md'])

    expect(error?.message).toContain('Failed to read file "./missing.md": ENOENT')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors on empty text', async () => {
    mockReadFile.mockResolvedValue('  \n')

    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123', '--text', './empty.md'])

    expect(error?.message).toContain('Text content cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('errors on an unsupported text content type', async () => {
    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--text',
      './notes.json',
      '--content-type',
      'application/json',
    ])

    expect(error?.message).toContain('markdown or plain')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  test('errors on an empty title', async () => {
    mockReadFile.mockResolvedValue('content')

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--text',
      './notes.md',
      '--title',
      '  ',
    ])

    expect(error?.message).toContain('Title cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('errors unless exactly one source flag is given', async () => {
    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123'])

    expect(error?.message).toContain('Provide exactly one of --url, --query, --file or --text')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('errors on an empty source flag', async () => {
    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123', '--url', '  '])

    expect(error?.message).toContain('--url cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
  })

  test('errors when crawl flags are given for a non-website source', async () => {
    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--file',
      './a.pdf',
      '--page-limit',
      '10',
    ])

    expect(error?.message).toContain('Crawl flags only apply to --url sources')
    expect(error?.oclif?.exit).toBe(2)
  })

  test.each([
    ['--title', 'Docs', 'The --title flag only applies'],
    ['--content-type', 'text/plain', 'The --content-type flag only applies'],
  ])('errors when %s is given for a website source', async (flag, value, message) => {
    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
      flag,
      value,
    ])

    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(2)
    expect(mockSourcesCreate).not.toHaveBeenCalled()
  })

  test('errors on an empty --content-type', async () => {
    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--file',
      './a.pdf',
      '--content-type',
      ' ',
    ])

    expect(error?.message).toContain('`--content-type` cannot be empty')
  })

  test('errors with a friendly message on 404', async () => {
    mockSourcesCreate.mockRejectedValue(httpError(404))

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-missing',
      '--url',
      'https://example.com',
    ])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockSourcesCreate.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
    ])

    expect(error?.message).toContain('Failed to add source: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts content-bearing flags from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'sources',
        'create',
        'kb-abc123',
        '--url=https://intranet.example.com',
        '--include-path=^/secret/',
        '--exclude-path=^/private/',
        '--page-limit=10',
      ],
      CreateSourceCommand.telemetry,
    )

    expect(result.extraArguments).toEqual([
      '--url',
      '--include-path',
      '--exclude-path',
      '--page-limit=10',
    ])
  })

  test('redacts file, text, title and query flags from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'sources',
        'create',
        'kb-abc123',
        '--file=/Users/private/handbook.pdf',
        '--text=/Users/private/notes.md',
        '--title=Internal notes',
        '--query=*[_type == "secret"]',
      ],
      CreateSourceCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--file', '--text', '--title', '--query'])
  })
})
