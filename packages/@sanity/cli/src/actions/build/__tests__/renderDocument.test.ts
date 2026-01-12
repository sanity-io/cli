import {afterAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {renderDocument} from '../renderDocument.js'

const {MockWorker, mockWorkerConstructor, setMockWorkerImplementation} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockWorkerImplementation: any = null
  const mockWorkerConstructor = vi.fn()

  class MockWorker {
    constructor(...args: unknown[]) {
      // Track constructor calls
      mockWorkerConstructor(...args)

      if (mockWorkerImplementation) {
        return mockWorkerImplementation(...args)
      }
      return {
        addListener: vi.fn(),
        terminate: vi.fn(),
      }
    }
  }

  return {
    MockWorker,
    mockWorkerConstructor,
    setMockWorkerImplementation: (impl: unknown) => {
      mockWorkerImplementation = impl
    },
  }
})

const mockBuildDebug = vi.hoisted(() => vi.fn())

// Mock the Worker constructor from node:worker_threads
vi.mock('node:worker_threads', () => ({
  Worker: MockWorker,
}))

vi.mock('../buildDebug.js', () => ({
  buildDebug: mockBuildDebug,
}))

vi.mock('@sanity/cli-core/ux', () => ({
  chalk: {
    yellow: vi.fn((str) => `[YELLOW]${str}[/YELLOW]`),
  },
}))

// Mock console.warn
const originalConsoleWarn = console.warn
const mockConsoleWarn = vi.fn()

describe('renderDocument', () => {
  let testResponse: {html?: string; message?: string | string[]; type: string; warnKey?: string}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockWorkerInstance: any

  beforeEach(() => {
    vi.clearAllMocks()
    console.warn = mockConsoleWarn
    // Default to a successful response
    testResponse = {html: '<html></html>', type: 'result'}

    // Create a mock worker instance
    mockWorkerInstance = {
      addListener: vi.fn(),
      terminate: vi.fn(),
    }

    // Setup the Worker constructor mock implementation
    setMockWorkerImplementation(() => {
      // Simulate async worker behavior
      setImmediate(() => {
        // Find the message listener and call it with the test response
        const messageListener = mockWorkerInstance.addListener.mock.calls.find(
          (call: unknown[]) => call[0] === 'message',
        )?.[1]

        if (messageListener) {
          messageListener(testResponse)
        }
      })

      return mockWorkerInstance
    })
  })

  afterAll(() => {
    console.warn = originalConsoleWarn
  })

  test('should successfully render document with result message', async () => {
    const mockHtml = '<html><body>Test Document</body></html>'

    // Set the expected response for this test
    testResponse = {
      html: mockHtml,
      type: 'result',
    }

    const options = {
      importMap: {imports: {react: 'https://esm.sh/react'}},
      isApp: false,
      props: {basePath: '/studio'},
      studioRootPath: '/test/studio',
    }

    const result = await renderDocument(options)

    expect(result).toBe(mockHtml)
    expect(mockWorkerConstructor).toHaveBeenCalledOnce()
    expect(mockBuildDebug).toHaveBeenCalledWith('Starting worker thread for %s', expect.any(String))
    expect(mockBuildDebug).toHaveBeenCalledWith('Document HTML rendered, %d bytes', mockHtml.length)
  })

  test('should handle warning message with single string', async () => {
    testResponse = {
      message: 'This is a warning message',
      type: 'warning',
      warnKey: 'test-warning',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    const result = await renderDocument(options)

    expect(result).toBe('')
    expect(mockConsoleWarn).toHaveBeenCalledWith(
      '[YELLOW][warn][/YELLOW] This is a warning message',
    )
  })

  test('should handle warning message with array of strings', async () => {
    const warnings = ['Warning 1', 'Warning 2', 'Warning 3']
    testResponse = {
      message: warnings,
      type: 'warning',
      warnKey: 'multi-warning',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    const result = await renderDocument(options)

    expect(result).toBe('')
    expect(mockConsoleWarn).toHaveBeenCalledTimes(3)
    for (const warning of warnings) {
      expect(mockConsoleWarn).toHaveBeenCalledWith(`[YELLOW][warn][/YELLOW] ${warning}`)
    }
  })

  test('should handle warning message without warnKey', async () => {
    testResponse = {
      message: 'Warning without key',
      type: 'warning',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    const result = await renderDocument(options)

    expect(result).toBe('')
    expect(mockConsoleWarn).toHaveBeenCalledWith('[YELLOW][warn][/YELLOW] Warning without key')
  })

  test('should throw error for error message type with string', async () => {
    const errorMessage = 'Something went wrong'
    testResponse = {
      message: errorMessage,
      type: 'error',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    await expect(renderDocument(options)).rejects.toThrow(errorMessage)
    expect(mockBuildDebug).toHaveBeenCalledWith('Error from worker: %s', errorMessage)
  })

  test('should throw error for error message type with array', async () => {
    const errorMessages = ['Error 1', 'Error 2']
    const joinedError = errorMessages.join('\n')
    testResponse = {
      message: errorMessages,
      type: 'error',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    await expect(renderDocument(options)).rejects.toThrow(joinedError)
    expect(mockBuildDebug).toHaveBeenCalledWith('Worker errored: %s', joinedError)
  })

  test('should throw error for error message type without message', async () => {
    testResponse = {
      type: 'error',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    await expect(renderDocument(options)).rejects.toThrow(
      'Document rendering worker stopped with an unknown error',
    )
    expect(mockBuildDebug).toHaveBeenCalledWith('Error from worker: %s', 'Unknown error')
  })

  test('should throw error for result type without html', async () => {
    testResponse = {
      type: 'result',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    await expect(renderDocument(options)).rejects.toThrow(
      'Document rendering worker stopped with an unknown error',
    )
  })

  test('should throw error for unknown message type', async () => {
    testResponse = {
      type: 'unknown',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    await expect(renderDocument(options)).rejects.toThrow('Unknown message type')
  })

  test('should handle worker task rejection', async () => {
    const workerError = new Error('Worker failed to start')

    // Mock worker to trigger error event
    const errorMockWorkerInstance = {
      addListener: vi.fn((event, callback) => {
        if (event === 'error') {
          setImmediate(() => callback(workerError))
        }
      }),
      terminate: vi.fn(),
    }

    // Override the mock implementation for this test only
    setMockWorkerImplementation(() => errorMockWorkerInstance)

    const options = {
      studioRootPath: '/test/studio',
    }

    await expect(renderDocument(options)).rejects.toThrow(
      'Failed to load file through worker: Worker failed to start',
    )
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Worker errored: %s',
      'Failed to load file through worker: Worker failed to start',
    )
  })

  test('should use correct worker URL', async () => {
    testResponse = {
      html: '<html></html>',
      type: 'result',
    }

    const options = {
      studioRootPath: '/test/studio',
    }

    await renderDocument(options)

    const [workerUrl] = mockWorkerConstructor.mock.calls[0]
    expect(workerUrl).toBeInstanceOf(URL)
    expect(workerUrl.href).toMatch(/tsxWorkerLoader\.worker\.js$/)
  })

  test('should handle minimal options', async () => {
    testResponse = {
      html: '<html><body>Minimal</body></html>',
      type: 'result',
    }

    const options = {
      studioRootPath: '/minimal/studio',
    }

    const result = await renderDocument(options)

    expect(result).toBe('<html><body>Minimal</body></html>')
    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        name: 'renderDocument',
        workerData: {
          shouldWarn: true,
          studioRootPath: '/minimal/studio',
        },
      }),
    )
  })

  test('should include all optional properties in worker data when provided', async () => {
    testResponse = {
      html: '<html></html>',
      type: 'result',
    }

    const options = {
      importMap: {
        imports: {
          react: 'https://esm.sh/react@18',
          'react-dom': 'https://esm.sh/react-dom@18',
        },
      },
      isApp: false,
      props: {
        basePath: '/studio',
        css: ['main.css', 'theme.css'],
        entryPath: './custom-entry.js',
      },
      studioRootPath: '/test/studio',
    }

    await renderDocument(options)

    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        name: 'renderDocument',
        workerData: {
          importMap: {
            imports: {
              react: 'https://esm.sh/react@18',
              'react-dom': 'https://esm.sh/react-dom@18',
            },
          },
          isApp: false,
          props: {
            basePath: '/studio',
            css: ['main.css', 'theme.css'],
            entryPath: './custom-entry.js',
          },
          shouldWarn: true,
          studioRootPath: '/test/studio',
        },
      }),
    )
  })
})
