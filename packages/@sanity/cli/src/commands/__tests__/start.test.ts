import {access, readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {confirm} from '@inquirer/prompts'
import {findProjectRoot} from '@sanity/cli-core'
import {preview} from 'vite'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {StartCommand} from '../start.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '../../../../../../')
const examplesDir = resolve(rootDir, 'examples')

vi.mock('vite', () => ({
  preview: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

vi.mock('../../../../cli-core/src/util/isInteractive.js', () => ({
  isInteractive: true,
}))

vi.mock('node:fs/promises', () => {
  const mockAccess = vi.fn()
  const mockReaddir = vi.fn()
  const mockReadFile = vi.fn()
  const mockStat = vi.fn()

  return {
    access: mockAccess,
    default: {
      access: mockAccess,
      readdir: mockReaddir,
      readFile: mockReadFile,
      stat: mockStat,
    },
    readdir: mockReaddir,
    readFile: mockReadFile,
    stat: mockStat,
  }
})

vi.mock('../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn(),
}))

const mockVitePreview = vi.mocked(preview)
const mockConfirm = vi.mocked(confirm)
const mockFindProjectRoot = vi.mocked(findProjectRoot)
const mockAccess = vi.mocked(access)
const mockReadFile = vi.mocked(readFile)

describe('#start', () => {
  const cwd = join(examplesDir, 'basic-studio')
  const originalCwd = process.cwd

  beforeEach(() => {
    vi.clearAllMocks()
    process.cwd = () => cwd

    // Set up default mock implementations
    mockAccess.mockImplementation((path) => {
      // Only allow access to .ts files (not .js) to avoid multiple config file errors
      const pathStr = typeof path === 'string' ? path : path.toString()
      if (pathStr.endsWith('.js')) {
        return Promise.reject(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))
      }
      return Promise.resolve(undefined)
    })

    mockFindProjectRoot.mockResolvedValue({
      directory: cwd,
      path: cwd,
      type: 'studio',
    })
  })

  afterEach(() => {
    process.cwd = originalCwd
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(StartCommand, ['--invalid'], {
      config: {root: cwd},
    })

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test('starts preview server with custom output directory that exists', async () => {
    mockVitePreview.mockResolvedValue({
      config: {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
        },
      },
      httpServer: {
        close: vi.fn((callback) => callback && callback()),
      },
      resolvedUrls: {
        local: ['http://localhost:3333'],
        network: ['http://192.168.1.1:3333'],
      },
    } as never)
    mockReadFile.mockResolvedValue('<html><script src="/static/sanity-abc123.js"></script></html>')
    await testCommand(StartCommand, ['dist'], {
      config: {root: cwd},
    })

    expect(mockVitePreview).toHaveBeenCalledWith({
      base: '/',
      build: {
        outDir: expect.stringContaining('dist'),
      },
      configFile: false,
      mode: 'production',
      plugins: expect.any(Array),
      preview: {
        host: 'localhost',
        port: 3333,
        strictPort: true,
      },
      root: expect.any(String),
    })
  })

  test('starts preview server with custom host and port flags', async () => {
    mockVitePreview.mockResolvedValue({
      config: {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
        },
      },
      httpServer: {
        close: vi.fn((callback) => callback && callback()),
      },
      resolvedUrls: {
        local: ['http://localhost:3333'],
        network: ['http://192.168.1.1:3333'],
      },
    } as never)
    mockReadFile.mockResolvedValue('<html><script src="/static/sanity-abc123.js"></script></html>')
    await testCommand(StartCommand, ['--host', '0.0.0.0', '--port', '8080'], {
      config: {root: cwd},
    })

    expect(mockVitePreview).toHaveBeenCalledWith({
      base: '/',
      build: {
        outDir: expect.stringContaining('dist'),
      },
      configFile: false,
      mode: 'production',
      plugins: expect.any(Array),
      preview: {
        host: '0.0.0.0',
        port: 8080,
        strictPort: true,
      },
      root: expect.any(String),
    })
  })

  test('starts preview server with custom output directory', async () => {
    // Mock readFile to throw ENOENT error for missing index.html
    mockReadFile.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))

    const {stdout} = await testCommand(StartCommand, ['non-existent-build-directory'], {
      config: {root: cwd},
    })

    // For a custom directory that doesn't exist, expect BUILD_NOT_FOUND behavior
    expect(stdout).toContain('Could not find a production build')
  })

  test('handles BUILD_NOT_FOUND error when no index.html exists', async () => {
    // Mock readFile to throw ENOENT error for missing index.html
    mockReadFile.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))
    mockConfirm.mockResolvedValue(true)

    const {stdout} = await testCommand(StartCommand, ['non-existent-build-directory'], {
      config: {root: cwd},
    })

    expect(stdout).toContain('Could not find a production build')
    expect(stdout).toContain('Starting development server...')
    expect(mockConfirm).toHaveBeenCalledWith({
      message: 'Do you want to start a development server instead?',
    })
  })

  test('handles BUILD_NOT_FOUND error and user declines dev server', async () => {
    // Mock readFile to throw ENOENT error for missing index.html
    mockReadFile.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))
    mockConfirm.mockResolvedValue(false)

    const {error} = await testCommand(StartCommand, ['non-existent-build-directory'], {
      config: {root: cwd},
    })

    expect(error?.message).toBe('Failed to start preview server')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockConfirm).toHaveBeenCalledWith({
      message: 'Do you want to start a development server instead?',
    })
  })

  test('handles vite preview server startup errors', async () => {
    const serverError = new Error('EADDRINUSE: Port already in use') as Error & {code: string}
    serverError.code = 'EADDRINUSE'
    mockVitePreview.mockRejectedValue(serverError)
    mockReadFile.mockResolvedValue('<html><script src="/static/sanity-abc123.js"></script></html>')

    const {error} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    expect(error?.message).toContain('Port number is already in use')
    expect(mockVitePreview).toHaveBeenCalled()
  })

  test('handles generic vite preview server errors', async () => {
    // Test that generic errors from vite preview are properly propagated
    // (as opposed to BUILD_NOT_FOUND errors which are handled specially)
    mockReadFile.mockResolvedValue('<html><script src="/static/sanity-abc123.js"></script></html>')

    const genericError = new Error('Generic server error')
    mockVitePreview.mockRejectedValue(genericError)

    const {error} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    // Generic errors should be re-thrown by the command
    expect(error?.message).toBe('Generic server error')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockVitePreview).toHaveBeenCalled()
  })
})
