import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init.js'

const mockInitAction = vi.hoisted(() => vi.fn())
const mockIsInteractive = vi.hoisted(() => vi.fn().mockReturnValue(true))

vi.mock('../../../actions/init/initAction.js', () => ({
  initAction: mockInitAction,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    isInteractive: mockIsInteractive,
  }
})

describe('InitCommand.run() mcpMode computation', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockIsInteractive.mockReturnValue(true)
  })

  test('sets mcpMode to "prompt" by default (interactive, no --yes)', async () => {
    mockInitAction.mockResolvedValue(undefined)

    const {error} = await testCommand(InitCommand, [], {
      mocks: {isInteractive: true, token: 'test-token'},
    })

    if (error) throw error
    expect(mockInitAction).toHaveBeenCalledWith(
      expect.objectContaining({mcpMode: 'prompt'}),
      expect.any(Object),
    )
  })

  test('sets mcpMode to "auto" when --yes is passed in interactive env', async () => {
    mockInitAction.mockResolvedValue(undefined)

    const {error} = await testCommand(InitCommand, ['--yes'], {
      mocks: {isInteractive: true, token: 'test-token'},
    })

    if (error) throw error
    expect(mockInitAction).toHaveBeenCalledWith(
      expect.objectContaining({mcpMode: 'auto'}),
      expect.any(Object),
    )
  })

  test('sets mcpMode to "skip" when --no-mcp is passed', async () => {
    mockInitAction.mockResolvedValue(undefined)

    const {error} = await testCommand(InitCommand, ['--no-mcp'], {
      mocks: {isInteractive: true, token: 'test-token'},
    })

    if (error) throw error
    expect(mockInitAction).toHaveBeenCalledWith(
      expect.objectContaining({mcpMode: 'skip'}),
      expect.any(Object),
    )
  })

  test('sets mcpMode to "skip" when not interactive (CI)', async () => {
    mockIsInteractive.mockReturnValue(false)
    mockInitAction.mockResolvedValue(undefined)

    const {error} = await testCommand(InitCommand, [], {
      mocks: {isInteractive: false, token: 'test-token'},
    })

    if (error) throw error
    expect(mockInitAction).toHaveBeenCalledWith(
      expect.objectContaining({mcpMode: 'skip'}),
      expect.any(Object),
    )
  })
})

describe('InitCommand.run() error handling', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockIsInteractive.mockReturnValue(true)
  })

  test('translates InitError to oclif error', async () => {
    const {InitError} = await import('../../../actions/init/initError.js')
    mockInitAction.mockRejectedValue(new InitError('something broke', 1))

    const {error} = await testCommand(InitCommand, [], {
      mocks: {isInteractive: true, token: 'test-token'},
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.oclif?.exit).toBe(1)
    expect(error?.message).toContain('something broke')
  })

  test('re-throws non-InitError errors', async () => {
    mockInitAction.mockRejectedValue(new TypeError('unexpected'))

    const {error} = await testCommand(InitCommand, [], {
      mocks: {isInteractive: true, token: 'test-token'},
    })

    expect(error).toBeInstanceOf(TypeError)
    expect(error?.message).toBe('unexpected')
  })
})
