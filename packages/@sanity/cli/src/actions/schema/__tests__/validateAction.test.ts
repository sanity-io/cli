import {type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {validateAction} from '../validateAction.js'

const mockReadPackageUp = vi.hoisted(() => vi.fn())

const mockSpinner = vi.hoisted(() => ({
  fail: vi.fn().mockReturnThis(),
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
}))
const mockSpinnerFn = vi.hoisted(() => vi.fn(() => mockSpinner))

const mockWorkerConstructor = vi.hoisted(() => vi.fn())

const mockWriteFileSync = vi.hoisted(() => vi.fn())

vi.mock('read-package-up', () => ({
  readPackageUp: mockReadPackageUp,
}))

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    spinner: mockSpinnerFn,
  }
})

vi.mock('node:worker_threads', () => ({
  Worker: mockWorkerConstructor,
}))

vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
}))

const mockOutput = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as Output

describe('#validateAction', () => {
  let testWorkerResponse: {serializedDebug?: unknown; validation: unknown[]}

  beforeEach(() => {
    vi.clearAllMocks()

    testWorkerResponse = {
      serializedDebug: undefined,
      validation: [],
    }

    const mockWorkerInstance = {
      addListener: vi.fn(),
    }

    mockWorkerConstructor.mockImplementation(() => {
      setImmediate(() => {
        const messageListener = mockWorkerInstance.addListener.mock.calls.find(
          (call) => call[0] === 'message',
        )?.[1]

        if (messageListener) {
          messageListener(testWorkerResponse)
        }
      })

      return mockWorkerInstance
    })
  })

  test('throws error if sanity package does not exist', async () => {
    mockReadPackageUp.mockResolvedValueOnce(undefined)

    const options = {
      output: mockOutput,
      workDir: '/test/project',
      workspace: 'nonexistent',
    }

    await expect(validateAction(options)).rejects.toThrow(
      'Could not find root directory for `sanity` package',
    )
  })

  test('shows validating spinner if format flag pretty', async () => {
    mockReadPackageUp.mockResolvedValueOnce({
      path: '/test/sanity/package.json',
    })

    const options = {
      format: 'pretty',
      output: mockOutput,
      workDir: '/test/project',
    }

    await validateAction(options)

    expect(mockSpinnerFn).toHaveBeenCalledWith('Validating schema…')
    expect(mockSpinner.start).toHaveBeenCalled()
  })

  test('throws serializeDebug error if debug-metafile-path flag is passed worker does not return serializeDebug', async () => {
    mockReadPackageUp.mockResolvedValueOnce({
      path: '/test/sanity/package.json',
    })

    const options = {
      debugMetafilePath: '/test/metafile.json',
      output: mockOutput,
      workDir: '/test/project',
    }

    await expect(validateAction(options)).rejects.toThrow(
      'serializedDebug should always be produced',
    )
  })

  test('writes metafile', async () => {
    mockReadPackageUp.mockResolvedValueOnce({
      path: '/test/sanity/package.json',
    })

    testWorkerResponse = {
      serializedDebug: {
        hoisted: {},
        size: 1000,
        types: {},
      },
      validation: [],
    }

    const options = {
      debugMetafilePath: '/test/metafile.json',
      output: mockOutput,
      workDir: '/test/project',
    }

    await validateAction(options)

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/test/metafile.json',
      expect.any(String),
      'utf8',
    )
  })

  test('does not write to metafile if schema validation fails', async () => {
    mockReadPackageUp.mockResolvedValueOnce({
      path: '/test/sanity/package.json',
    })

    testWorkerResponse = {
      serializedDebug: {
        hoisted: {},
        size: 1000,
        types: {},
      },
      validation: [
        {
          path: [{kind: 'type', name: 'testType', type: 'document'}],
          problems: [
            {
              helpId: 'test-error',
              message: 'Test error message',
              severity: 'error',
            },
          ],
        },
      ],
    }

    const options = {
      debugMetafilePath: '/test/metafile.json',
      output: mockOutput,
      workDir: '/test/project',
    }

    await validateAction(options)

    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  test('shows default output with manifest success message', async () => {
    mockReadPackageUp.mockResolvedValueOnce({
      path: '/test/sanity/package.json',
    })

    testWorkerResponse = {
      serializedDebug: {
        hoisted: {},
        size: 1000,
        types: {},
      },
      validation: [],
    }

    const options = {
      debugMetafilePath: '/test/metafile.json',
      format: 'pretty',
      output: mockOutput,
      workDir: '/test/project',
    }

    await validateAction(options)

    expect(mockSpinner.succeed).toHaveBeenCalledWith('Validated schema')
    expect(mockOutput.log).toHaveBeenCalledWith('\nValidation results:')
    expect(mockOutput.log).toHaveBeenCalledWith(expect.stringContaining('Errors:   0 errors'))
    expect(mockOutput.log).toHaveBeenCalledWith(expect.stringContaining('Warnings: 0 warnings'))
    expect(mockOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Metafile written to: /test/metafile.json'),
    )
    expect(mockOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('This can be analyzed at https://esbuild.github.io/analyze/'),
    )
    expect(process.exitCode).toBe(0)
  })

  test('shows default output with manifest failure message', async () => {
    mockReadPackageUp.mockResolvedValueOnce({
      path: '/test/sanity/package.json',
    })

    testWorkerResponse = {
      serializedDebug: {
        hoisted: {},
        size: 1000,
        types: {},
      },
      validation: [
        {
          path: [{kind: 'type', name: 'testType', type: 'document'}],
          problems: [
            {
              helpId: 'test-error',
              message: 'Test error message',
              severity: 'error',
            },
          ],
        },
      ],
    }

    const options = {
      debugMetafilePath: '/test/metafile.json',
      output: mockOutput,
      workDir: '/test/project',
    }

    await validateAction(options)
    expect(mockOutput.log).toHaveBeenCalledWith('\nValidation results:')
    expect(mockOutput.log).toHaveBeenCalledWith(expect.stringContaining('Errors:   1 error'))
    expect(mockOutput.log).toHaveBeenCalledWith(expect.stringContaining('Warnings: 0 warnings'))
    expect(mockOutput.log).toHaveBeenCalledWith(expect.stringContaining('Test error message'))
    expect(mockOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Metafile not written due to validation errors'),
    )
    expect(process.exitCode).toBe(1)
  })

  test('shows json output', async () => {
    mockReadPackageUp.mockResolvedValueOnce({
      path: '/test/sanity/package.json',
    })

    testWorkerResponse = {
      serializedDebug: undefined,
      validation: [
        {
          path: [{kind: 'type', name: 'testType', type: 'document'}],
          problems: [
            {
              helpId: 'test-error',
              message: 'Test error message',
              severity: 'error',
            },
          ],
        },
      ],
    }

    const options = {
      format: 'json',
      output: mockOutput,
      workDir: '/test/project',
    }

    await validateAction(options)

    expect(mockOutput.log).toHaveBeenCalledWith(JSON.stringify(testWorkerResponse.validation))
  })

  test('shows ndjson output', async () => {
    mockReadPackageUp.mockResolvedValueOnce({
      path: '/test/sanity/package.json',
    })

    testWorkerResponse = {
      serializedDebug: undefined,
      validation: [
        {
          path: [{kind: 'type', name: 'testType', type: 'document'}],
          problems: [
            {
              helpId: 'test-error',
              message: 'Test error message',
              severity: 'error',
            },
          ],
        },
      ],
    }

    const options = {
      format: 'ndjson',
      output: mockOutput,
      workDir: '/test/project',
    }

    await validateAction(options)

    expect(mockOutput.log).toHaveBeenCalledWith(JSON.stringify(testWorkerResponse.validation[0]))
  })
})
