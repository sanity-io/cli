import {afterEach, beforeEach, describe, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'
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
    mockSetupMCP.mockResolvedValue({configuredEditors:})
  })
  afterEach(() => {
    vi.clearAllMocks()
  })
  test('ensures authentication and delegates to setupMCP on success', async () => {

  })
})
