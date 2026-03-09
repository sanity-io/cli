import {describe, expect, test} from 'vitest'

import {type UserGrantsResponse} from '../../types/grants.js'
import {getProjectsWithPermissions} from '../checkProjectPermissions.js'

function makeGrants(
  projects: Record<
    string,
    Record<string, Array<{grants: Array<{name: string; params: Record<string, unknown>}>}>>
  >,
): UserGrantsResponse {
  return {organizations: {}, projects}
}

describe('getProjectsWithPermissions', () => {
  test('returns projects that have all required permissions', () => {
    const grants = makeGrants({
      'project-a': {
        'sanity.project.datasets': [
          {
            grants: [
              {name: 'read', params: {}},
              {name: 'create', params: {}},
            ],
          },
        ],
      },
      'project-b': {
        'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
      },
    })

    const result = getProjectsWithPermissions(grants, [
      {grant: 'read', permission: 'sanity.project.datasets'},
      {grant: 'create', permission: 'sanity.project.datasets'},
    ])

    expect(result).toEqual(new Set(['project-a']))
  })

  test('returns empty set when no projects have required permissions', () => {
    const grants = makeGrants({
      'project-a': {
        'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
      },
    })

    const result = getProjectsWithPermissions(grants, [
      {grant: 'delete', permission: 'sanity.project.datasets'},
    ])

    expect(result).toEqual(new Set())
  })

  test('returns all projects when all have required permissions', () => {
    const grants = makeGrants({
      'project-a': {
        'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
      },
      'project-b': {
        'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
      },
    })

    const result = getProjectsWithPermissions(grants, [
      {grant: 'read', permission: 'sanity.project.datasets'},
    ])

    expect(result).toEqual(new Set(['project-a', 'project-b']))
  })

  test('handles empty projects object', () => {
    const grants = makeGrants({})

    const result = getProjectsWithPermissions(grants, [
      {grant: 'read', permission: 'sanity.project.datasets'},
    ])

    expect(result).toEqual(new Set())
  })

  test('handles missing permission scope in project', () => {
    const grants = makeGrants({
      'project-a': {
        'sanity.project.other': [{grants: [{name: 'read', params: {}}]}],
      },
    })

    const result = getProjectsWithPermissions(grants, [
      {grant: 'read', permission: 'sanity.project.datasets'},
    ])

    expect(result).toEqual(new Set())
  })

  test('checks across multiple grant resources', () => {
    const grants = makeGrants({
      'project-a': {
        'sanity.project.datasets': [
          {grants: [{name: 'read', params: {}}]},
          {grants: [{name: 'create', params: {}}]},
        ],
      },
    })

    const result = getProjectsWithPermissions(grants, [
      {grant: 'read', permission: 'sanity.project.datasets'},
      {grant: 'create', permission: 'sanity.project.datasets'},
    ])

    expect(result).toEqual(new Set(['project-a']))
  })

  test('handles empty required permissions', () => {
    const grants = makeGrants({
      'project-a': {
        'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
      },
    })

    const result = getProjectsWithPermissions(grants, [])

    expect(result).toEqual(new Set(['project-a']))
  })

  test('checks permissions across different scopes', () => {
    const grants = makeGrants({
      'project-a': {
        'sanity.project': [{grants: [{name: 'read', params: {}}]}],
        'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
      },
      'project-b': {
        'sanity.project.datasets': [{grants: [{name: 'read', params: {}}]}],
      },
    })

    const result = getProjectsWithPermissions(grants, [
      {grant: 'read', permission: 'sanity.project.datasets'},
      {grant: 'read', permission: 'sanity.project'},
    ])

    expect(result).toEqual(new Set(['project-a']))
  })
})
