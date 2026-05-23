import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test} from 'vitest'

import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {List} from '../list.js'

describe('#list', () => {
  afterEach(() => {
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays organizations correctly', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {id: 'org-b', name: 'Beta Org', slug: 'beta'},
      {id: 'org-a', name: 'Alpha Org', slug: 'alpha'},
    ])

    const {stdout} = await testCommand(List)

    expect(stdout).toMatchSnapshot()
  })

  test('outputs JSON when --json is specified', async () => {
    const organizations = [
      {id: 'org-1', name: 'First Org', slug: 'first'},
      {id: 'org-2', name: 'Second Org', slug: 'second'},
    ]

    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, organizations)

    const {stdout} = await testCommand(List, ['--json'])

    const parsed = JSON.parse(stdout)
    expect(parsed).toEqual(organizations)
  })

  test('sorts by name when --sort name is specified', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {id: 'org-1', name: 'Charlie', slug: 'charlie'},
      {id: 'org-2', name: 'Alpha', slug: 'alpha'},
      {id: 'org-3', name: 'Bravo', slug: 'bravo'},
    ])

    const {stdout} = await testCommand(List, ['--sort', 'name'])

    const lines = stdout.split('\n').filter(Boolean)

    const alphaIndex = lines.findIndex((line) => line.includes('Alpha'))
    const bravoIndex = lines.findIndex((line) => line.includes('Bravo'))
    const charlieIndex = lines.findIndex((line) => line.includes('Charlie'))

    expect(alphaIndex).toBeGreaterThan(0)
    expect(bravoIndex).toBeGreaterThan(0)
    expect(charlieIndex).toBeGreaterThan(0)

    expect(alphaIndex).toBeLessThan(bravoIndex)
    expect(bravoIndex).toBeLessThan(charlieIndex)
  })

  test('sorts in descending order when --order desc is specified', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {id: 'org-a', name: 'Alpha', slug: 'alpha'},
      {id: 'org-b', name: 'Bravo', slug: 'bravo'},
      {id: 'org-c', name: 'Charlie', slug: 'charlie'},
    ])

    const {stdout} = await testCommand(List, ['--order', 'desc'])

    const lines = stdout.split('\n').filter(Boolean)

    const orgAIndex = lines.findIndex((line) => line.includes('org-a'))
    const orgBIndex = lines.findIndex((line) => line.includes('org-b'))
    const orgCIndex = lines.findIndex((line) => line.includes('org-c'))

    expect(orgAIndex).toBeGreaterThan(0)
    expect(orgBIndex).toBeGreaterThan(0)
    expect(orgCIndex).toBeGreaterThan(0)

    expect(orgCIndex).toBeLessThan(orgBIndex)
    expect(orgBIndex).toBeLessThan(orgAIndex)
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(List)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list organizations')
    expect(error?.oclif?.exit).toBe(1)
  })
})
