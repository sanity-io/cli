import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {Debug} from '../debug.js'

const mockGatherAuthInfo = vi.hoisted(() => vi.fn())
const mockGatherCliInfo = vi.hoisted(() => vi.fn())
const mockGatherProjectInfo = vi.hoisted(() => vi.fn())
const mockGatherResolvedWorkspaces = vi.hoisted(() => vi.fn())
const mockGatherStudioWorkspaces = vi.hoisted(() => vi.fn())
const mockGatherUserInfo = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('../../actions/debug/gatherDebugInfo.js', () => ({
  gatherAuthInfo: mockGatherAuthInfo,
  gatherCliInfo: mockGatherCliInfo,
  gatherProjectInfo: mockGatherProjectInfo,
  gatherResolvedWorkspaces: mockGatherResolvedWorkspaces,
  gatherStudioWorkspaces: mockGatherStudioWorkspaces,
  gatherUserInfo: mockGatherUserInfo,
}))

const defaultCliConfig = {
  api: {
    projectId: 'project123',
  },
}
const defaultGatheredProjectInfo = {
  cliConfigPath: `${mocks.DefaultProjectRoot.directory}/cli.config.ts`,
  rootPath: mocks.DefaultProjectRoot.directory,
}
const defaultGatheredAuthInfo = {hasToken: true, token: 'sometoken', userType: 'normal'}
const defaultGatheredUserInfo = {
  email: 'test@example.com',
  id: 'user123',
  name: 'Test User',
  provider: 'google',
}
const defaultGatheredCliInfo = {installContext: 'yes', version: '1337'}

describe('#debug', () => {
  beforeEach(() => {
    mocks.SanityCmdGetCliConfig.mockResolvedValue(defaultCliConfig)
    mockGatherProjectInfo.mockImplementation((projectDir) => ({
      ...defaultGatheredProjectInfo,
      rootPath: projectDir,
    }))
    mockGatherAuthInfo.mockResolvedValue(defaultGatheredAuthInfo)
    mockGatherCliInfo.mockResolvedValue(defaultGatheredCliInfo)
    mockGatherResolvedWorkspaces.mockResolvedValue([])
    mockGatherUserInfo.mockResolvedValue(defaultGatheredUserInfo)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe.only('User section', () => {
    test('shows user info when logged in with project context', async () => {
      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('User:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Test User'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('test@example.com'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('user123'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('google'))
    })

    test('shows gatherUserInfo error details', async () => {
      mockGatherUserInfo.mockResolvedValue(new Error('uh oh'))

      await Debug.run([])

      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('User:'))
      // Should show error message but not crash
      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('uh oh'))
    })
  })

  describe.only('Authentication section', () => {
    test('passes includeSecrets=false to gatherAuthInfo by default', async () => {
      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Authentication:'),
      )
      expect(mockGatherAuthInfo).toHaveBeenCalledWith(false)
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('(run with --secrets to reveal token)'),
      )
    })

    test('passes includeSecrets=true to gatherAuthInfo when --secrets provided', async () => {
      await Debug.run(['--secrets'])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Authentication:'),
      )
      expect(mockGatherAuthInfo).toHaveBeenCalledWith(true)
      expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(
        expect.stringContaining('(run with --secrets to reveal token)'),
      )
    })

    test('does not show authentication section when not logged in', async () => {
      mockGatherAuthInfo.mockResolvedValue({hasToken: false})

      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Authentication:'),
      )
    })
  })

  describe.only('CLI section', () => {
    test('shows CLI version and install context', async () => {
      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('CLI:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(defaultGatheredCliInfo.version),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(defaultGatheredCliInfo.installContext),
      )
    })
    test('notes unable to determine CLI version when gatherCliInfo throws', async () => {
      mockGatherCliInfo.mockRejectedValue(new Error('boomsies'))

      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('CLI:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Unable to determine CLI version'),
      )
    })
  })

  describe.only('Project section', () => {
    test('shows "No project found" when outside project directory', async () => {
      mockGatherProjectInfo.mockResolvedValue(null)

      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Project:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('No project found'),
      )
    })

    test('shows project root, cli and studio config paths', async () => {
      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Project:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(defaultGatheredProjectInfo.cliConfigPath),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(defaultGatheredProjectInfo.rootPath),
      )
    })
  })

  describe.only('Studio section', () => {
    const defaultStudioWorkspace = {
      dataset: 'production',
      name: 'default',
      projectId: defaultCliConfig.api.projectId,
    }
    beforeEach(() => {
      mockGatherProjectInfo.mockImplementation((projectDir) => ({
        ...defaultGatheredProjectInfo,
        rootPath: projectDir,
        studioConfigPath: `${mocks.DefaultProjectRoot.directory}/studio.config.ts`,
      }))
      mockGatherStudioWorkspaces.mockResolvedValue([defaultStudioWorkspace])
    })

    test('shows studio workspaces when studio config exists', async () => {
      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()

      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Studio:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Workspaces:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(defaultStudioWorkspace.name),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(defaultStudioWorkspace.projectId),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(defaultStudioWorkspace.dataset),
      )
    })

    test('does not show studio section when no studio config exists', async () => {
      mockGatherProjectInfo.mockImplementation((projectDir) => ({
        ...defaultGatheredProjectInfo,
        rootPath: projectDir,
        // Dropped studio config path
      }))

      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()

      expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(expect.stringContaining('Studio:'))
    })

    test('shows multi-workspace studio config', async () => {
      mockGatherStudioWorkspaces.mockResolvedValue([
        {...defaultStudioWorkspace, name: 'production'},
        {...defaultStudioWorkspace, dataset: 'staging', name: 'staging'},
      ])

      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Studio:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('staging'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('production'))
    })

    test('shows error details but does not error out if loading studio workspaces fails', async () => {
      mockGatherStudioWorkspaces.mockRejectedValue(new Error('yikes'))

      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      // Studio section should appear with the error message
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Studio:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load studio configuration:'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('yikes'))
      // But no workspaces
      expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Workspaces:'),
      )
    })

    test('shows resolved configuration with roles when logged in', async () => {
      mockGatherResolvedWorkspaces.mockResolvedValue([
        {name: defaultStudioWorkspace.name, roles: [{name: 'administrator'}], title: 'My Studio'},
      ])

      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Resolved configuration:'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('default (My Studio)'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('administrator'),
      )
    })

    test('shows fallback message when full resolution fails', async () => {
      mockGatherResolvedWorkspaces.mockRejectedValue(new Error('Plugin resolution failed'))

      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()

      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Workspaces:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('unable to resolve full studio configuration'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Plugin resolution failed'),
      )
    })
  })
})
