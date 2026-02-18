import {execSync, spawn} from 'node:child_process'
import {existsSync} from 'node:fs'

import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {CodemodCommand} from '../codemod.js'

vi.mock('../../util/getLocalPackageVersion.js', () => ({
  getLocalPackageVersion: vi.fn(),
}))

vi.mock('node:child_process')
vi.mock('node:fs')

const mockGetLocalPackageVersion = vi.mocked(getLocalPackageVersion)
const mockSpawn = vi.mocked(spawn)
const mockExecSync = vi.mocked(execSync)
const mockExistsSync = vi.mocked(existsSync)

const createSpawnMock = (exitCode = 0) => {
  const killMock = vi.fn()
  const onMock = vi.fn((event, cb) => {
    if (event === 'close') cb(exitCode)
  })
  const childProcess = {
    kill: killMock,
    on: onMock,
  }
  const spawnMock = vi.fn().mockReturnValue(childProcess)
  mockSpawn.mockImplementation(spawnMock)
  return {childProcess, killMock, onMock, spawnMock}
}

const setupBasicMocks = (options = {}) => {
  const defaults = {
    exitCode: 0,
    gitIgnoreExists: false,
    npxOutput: 'npm exec',
    packageVersion: '4.0.0',
  }
  const config = {...defaults, ...options}

  if (config.packageVersion !== null) {
    mockGetLocalPackageVersion.mockResolvedValue(config.packageVersion)
  }
  mockExistsSync.mockReturnValue(config.gitIgnoreExists)
  mockExecSync.mockReturnValue(config.npxOutput)

  return createSpawnMock(config.exitCode)
}

describe('#codemod', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists available codemods when no name provided', async () => {
    const {stdout} = await testCommand(CodemodCommand, [''])

    expect(stdout).toContain('Available code modifications:')
    expect(stdout).toContain('reactIconsV3')
    expect(stdout).toContain('partsTypeDirective')
    expect(stdout).toContain('deskRename')
  })

  test('validates codemod exists', async () => {
    const {error} = await testCommand(CodemodCommand, ['nonexistent'])

    expect(error?.message).toContain('Codemod with name "nonexistent" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles case-insensitive codemod names', async () => {
    const {spawnMock} = setupBasicMocks()

    await testCommand(CodemodCommand, ['REACTICONSV3'])

    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['jscodeshift', '-t', expect.stringContaining('reactIconsV3.js')]),
      expect.any(Object),
    )
  })

  test('runs codemod with dry flag', async () => {
    const {spawnMock} = setupBasicMocks()

    await testCommand(CodemodCommand, ['reactIconsV3', '--dry'])

    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['jscodeshift', '--dry']),
      expect.any(Object),
    )
  })

  test('skips verification when --no-verify flag is used', async () => {
    const {spawnMock} = setupBasicMocks({packageVersion: null})

    await testCommand(CodemodCommand, ['reactIconsV3', '--no-verify'])

    expect(mockGetLocalPackageVersion).not.toHaveBeenCalled()
    expect(spawnMock).toHaveBeenCalled()
  })

  test('uses gitignore when present', async () => {
    const {spawnMock} = setupBasicMocks({gitIgnoreExists: true})

    await testCommand(CodemodCommand, ['partsTypeDirective'])

    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['--ignore-config', '.gitignore']),
      expect.any(Object),
    )
  })

  describe('extension handling', () => {
    test.each([
      {
        description: 'handles custom extensions',
        expected: 'jsx,mjs',
        input: 'jsx,mjs',
      },
      {
        description: 'normalizes extension handling with dots',
        expected: 'tsx,ts',
        input: '.tsx,.ts',
      },
      {
        description: 'handles extensions with spaces and mixed formatting',
        expected: 'jsx,mjs,ts',
        input: ' .jsx , .mjs , ts ',
      },
    ])('$description', async ({expected, input}) => {
      const {spawnMock} = setupBasicMocks({packageVersion: null})

      await testCommand(CodemodCommand, ['partsTypeDirective', '--extensions', input])

      expect(spawnMock).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--extensions', expected]),
        expect.any(Object),
      )
    })
  })

  describe('npx availability', () => {
    test.each([
      {
        description: 'throws error when npx is not available',
        expectedError: 'Failed to run "npx"',
        mockImpl: () => {
          throw new Error('Command not found')
        },
      },
      {
        description: 'throws error when npx help output does not contain npm',
        expectedError:
          'Failed to run "npx" - required to run codemods. Do you have a recent version of npm installed?',
        mockImpl: () => 'some other tool help that does not include',
      },
    ])('$description', async ({expectedError, mockImpl}) => {
      mockExecSync.mockImplementationOnce(mockImpl)

      const {error} = await testCommand(CodemodCommand, ['partsTypeDirective'])

      expect(error?.message).toContain(expectedError)
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('react-icons verification', () => {
    test('runs verification for reactIconsV3 codemod', async () => {
      const {spawnMock} = setupBasicMocks()

      await testCommand(CodemodCommand, ['reactIconsV3'])

      expect(mockGetLocalPackageVersion).toHaveBeenCalledWith('react-icons', process.cwd())
      expect(spawnMock).toHaveBeenCalled()
    })

    test.each([
      {
        description: 'throws error when react-icons is not found',
        expectedError: 'Could not find react-icons declared as dependency in package.json',
        version: undefined,
      },
      {
        description: 'throws error when react-icons version is below 3.0.0',
        expectedError: 'react-icons declared in package.json dependencies is lower than 3.0.0',
        version: '2.8.0',
      },
    ])('$description', async ({expectedError, version}) => {
      mockGetLocalPackageVersion.mockResolvedValue(version ?? null)

      const {error} = await testCommand(CodemodCommand, ['reactIconsV3'])

      expect(error?.message).toContain(expectedError)
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('process management', () => {
    test('handles child process exit with non-zero code', async () => {
      setupBasicMocks({exitCode: 1})

      const {error} = await testCommand(CodemodCommand, ['partsTypeDirective'])

      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles SIGINT signal by killing child process', async () => {
      const {killMock} = setupBasicMocks()

      const originalProcessOn = process.on
      const processOnMock = vi.fn((event, handler) => {
        if (event === 'SIGINT') {
          // Immediately call the handler to simulate SIGINT
          ;(handler as () => void)()
        }
        return originalProcessOn.call(process, event, handler)
      })
      process.on = processOnMock as unknown as typeof process.on

      try {
        const {error} = await testCommand(CodemodCommand, ['partsTypeDirective'])

        expect(killMock).toHaveBeenCalledWith(2)
        expect(error?.oclif?.exit).toBe(0)
      } finally {
        process.on = originalProcessOn
        process.removeAllListeners('SIGINT')
      }
    })
  })
})
