import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {contextRoutes} from '../../../commands/context/__tests__/contextRoutes.js'
import {DeleteKnowledgeBaseCommand} from '../../../commands/context/delete.js'
import {ApplyIssuesCommand} from '../../../commands/context/issues/apply.js'
import {ListKnowledgeBasesCommand} from '../../../commands/context/list.js'
import {UpdateSourceCommand} from '../../../commands/context/sources/edit.js'
import {ListSourcesCommand} from '../../../commands/context/sources/list.js'
import {StartSyncCommand} from '../../../commands/context/sources/sync.js'
import {UpdateKnowledgeBaseCommand} from '../../../commands/context/update.js'

const mockRequest = vi.hoisted(() => vi.fn())
const mockBlueprintsRequest = vi.hoisted(() => vi.fn())
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
      text: '',
      warn: vi.fn(),
    }),
  }
})

const kb = {organizationId: 'org-abc123', publicId: 'kb-abc123'}

describe('generated context commands', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {request: mockRequest},
      request: mockBlueprintsRequest,
    })
    mockBlueprintsRequest.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockBlueprintsRequest.mockReset()
    mockRequest.mockReset()
  })

  test('drains every page of a list and renders the table columns', async () => {
    mockRequest
      .mockResolvedValueOnce({data: [{id: 'src1', title: 'Docs', type: 'web'}], nextCursor: 'c2'})
      .mockResolvedValueOnce({
        data: [{id: 'src2', title: 'Handbook', type: 'files'}],
        nextCursor: null,
      })

    const {error, stdout} = await testCommand(ListSourcesCommand, ['kb-abc123'])

    if (error) throw error
    expect(mockRequest.mock.calls).toEqual([
      [
        'GET /knowledge-bases/{knowledgeBaseId}/sources',
        {params: {knowledgeBaseId: 'kb-abc123'}, query: {}},
      ],
      [
        'GET /knowledge-bases/{knowledgeBaseId}/sources',
        {params: {knowledgeBaseId: 'kb-abc123'}, query: {cursor: 'c2'}},
      ],
    ])
    expect(stdout).toContain('Handbook')
    expect(stdout).toContain('Title')
  })

  test('prints the drained list as JSON with --json', async () => {
    mockRequest.mockResolvedValueOnce({data: [{id: 'src1'}], nextCursor: null})

    const {error, stdout} = await testCommand(ListSourcesCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([{id: 'src1'}])
  })

  test('sends the organization flag in the query and query booleans as strings', async () => {
    mockRequest.mockResolvedValueOnce({data: [], nextCursor: null})

    const {error, stdout} = await testCommand(ListKnowledgeBasesCommand, [
      '--organization',
      'org-abc123',
      '--include-drafts',
    ])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith('GET /knowledge-bases', {
      params: {},
      query: {includeDrafts: 'true', organizationId: 'org-abc123'},
    })
    expect(stdout).toContain('No results')
  })

  test('sends body flags, nesting crawl options under the stored ones', async () => {
    mockRequest.mockImplementation(
      contextRoutes({
        'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}': () => ({
          crawlOptions: {includePaths: ['^/docs/'], maxDepth: 5},
          id: 'src1',
        }),
        'PATCH /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}': ({body}) => ({
          id: 'src1',
          ...body,
        }),
      }),
    )

    const {error, stdout} = await testCommand(UpdateSourceCommand, [
      'kb-abc123',
      'src1',
      '--max-depth',
      '2',
      '--sync-frequency',
      'null',
      '--no-confirm-deletions',
    ])

    if (error) throw error
    expect(mockRequest).toHaveBeenCalledWith(
      'PATCH /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}',
      {
        body: {
          confirmDeletions: false,
          crawlOptions: {includePaths: ['^/docs/'], maxDepth: 2},
          syncFrequency: null,
        },
        params: {knowledgeBaseId: 'kb-abc123', sourceId: 'src1'},
        query: {},
      },
    )
    expect(stdout).toMatch(/Sync frequency: +-/)
  })

  test('refuses a flag value the spec does not allow', async () => {
    const {error} = await testCommand(UpdateSourceCommand, [
      'kb-abc123',
      'src1',
      '--sync-frequency',
      'daily',
    ])

    expect(error?.message).toContain(
      'Expected --sync-frequency=daily to be one of: weekly, monthly, null',
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('fails with the API error message', async () => {
    mockRequest.mockRejectedValueOnce(httpError(409, 'Conflict', {message: 'A build is running'}))

    const {error} = await testCommand(UpdateSourceCommand, ['kb-abc123', 'src1', '--title', 'Docs'])

    expect(error?.message).toBe('Update a source failed: A build is running')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('takes a variadic argument into the body and watches the job it starts', async () => {
    mockRequest.mockImplementation(
      contextRoutes({
        'GET /knowledge-bases/{knowledgeBaseId}/jobs/{jobId}': () => ({
          error: 'boom',
          id: 'job1',
          status: 'failed',
        }),
        'POST /knowledge-bases/{knowledgeBaseId}/issues/apply': () => ({jobId: 'job1'}),
      }),
    )

    const {error, stdout} = await testCommand(ApplyIssuesCommand, [
      'kb-abc123',
      'i1',
      'i2',
      '--watch',
    ])

    expect(mockRequest).toHaveBeenCalledWith(
      'POST /knowledge-bases/{knowledgeBaseId}/issues/apply',
      {
        body: {issueIds: ['i1', 'i2']},
        params: {knowledgeBaseId: 'kb-abc123'},
        query: {},
      },
    )
    expect(stdout).toContain('Job ID: job1')
    expect(error?.message).toBe('Job failed: boom')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('--json --watch prints the result when the response starts nothing to follow', async () => {
    mockRequest.mockResolvedValueOnce({jobId: null})

    const {error, stdout} = await testCommand(ApplyIssuesCommand, [
      'kb-abc123',
      'i1',
      '--watch',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual({jobId: null})
  })

  test('--watch on a sync held for confirmation exits non-zero with the next steps', async () => {
    const held = {heldDeletions: 3, id: 'sync-new', sourceId: 'src1', status: 'held'}
    mockRequest.mockImplementation(
      contextRoutes({
        'GET /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}': () =>
          mockRequest.mock.calls.length === 1
            ? {id: 'src1', latestSync: {id: 'sync-old', status: 'completed'}}
            : {id: 'src1', latestSync: held},
        'POST /knowledge-bases/{knowledgeBaseId}/sources/{sourceId}/syncs': () => ({
          jobId: null,
          sourceId: 'src1',
        }),
      }),
    )

    const {error} = await testCommand(StartSyncCommand, ['kb-abc123', 'src1', '--watch'])

    expect(error?.message).toContain('Sync held: it would delete 3 documents')
    expect(error?.message).toContain('sanity context sources syncs confirm kb-abc123 src1 sync-new')
    expect(error?.oclif?.exit).toBe(1)
  })

  describe('update of a knowledge base a blueprint manages', () => {
    beforeEach(() => {
      mockRequest.mockImplementation(
        contextRoutes({
          'GET /knowledge-bases/{knowledgeBaseId}': () => kb,
          'PATCH /knowledge-bases/{knowledgeBaseId}': ({body}) => ({...kb, ...body}),
        }),
      )
      mockBlueprintsRequest
        .mockResolvedValueOnce([{stackId: 'st1'}])
        .mockResolvedValueOnce({name: 'prod'})
    })

    test('refuses a title or description change, which the next deploy would undo', async () => {
      const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
        'kb-abc123',
        '--title',
        'Docs',
      ])

      expect(error?.message).toContain(
        'The blueprint stack "prod" manages the title and description of knowledge base "kb-abc123"',
      )
      expect(mockRequest).not.toHaveBeenCalledWith(
        'PATCH /knowledge-bases/{knowledgeBaseId}',
        expect.anything(),
      )
    })

    test('allows finishing a draft, which the blueprint does not manage', async () => {
      mockBlueprintsRequest.mockResolvedValue([{stackId: 'st1'}])
      const {error} = await testCommand(UpdateKnowledgeBaseCommand, ['kb-abc123', '--no-draft'])

      if (error) throw error
      expect(mockRequest).toHaveBeenCalledWith('PATCH /knowledge-bases/{knowledgeBaseId}', {
        body: {draft: false},
        params: {knowledgeBaseId: 'kb-abc123'},
        query: {},
      })
      expect(mockBlueprintsRequest).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    beforeEach(() => {
      mockRequest.mockImplementation(
        contextRoutes({
          'DELETE /knowledge-bases/{knowledgeBaseId}': () => undefined,
          'GET /knowledge-bases/{knowledgeBaseId}': () => kb,
        }),
      )
    })

    test('requires --yes when unattended', async () => {
      const {error} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-abc123'])

      expect(error?.message).toContain('Deletion requires confirmation. Pass `--yes` to delete.')
      expect(mockRequest).not.toHaveBeenCalledWith(
        'DELETE /knowledge-bases/{knowledgeBaseId}',
        expect.anything(),
      )
    })

    test('deletes with --yes', async () => {
      const {error, stdout} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-abc123', '--yes'])

      if (error) throw error
      expect(mockRequest).toHaveBeenCalledWith('DELETE /knowledge-bases/{knowledgeBaseId}', {
        params: {knowledgeBaseId: 'kb-abc123'},
        query: {},
      })
      expect(stdout).toContain('Delete a knowledge base: done')
    })

    test('refuses a knowledge base a blueprint manages', async () => {
      mockBlueprintsRequest
        .mockResolvedValueOnce([{stackId: 'st1'}])
        .mockResolvedValueOnce({name: 'prod'})

      const {error} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-abc123', '--yes'])

      expect(error?.message).toContain(
        'The blueprint stack "prod" manages knowledge base "kb-abc123"',
      )
      expect(mockRequest).not.toHaveBeenCalledWith(
        'DELETE /knowledge-bases/{knowledgeBaseId}',
        expect.anything(),
      )
    })
  })
})
