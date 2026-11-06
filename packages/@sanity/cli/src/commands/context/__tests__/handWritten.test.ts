import {mkdtemp, readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {select} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {BuildKnowledgeBaseCommand} from '../build.js'
import {GetDocumentContentCommand} from '../documents/content.js'
import {ResolveIssueCommand} from '../issues/resolve.js'
import {CreateSourceCommand} from '../sources/create.js'
import {UploadSourceFileCommand} from '../sources/upload.js'
import {contextRoutes} from './contextRoutes.js'

const mockRequest = vi.hoisted(() => vi.fn())
const mockRequestBytes = vi.hoisted(() => vi.fn())
const mockFetch = vi.hoisted(() => vi.fn())
const mockCreateFileSource = vi.hoisted(() => vi.fn())
const mockUploadFile = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockReadStream = vi.hoisted(() => vi.fn())

vi.mock('node:stream/consumers', () => ({text: mockReadStream}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: vi.fn(),
    spinner: vi.fn().mockReturnValue({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
      text: '',
      warn: vi.fn(),
    }),
  }
})

const source = {id: 'src1', latestSync: null, title: 'handbook.pdf', type: 'files'}

beforeEach(() => {
  mockGetGlobalCliClient.mockResolvedValue({
    context: {
      createFileSource: mockCreateFileSource,
      fetch: mockFetch,
      request: mockRequest,
      requestBytes: mockRequestBytes,
      uploadFile: mockUploadFile,
    },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

async function tempFile(name: string, content: string | Uint8Array): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'context-')), name)
  await writeFile(path, content)
  return path
}

describe('context build', () => {
  test('--cancel calls the cancel operation instead of starting a build', async () => {
    mockRequest.mockResolvedValueOnce({cancelled: false})

    const {error, stdout} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123', '--cancel'])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith(
      'POST /knowledge-bases/{knowledgeBaseId}/build/cancel',
      {
        params: {knowledgeBaseId: 'kb-abc123'},
      },
    )
    expect(stdout).toContain('No running build to cancel')
  })

  test('starts a build and watches it with --watch', async () => {
    mockRequest.mockImplementation(
      contextRoutes({
        'GET /knowledge-bases/{knowledgeBaseId}/jobs/{jobId}': () => ({
          id: 'job1',
          status: 'succeeded',
        }),
        'POST /knowledge-bases/{knowledgeBaseId}/build': () => ({jobId: 'job1'}),
      }),
    )

    const {error, stdout} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123', '--watch'])

    if (error) throw error
    expect(stdout).toContain('Job ID: job1')
  })
})

describe('context sources create', () => {
  test('--file adds a files source holding the file, titled by its name', async () => {
    const path = await tempFile('handbook.pdf', 'pdf bytes')
    mockCreateFileSource.mockResolvedValueOnce({source, sync: {jobId: 'job1', sourceId: 'src1'}})

    const {error, stdout} = await testCommand(CreateSourceCommand, ['kb-abc123', '--file', path])

    if (error) throw error
    expect(mockCreateFileSource).toHaveBeenCalledWith({
      contentType: 'application/pdf',
      file: Buffer.from('pdf bytes'),
      filename: 'handbook.pdf',
      knowledgeBaseId: 'kb-abc123',
      title: 'handbook.pdf',
      type: 'files',
    })
    expect(stdout).toContain('ID:')
    expect(stdout).toContain('job1')
  })

  test.each([
    [['--dry-run'], '--dry-run'],
    [['--max-depth', '2'], '--max-depth'],
    [['--sanity-project-id', 'abc123'], '--sanity-project-id'],
    [['--type', 'web'], '--type'],
  ])('--file refuses %j, which a files source would drop', async (extra, named) => {
    const path = await tempFile('handbook.pdf', 'pdf bytes')

    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123', '--file', path, ...extra])

    expect(error?.message).toContain(`Remove ${named}.`)
    expect(error?.oclif?.exit).toBe(2)
    expect(mockCreateFileSource).not.toHaveBeenCalled()
  })

  test('--file --watch follows the sync of the upload, through its job', async () => {
    const path = await tempFile('handbook.pdf', 'pdf bytes')
    mockCreateFileSource.mockResolvedValueOnce({source, sync: {jobId: 'job1', sourceId: 'src1'}})
    mockRequest.mockImplementation(
      contextRoutes({
        'GET /knowledge-bases/{knowledgeBaseId}/jobs/{jobId}': () => ({
          id: 'job1',
          result: {syncId: 'sync-upload'},
          status: 'succeeded',
        }),
        'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs/{syncId}': ({params}) => ({
          id: params?.syncId,
          sourceId: 'src1',
          status: 'completed',
        }),
      }),
    )

    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123', '--file', path, '--watch'])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith(
      'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs/{syncId}',
      {params: {knowledgeBaseId: 'kb-abc123', sourceId: 'src1', syncId: 'sync-upload'}},
    )
  })

  test('--text - reads the content from stdin and needs a title', async () => {
    const {error} = await testCommand(CreateSourceCommand, ['kb-abc123', '--text', '-'])
    expect(error?.message).toContain('Text read from stdin needs a title')

    mockReadStream.mockResolvedValueOnce('# Refunds\n')
    mockRequest.mockResolvedValueOnce(source)

    const created = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--text',
      '-',
      '--title',
      'Refunds',
    ])

    if (created.error) throw created.error
    expect(mockRequest).toHaveBeenCalledWith('POST /knowledge-bases/{knowledgeBaseId}/sources', {
      body: {content: '# Refunds\n', title: 'Refunds', type: 'files'},
      params: {knowledgeBaseId: 'kb-abc123'},
      query: {},
    })
  })

  test('takes exactly one of --url, --query, --file and --text', async () => {
    const both = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://x.example',
      '--query',
      '*',
    ])
    expect(both.error?.message).toMatch(
      /--query=\* cannot also be provided when using --url|cannot also be provided/,
    )

    const none = await testCommand(CreateSourceCommand, ['kb-abc123', '--max-depth', '2'])
    expect(none.error?.message).toContain('Provide exactly one of --url, --query, --file or --text')
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('--watch follows the sync the create started', async () => {
    mockRequest.mockImplementation(
      contextRoutes({
        'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs/{syncId}': ({params}) => ({
          id: params?.syncId,
          sourceId: 'src1',
          status: 'completed',
        }),
        'POST /knowledge-bases/{knowledgeBaseId}/sources': () => ({
          id: 'src1',
          latestSync: {id: 'sync-mine', status: 'running'},
          type: 'web',
        }),
      }),
    )

    const {error, stdout} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://x.example',
      '--watch',
    ])

    if (error) throw error
    expect(stdout).toContain('Latest sync: sync-mine (running)')
    expect(mockRequest).toHaveBeenCalledWith(
      'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs/{syncId}',
      {params: {knowledgeBaseId: 'kb-abc123', sourceId: 'src1', syncId: 'sync-mine'}},
    )
  })

  test('--url crawls a website through the spec operation, the type inferred', async () => {
    mockRequest.mockResolvedValueOnce({...source, type: 'web'})

    const {error} = await testCommand(CreateSourceCommand, [
      'kb-abc123',
      '--url',
      'https://example.com/docs',
      '--include-paths',
      '^/docs/',
    ])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith('POST /knowledge-bases/{knowledgeBaseId}/sources', {
      body: {
        crawlOptions: {includePaths: ['^/docs/']},
        type: 'web',
        url: 'https://example.com/docs',
      },
      params: {knowledgeBaseId: 'kb-abc123'},
      query: {},
    })
  })
})

describe('context sources upload', () => {
  test('uploads the file through the client upload helper', async () => {
    const path = await tempFile('notes.md', '# Notes')
    mockUploadFile.mockResolvedValueOnce({jobId: 'job1', sourceId: 'src1'})

    const {error} = await testCommand(UploadSourceFileCommand, [
      'kb-abc123',
      'src1',
      '--file',
      path,
    ])

    if (error) throw error
    expect(mockUploadFile).toHaveBeenCalledWith({
      contentType: 'text/markdown',
      file: Buffer.from('# Notes'),
      filename: 'notes.md',
      knowledgeBaseId: 'kb-abc123',
      sourceId: 'src1',
    })
  })
})

describe('context documents content', () => {
  test('writes the raw bytes to --output', async () => {
    const output = join(await mkdtemp(join(tmpdir(), 'context-')), 'handbook.pdf')
    mockRequestBytes.mockResolvedValueOnce(new Uint8Array([1, 2, 3]))

    const {error, stdout} = await testCommand(GetDocumentContentCommand, [
      'kb-abc123',
      'doc1',
      '--format',
      'raw',
      '--output',
      output,
    ])

    if (error) throw error
    expect(mockRequestBytes).toHaveBeenCalledWith(
      'GET /knowledge-bases/{knowledgeBaseId}/documents/{documentId}/content',
      {params: {documentId: 'doc1', knowledgeBaseId: 'kb-abc123'}, query: {format: 'raw'}},
    )
    expect(await readFile(output)).toEqual(Buffer.from([1, 2, 3]))
    expect(stdout).toContain(`Wrote ${output}`)
  })

  test('writes the JSON view to --output as JSON', async () => {
    const output = join(await mkdtemp(join(tmpdir(), 'context-')), 'view.json')
    mockRequest.mockResolvedValueOnce({content: 'first', slice: {end: 1, start: 1}})

    const {error} = await testCommand(GetDocumentContentCommand, [
      'kb-abc123',
      'doc1',
      '--format',
      'json',
      '--output',
      output,
    ])

    if (error) throw error
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({
      content: 'first',
      slice: {end: 1, start: 1},
    })
  })

  test('refuses --line-numbers with --json, which prints the JSON view', async () => {
    const {stdout} = await testCommand(GetDocumentContentCommand, [
      'kb-abc123',
      'doc1',
      '--json',
      '--line-numbers',
    ])

    expect(JSON.parse(stdout)).toMatchObject({
      error: {message: expect.stringContaining('--line-numbers'), oclif: {exit: 2}},
    })
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('numbers the lines of the JSON view with --line-numbers', async () => {
    mockRequest.mockResolvedValueOnce({content: 'first\nsecond', slice: {end: 11, start: 10}})

    const {error, stdout} = await testCommand(GetDocumentContentCommand, [
      'kb-abc123',
      'doc1',
      '--lines',
      '10-11',
      '--line-numbers',
    ])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith(
      'GET /knowledge-bases/{knowledgeBaseId}/documents/{documentId}/content',
      {
        params: {documentId: 'doc1', knowledgeBaseId: 'kb-abc123'},
        query: {format: 'json', lines: '10-11'},
      },
    )
    expect(stdout).toBe('10  first\n11  second\n')
  })
})

describe('context issues resolve', () => {
  const conflict = {
    content: {
      kind: 'conflict',
      sides: [{claim: 'Refunds take 5 days'}, {claim: 'Refunds take 10 days'}],
      suggested: 1,
    },
    resolution: null,
    status: 'open',
  }

  test('sends --side as the resolution', async () => {
    mockRequest.mockResolvedValueOnce({jobId: null})

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue1', '--side', '1'])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith(
      'POST /knowledge-bases/{knowledgeBaseId}/issues/{issueId}/resolve',
      {
        body: {resolution: 1},
        params: {issueId: 'issue1', knowledgeBaseId: 'kb-abc123'},
        query: {},
      },
    )
  })

  test('a cancelled side prompt is an abort, not a failed request', async () => {
    mockRequest.mockImplementation(
      contextRoutes({
        'GET /knowledge-bases/{knowledgeBaseId}': () => ({
          organizationId: 'org1',
          publicId: 'kb-abc123',
        }),
      }),
    )
    mockFetch.mockResolvedValueOnce(conflict)
    vi.mocked(select).mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), {name: 'ExitPromptError'}),
    )

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue1'], {
      mocks: {isInteractive: true},
    })

    expect(error?.message).not.toContain('Resolve a conflict issue failed')
  })

  test('asks which side is correct without --side', async () => {
    mockRequest.mockImplementation(
      contextRoutes({
        'GET /knowledge-bases/{knowledgeBaseId}': () => ({
          organizationId: 'org1',
          publicId: 'kb-abc123',
        }),
        'POST /knowledge-bases/{knowledgeBaseId}/issues/{issueId}/resolve': ({body}) => ({
          jobId: null,
          resolution: body?.resolution,
        }),
      }),
    )
    mockFetch.mockResolvedValueOnce(conflict)
    vi.mocked(select).mockResolvedValueOnce(0)

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue1'], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        choices: [
          {name: '[0] Refunds take 5 days', value: 0},
          {name: '[1] Refunds take 10 days', value: 1},
        ],
        default: 1,
      }),
    )
    expect(mockRequest).toHaveBeenCalledWith(
      'POST /knowledge-bases/{knowledgeBaseId}/issues/{issueId}/resolve',
      expect.objectContaining({body: {resolution: 0}}),
    )
  })
})

describe('hand-written command telemetry', () => {
  test.each([
    [GetDocumentContentCommand, ['--chunk', '--lines', '--output']],
    [UploadSourceFileCommand, ['--file']],
    [CreateSourceCommand, ['--file', '--text', '--title']],
  ])('%o redacts the generated free-text flags as well as its own', (command, expected) => {
    const redacted = command.telemetry.redactedFlags.map((flag) => flag.canonical)

    expect(redacted).toEqual(expect.arrayContaining(expected))
  })
})
