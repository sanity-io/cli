import {NonInteractiveError, ProjectRootNotFoundError} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ListDatasetCommand} from '../list.js'

const mockPromptForProject = vi.hoisted(() => vi.fn())

vi.mock('../../../prompts/promptForProject.js', () => ({
  promptForProject: mockPromptForProject,
}))

const mockListDatasets = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        list: mockListDatasets,
      } as never,
      request: vi.fn().mockResolvedValue([]),
    }),
  }
})

const noProjectMocks = {
  cliConfig: {api: {projectId: undefined}},
  isInteractive: true,
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('getProjectId fallback', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('calls fallback prompt when no project ID is found in interactive mode', async () => {
    mockPromptForProject.mockResolvedValue('selected-project')
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    const {error, stdout} = await testCommand(ListDatasetCommand, [], {
      mocks: noProjectMocks,
    })

    expect(mockPromptForProject).toHaveBeenCalledWith({
      requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
    })
    expect(error).toBeUndefined()
    expect(stdout).toContain('production')
  })

  test('falls through to ProjectRootNotFoundError when prompt throws NonInteractiveError', async () => {
    mockPromptForProject.mockRejectedValue(new NonInteractiveError('select'))

    const {error} = await testCommand(ListDatasetCommand, [], {
      mocks: {
        ...noProjectMocks,
        isInteractive: false,
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
  })

  test('propagates non-NonInteractiveError from fallback', async () => {
    mockPromptForProject.mockRejectedValue(new Error('Network failure'))

    const {error} = await testCommand(ListDatasetCommand, [], {
      mocks: noProjectMocks,
    })

    expect(error?.message).toContain('Network failure')
  })

  test('does not call fallback when project ID is found from config', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    const {error} = await testCommand(ListDatasetCommand, [], {
      mocks: {
        ...noProjectMocks,
        cliConfig: {api: {projectId: 'config-project'}},
      },
    })

    expect(error).toBeUndefined()
    expect(mockPromptForProject).not.toHaveBeenCalled()
  })

  test('does not call fallback when --project-id flag is provided', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    const {error} = await testCommand(ListDatasetCommand, ['--project-id', 'flag-project'], {
      mocks: noProjectMocks,
    })

    expect(error).toBeUndefined()
    expect(mockPromptForProject).not.toHaveBeenCalled()
  })

  test('calls fallback when no project root is found (outside project directory)', async () => {
    mockPromptForProject.mockResolvedValue('selected-project')
    mockListDatasets.mockResolvedValue([{name: 'production'} as never])

    const {error, stdout} = await testCommand(ListDatasetCommand, [], {
      mocks: {
        cliConfigError: new ProjectRootNotFoundError('No project root found'),
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(mockPromptForProject).toHaveBeenCalledWith({
      requiredPermissions: [{grant: 'read', permission: 'sanity.project.datasets'}],
    })
    expect(error).toBeUndefined()
    expect(stdout).toContain('production')
  })

  test('throws ProjectRootNotFoundError when no project root and fallback throws NonInteractiveError', async () => {
    mockPromptForProject.mockRejectedValue(new NonInteractiveError('select'))

    const {error} = await testCommand(ListDatasetCommand, [], {
      mocks: {
        cliConfigError: new ProjectRootNotFoundError('No project root found'),
        isInteractive: false,
        token: 'test-token',
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
  })
})
