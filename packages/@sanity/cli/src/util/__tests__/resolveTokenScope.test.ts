import {afterEach, describe, expect, test, vi} from 'vitest'

import {promptForProject} from '../../prompts/promptForProject.js'
import {resolveTokenScope} from '../resolveTokenScope.js'

vi.mock(import('../../prompts/promptForProject.js'), () => ({promptForProject: vi.fn()}))

afterEach(() => vi.clearAllMocks())

describe('resolveTokenScope', () => {
  test('uses an explicit organization without resolving a project', async () => {
    const getProjectId = vi.fn()
    expect(await resolveTokenScope({getProjectId, grant: 'read', organization: 'org-1'})).toEqual({
      resourceId: 'org-1',
      resourceType: 'organization',
    })
    expect(getProjectId).not.toHaveBeenCalled()
    expect(promptForProject).not.toHaveBeenCalled()
  })

  test.each(['read', 'delete'] as const)(
    'prompts for a project with the %s permission',
    async (grant) => {
      vi.mocked(promptForProject).mockResolvedValue('project-1')
      const getProjectId = vi.fn(async (options) => options.fallback())
      expect(await resolveTokenScope({getProjectId, grant})).toEqual({
        resourceId: 'project-1',
        resourceType: 'project',
      })
      expect(promptForProject).toHaveBeenCalledWith({
        requiredPermissions: [{grant, permission: 'sanity.project.tokens'}],
      })
    },
  )
})
