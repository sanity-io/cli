import {describe, expect, test} from 'vitest'

import {formatTokenAccess} from '../formatTokenAccess.js'
import {type Robot} from '../types.js'

const robot: Robot = {
  createdAt: '2026-10-17T00:00:00Z',
  id: 'robot-1',
  label: 'Token',
  memberships: [],
}

describe('formatTokenAccess', () => {
  test('shows organization permissions and each project with its roles', () => {
    expect(
      formatTokenAccess({
        ...robot,
        memberships: [
          {
            resourceId: 'org-1',
            resourceType: 'organization',
            roleNames: [
              'knowledge-base-developer-robot',
              'blueprints-deployer-robot',
              'media-library-viewer-robot',
              'canvas-editor-robot',
              'sdk-app-editor-robot',
              'access-manager-robot',
              'deploy-studio-robot',
            ],
          },
          {resourceId: 'project-1', resourceType: 'project', roleNames: ['editor', 'custom-role']},
          {resourceId: 'project-2', resourceType: 'project', roleNames: ['viewer']},
        ],
      }),
    ).toBe(
      'Context: Developer; Blueprints; Media Library: Viewer; Canvas: Editor; Manage SDK Apps; Manage Access: Editor; Deploy Studios (all projects); project:project-1: editor, custom-role; project:project-2: viewer',
    )
  })

  test('preserves unfamiliar roles and resource types', () => {
    expect(
      formatTokenAccess({
        ...robot,
        memberships: [
          {resourceId: 'org-1', resourceType: 'organization', roleNames: ['future-role']},
          {resourceId: 'resource-1', resourceType: 'other', roleNames: ['reader']},
        ],
      }),
    ).toBe('organization:org-1: future-role; other:resource-1: reader')
  })

  test('handles missing roles', () => {
    expect(formatTokenAccess(robot)).toBe('No roles')
    expect(
      formatTokenAccess({
        ...robot,
        memberships: [
          {resourceId: 'org-1', resourceType: 'organization', roleNames: []},
          {resourceId: 'project-1', resourceType: 'project', roleNames: []},
        ],
      }),
    ).toBe('project:project-1: No roles')
  })
})
