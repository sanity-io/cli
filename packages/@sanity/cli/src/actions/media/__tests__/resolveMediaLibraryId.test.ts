import {exitCodes} from '@sanity/cli-core'
import {createTestToken, mockApi} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MEDIA_LIBRARY_API_VERSION} from '../../../services/mediaLibraries.js'
import {resolveMediaLibraryId} from '../resolveMediaLibraryId.js'

const mockPromptForMediaLibrary = vi.hoisted(() => vi.fn())
vi.mock('../../../prompts/promptForMediaLibrary.js', () => ({
  promptForMediaLibrary: mockPromptForMediaLibrary,
}))

function mockLibraryList(libraries: string[]) {
  mockApi({
    apiVersion: MEDIA_LIBRARY_API_VERSION,
    method: 'get',
    query: {organizationId: 'org-1'},
    uri: '/media-libraries',
  }).reply(200, {
    data: libraries.map((id) => ({id, organizationId: 'org-1', status: 'active'})),
  })
}

function resolve(options: {mediaLibraryIdFlag?: string; unattended?: boolean} = {}) {
  return resolveMediaLibraryId({
    mediaLibraryIdFlag: options.mediaLibraryIdFlag,
    organizationId: 'org-1',
    unattended: options.unattended ?? false,
  })
}

describe('resolveMediaLibraryId', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('a valid --media-library-id wins without prompting', async () => {
    createTestToken('test-token')
    mockLibraryList(['library-a', 'library-b'])

    await expect(resolve({mediaLibraryIdFlag: 'library-b'})).resolves.toBe('library-b')
    expect(mockPromptForMediaLibrary).not.toHaveBeenCalled()
  })

  test('an inactive --media-library-id is a usage error naming the active libraries', async () => {
    createTestToken('test-token')
    mockLibraryList(['library-a'])

    await expect(resolve({mediaLibraryIdFlag: 'library-z'})).rejects.toMatchObject({
      message: expect.stringContaining(
        'Media library library-z is not an active library of organization org-1 (found: library-a)',
      ),
      oclif: {exit: exitCodes.USAGE_ERROR},
    })
  })

  test('no active library is a runtime error, not misuse', async () => {
    createTestToken('test-token')
    mockLibraryList([])

    await expect(resolve()).rejects.toMatchObject({
      message: expect.stringContaining('Organization org-1 has no active media library'),
      oclif: {exit: exitCodes.RUNTIME_ERROR},
    })
  })

  test('a single active library resolves without prompting', async () => {
    createTestToken('test-token')
    mockLibraryList(['only-library'])

    await expect(resolve()).resolves.toBe('only-library')
    expect(mockPromptForMediaLibrary).not.toHaveBeenCalled()
  })

  test('several active libraries demand the flag when unattended', async () => {
    createTestToken('test-token')
    mockLibraryList(['library-a', 'library-b'])

    await expect(resolve({unattended: true})).rejects.toMatchObject({
      message: expect.stringContaining('--media-library-id'),
      oclif: {exit: exitCodes.USAGE_ERROR},
    })
    expect(mockPromptForMediaLibrary).not.toHaveBeenCalled()
  })

  test('several active libraries prompt when interactive', async () => {
    createTestToken('test-token')
    mockLibraryList(['library-a', 'library-b'])
    mockPromptForMediaLibrary.mockResolvedValue('library-b')

    await expect(resolve()).resolves.toBe('library-b')
    expect(mockPromptForMediaLibrary).toHaveBeenCalledWith({
      mediaLibraries: [
        {id: 'library-a', organizationId: 'org-1', status: 'active'},
        {id: 'library-b', organizationId: 'org-1', status: 'active'},
      ],
    })
  })

  test('Ctrl+C in the prompt propagates as ExitPromptError for SanityCommand.catch', async () => {
    createTestToken('test-token')
    mockLibraryList(['library-a', 'library-b'])
    const abort = new Error('User force closed the prompt')
    abort.name = 'ExitPromptError'
    mockPromptForMediaLibrary.mockRejectedValue(abort)

    await expect(resolve()).rejects.toMatchObject({name: 'ExitPromptError'})
  })
})
