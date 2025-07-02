import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {confirm} from '@inquirer/prompts'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {StartCommand} from '../start.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '../../../../../../')
const examplesDir = resolve(rootDir, 'examples')

// Mock vite's preview function for integration testing
vi.mock('vite', () => ({
  preview: vi.fn(),
}))

// Mock the inquirer confirm function
vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

// Mock isInteractive
vi.mock('../../util/isInteractive.js', () => ({
  isInteractive: true,
}))

// Mock fs/promises to control file existence
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises')
  return {
    ...actual,
    access: vi.fn().mockImplementation((path) => {
      // Only allow access to .ts files (not .js) to avoid multiple config file errors
      if (typeof path === 'string' && path.endsWith('.js')) {
        return Promise.reject(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))
      }
      return Promise.resolve(undefined)
    }),
    readdir: vi.fn().mockImplementation((path) => {
      // Return different results based on what's being read
      if (path.includes('basic-studio')) {
        return Promise.resolve(['sanity.config.ts', 'sanity.cli.ts', 'package.json'])
      }
      return Promise.resolve([])
    }),
    readFile: vi.fn(),
    stat: vi.fn().mockResolvedValue({isDirectory: () => true}),
  }
})

// Mock findProjectRoot to avoid multiple config file errors
vi.mock('../../config/findProjectRoot.js', async () => {
  const {join, resolve} = await import('node:path')
  const {fileURLToPath} = await import('node:url')
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const rootDir = resolve(__dirname, '../../../../../../')
  const examplesDir = resolve(rootDir, 'examples')
  const cwd = join(examplesDir, 'basic-studio')

  return {
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: cwd,
      root: cwd,
      type: 'studio',
    }),
  }
})

const mockVitePreview = vi.mocked((await import('vite')).preview)
const mockConfirm = vi.mocked(confirm)
const mockReadFile = vi.mocked((await import('node:fs/promises')).readFile)

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called')
})

describe('#start', () => {
  const cwd = join(examplesDir, 'basic-studio')
  const originalCwd = process.cwd

  beforeEach(() => {
    vi.clearAllMocks()
    process.cwd = () => cwd
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

  test('displays warning message and starts preview server successfully', async () => {
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

    const {stdout} = await testCommand(StartCommand, [], {
      config: {root: cwd},
    })

    // Check that warning message is displayed
    expect(stdout).toContain('╭───────────────────────────────────────────────────────────╮')
    expect(stdout).toContain("You're running Sanity Studio v3. In this version the")
    expect(stdout).toContain('[start] command is used to preview static builds.')
    expect(stdout).toContain('To run a development server, use the [npm run dev] or')
    expect(stdout).toContain('[npx sanity dev] command instead. For more information,')
    expect(stdout).toContain('see https://www.sanity.io/help/studio-v2-vs-v3')
    expect(stdout).toContain('╰───────────────────────────────────────────────────────────╯')

    // Check that vite's preview function was called with correct configuration
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

    expect(error?.message).toBe('process.exit called')
    expect(mockExit).toHaveBeenCalledWith(1)
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
    expect(mockVitePreview).toHaveBeenCalled()
  })
})
