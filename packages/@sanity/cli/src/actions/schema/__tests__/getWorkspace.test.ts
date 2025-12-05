import {describe, expect, test} from 'vitest'

import {getWorkspace} from '../getWorkspace'

const mockWorkspaces = [
  {
    basePath: '/',
    dataset: 'production',
    name: 'test',
    projectId: 'test-project',
  },
  {
    basePath: '/',
    dataset: 'staging',
    name: 'test-staging',
    projectId: 'test-project',
  },
]

describe('getWorkspace', () => {
  test('returns a default workspace if only one exists', () => {
    const workspace = getWorkspace(mockWorkspaces.slice(0, 1))
    expect(workspace).toMatchObject(mockWorkspaces[0])
  })

  test('returns a workspace by name if multiple exist', () => {
    const workspace = getWorkspace(mockWorkspaces, 'test-staging')
    expect(workspace).toMatchObject(mockWorkspaces[1])
  })

  test('throws an error if no workspaces exist', () => {
    expect(() => getWorkspace([])).toThrowError('No workspaces found')
  })

  test('throws an error if multiple workspaces exist but no name is specified', () => {
    expect(() => getWorkspace(mockWorkspaces)).toThrowError(
      `Multiple workspaces found. Please specify which workspace to use with "--workspace". Available workspaces: test, test-staging`,
    )
  })

  test('throws an error if workspace with specified name does not exist', () => {
    expect(() => getWorkspace(mockWorkspaces, 'test-dev')).toThrowError(
      `Could not find "test-dev" workspace. Available workspaces: test, test-staging`,
    )
  })
})
