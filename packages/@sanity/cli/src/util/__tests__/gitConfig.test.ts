import {execFile} from 'node:child_process'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {getGitRemoteOriginUrl, getGitUserInfo} from '../gitConfig.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

const mockExecFile = vi.mocked(execFile)

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void

function mockGitConfig(responses: Record<string, string>) {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args.at(-1) as ExecFileCallback
    const key = (args[1] as string[])[2]
    const value = responses[key]
    if (value === undefined) {
      cb(new Error(`key not found: ${key}`), '', '')
    } else {
      cb(null, `${value}\n`, '')
    }
    return undefined as never
  })
}

function mockGitUnavailable() {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args.at(-1) as ExecFileCallback
    cb(new Error('git not found'), '', '')
    return undefined as never
  })
}

describe('getGitUserInfo', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns name and email when both are configured', async () => {
    mockGitConfig({
      'user.email': 'test@example.com',
      'user.name': 'Test User',
    })

    const result = await getGitUserInfo()
    expect(result).toEqual({email: 'test@example.com', name: 'Test User'})
  })

  test('returns null when name is missing', async () => {
    mockGitConfig({
      'user.email': 'test@example.com',
    })

    const result = await getGitUserInfo()
    expect(result).toBeNull()
  })

  test('returns null when email is missing', async () => {
    mockGitConfig({
      'user.name': 'Test User',
    })

    const result = await getGitUserInfo()
    expect(result).toBeNull()
  })

  test('returns null when git is not available', async () => {
    mockGitUnavailable()

    const result = await getGitUserInfo()
    expect(result).toBeNull()
  })
})

describe('getGitRemoteOriginUrl', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns the remote origin url', async () => {
    mockGitConfig({
      'remote.origin.url': 'https://github.com/test/repo.git',
    })

    const result = await getGitRemoteOriginUrl('/some/path')
    expect(result).toBe('https://github.com/test/repo.git')
    expect(mockExecFile).toHaveBeenCalledWith(
      'git',
      ['config', '--get', 'remote.origin.url'],
      expect.objectContaining({cwd: '/some/path'}),
      expect.any(Function),
    )
  })

  test('returns undefined when no remote is configured', async () => {
    mockGitConfig({})

    const result = await getGitRemoteOriginUrl('/some/path')
    expect(result).toBeUndefined()
  })

  test('returns undefined when git is not available', async () => {
    mockGitUnavailable()

    const result = await getGitRemoteOriginUrl('/some/path')
    expect(result).toBeUndefined()
  })
})
