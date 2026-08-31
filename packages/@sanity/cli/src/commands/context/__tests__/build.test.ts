import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {BuildKnowledgeBaseCommand} from '../build.js'
import {succeededJob} from './fixtures.js'

const mockBuild = vi.hoisted(() => vi.fn())
const mockCancelBuild = vi.hoisted(() => vi.fn())
const mockJobsGet = vi.hoisted(() => vi.fn())
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
    }),
  }
})

describe('context build', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {build: mockBuild, cancelBuild: mockCancelBuild, jobs: {get: mockJobsGet}},
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('starts a build and prints the job ID with a tracking hint', async () => {
    mockBuild.mockResolvedValue({jobId: 'job-def456'})

    const {error, stdout} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('Job ID: job-def456')
    expect(stdout).toContain('sanity context jobs get kb-abc123 job-def456')
    expect(mockBuild).toHaveBeenCalledTimes(1)
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('waits for the build with --watch and succeeds', async () => {
    mockBuild.mockResolvedValue({jobId: 'job-def456'})
    mockJobsGet.mockResolvedValue(succeededJob)

    const {error} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123', '--watch'])

    if (error) throw error
    expect(mockJobsGet).toHaveBeenCalledWith({jobId: 'job-def456'})
  })

  test('exits non-zero when a watched build fails', async () => {
    mockBuild.mockResolvedValue({jobId: 'job-def456'})
    mockJobsGet.mockResolvedValue({...succeededJob, error: 'boom', status: 'failed'})

    const {error} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123', '--watch'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Build failed: boom')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when polling a watched build fails', async () => {
    mockBuild.mockResolvedValue({jobId: 'job-def456'})
    mockJobsGet.mockRejectedValue(new Error('poll boom'))

    const {error} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123', '--watch'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to watch build job')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('cancels the running build with --cancel', async () => {
    mockCancelBuild.mockResolvedValue({cancelled: true})

    const {error, stdout} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123', '--cancel'])

    if (error) throw error
    expect(stdout).toContain('Build cancelled')
    expect(mockBuild).not.toHaveBeenCalled()
  })

  test('reports when there is no build to cancel', async () => {
    mockCancelBuild.mockResolvedValue({cancelled: false})

    const {error, stdout} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123', '--cancel'])

    if (error) throw error
    expect(stdout).toContain('No running build to cancel')
  })

  test('errors when --cancel and --watch are combined', async () => {
    const {error} = await testCommand(BuildKnowledgeBaseCommand, [
      'kb-abc123',
      '--cancel',
      '--watch',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(mockBuild).not.toHaveBeenCalled()
    expect(mockCancelBuild).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockBuild.mockRejectedValue(httpError(404))

    const {error} = await testCommand(BuildKnowledgeBaseCommand, ['kb-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockBuild.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(BuildKnowledgeBaseCommand, ['kb-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to start build')
    expect(error?.oclif?.exit).toBe(1)
  })
})
