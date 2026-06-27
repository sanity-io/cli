import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'
import {LoginError} from '../../../errors/LoginError.js'
// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks} = createMockSanityCommand()
// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    SanityCommand: MockedSanityCommand,
  }
})

// Third: mock mcp configure command imports
const mockEnsureAuthenticated = vi.hoisted(() => vi.fn())
const mockSetupMCP = vi.hoisted(() => vi.fn())

vi.mock('../../../actions/auth/ensureAuthenticated.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../prompts/promptForDataset.js')>()
  return {
    ...actual,
    ensureAuthenticated: mockEnsureAuthenticated,
  }
})

vi.mock('../../../actions/mcp/setupMCP.js', () => ({
  setupMCP: mockSetupMCP,
}))

// Finally, import the module under test: mcp configure command
const {ConfigureMcpCommand} = await import('../configure.js')

describe('#mcp:configure', () => {
  beforeEach(() => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockEnsureAuthenticated.mockResolvedValue({})
    mockSetupMCP.mockResolvedValue({configuredEditors: {}, detectedEditors: {}})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('ensures authentication and delegates to setupMCP on success', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(true)
    await ConfigureMcpCommand.run()
    expect(mockEnsureAuthenticated).toHaveBeenCalled()
    expect(mockSetupMCP).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'auto',
      }),
    )
  })

  test('calls setupMCP with prompt mode if is an interactive session', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    await ConfigureMcpCommand.run()
    expect(mockSetupMCP).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'prompt',
      }),
    )
  })

  test('errors out with auth cred message if ensureAuthenticated throws LoginError', async () => {
    mockEnsureAuthenticated.mockRejectedValue(new LoginError('boom'))
    await ConfigureMcpCommand.run()
    expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
      expect.stringContaining('credentials: boom'),
      {exit: 1},
    )
  })

  test('errors out with generic auth message if ensureAuthenticated throws', async () => {
    mockEnsureAuthenticated.mockRejectedValue(new Error('boom'))
    await ConfigureMcpCommand.run()
    expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
      expect.stringContaining('check authentication: boom'),
      {exit: 1},
    )
  })

  test('errors out with generic auth message if setupMCP throws', async () => {
    mockSetupMCP.mockRejectedValue(new Error('boom'))
    await ConfigureMcpCommand.run()
    expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(expect.stringContaining('boom'), {
      exit: 1,
    })
  })
})
