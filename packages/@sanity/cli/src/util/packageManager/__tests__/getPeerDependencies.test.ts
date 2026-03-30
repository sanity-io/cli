import spawn, {type Result} from 'nano-spawn'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getPeerDependencies} from '../getPeerDependencies.js'
import {getPartialEnvWithNpmPath} from '../packageManagerChoice.js'

vi.mock('nano-spawn', () => ({
  default: vi.fn(),
}))

vi.mock('../packageManagerChoice.js', () => ({
  getPartialEnvWithNpmPath: vi.fn(),
}))

const mockSpawn = vi.mocked(spawn)
const mockGetPartialEnvWithNpmPath = vi.mocked(getPartialEnvWithNpmPath)

afterEach(() => {
  vi.clearAllMocks()
})

describe('getPeerDependencies', () => {
  const cwd = '/test/project'

  test('returns formatted peer dependencies from npm view output', async () => {
    mockGetPartialEnvWithNpmPath.mockReturnValue({PATH: '/mock/path'})
    mockSpawn.mockResolvedValueOnce({
      stdout: JSON.stringify({
        next: '^15.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      }),
    } as unknown as Result)

    const result = await getPeerDependencies('next-sanity@12', cwd)

    expect(mockSpawn).toHaveBeenCalledWith(
      'npm',
      ['view', 'next-sanity@12', 'peerDependencies', '--json'],
      {cwd, env: {PATH: '/mock/path'}},
    )
    expect(result).toEqual(['next@^15.0.0', 'react@^19.0.0', 'react-dom@^19.0.0'])
  })

  test('returns empty array when package has no peer dependencies', async () => {
    mockGetPartialEnvWithNpmPath.mockReturnValue({PATH: '/mock/path'})
    mockSpawn.mockResolvedValueOnce({
      stdout: '{}',
    } as unknown as Result)

    const result = await getPeerDependencies('some-package@1', cwd)

    expect(result).toEqual([])
  })

  test('returns empty array when npm view returns null', async () => {
    mockGetPartialEnvWithNpmPath.mockReturnValue({PATH: '/mock/path'})
    mockSpawn.mockResolvedValueOnce({
      stdout: 'null',
    } as unknown as Result)

    const result = await getPeerDependencies('some-package@1', cwd)

    expect(result).toEqual([])
  })

  test('returns empty array when npm view returns empty stdout', async () => {
    mockGetPartialEnvWithNpmPath.mockReturnValue({PATH: '/mock/path'})
    mockSpawn.mockResolvedValueOnce({
      stdout: '',
    } as unknown as Result)

    const result = await getPeerDependencies('some-package@1', cwd)

    expect(result).toEqual([])
  })

  test('throws error when npm view fails', async () => {
    mockGetPartialEnvWithNpmPath.mockReturnValue({PATH: '/mock/path'})
    mockSpawn.mockRejectedValueOnce(new Error('npm view failed'))

    await expect(getPeerDependencies('bad-package@1', cwd)).rejects.toThrow(
      'Failed to resolve peer dependencies for bad-package@1',
    )
  })

  test('throws error when npm view returns invalid JSON', async () => {
    mockGetPartialEnvWithNpmPath.mockReturnValue({PATH: '/mock/path'})
    mockSpawn.mockResolvedValueOnce({
      stdout: 'npm WARN some warning\n{invalid json',
    } as unknown as Result)

    await expect(getPeerDependencies('bad-package@1', cwd)).rejects.toThrow(
      'Failed to resolve peer dependencies for bad-package@1',
    )
  })
})
