import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test} from 'vitest'

import {ORGANIZATIONS_API_VERSION} from '../../../services/organizations.js'
import {ListOrganizationsCommand} from '../list.js'

describe('#organizations list', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays organizations correctly', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {id: 'org-1', name: 'Acme Corp', slug: 'acme'},
      {id: 'org-2', name: 'Beta Inc', slug: 'beta'},
    ])

    const {error, stdout} = await testCommand(ListOrganizationsCommand)

    if (error) throw error
    expect(stdout).toContain('org-1')
    expect(stdout).toContain('Acme Corp')
    expect(stdout).toContain('acme')
    expect(stdout).toContain('org-2')
    expect(stdout).toContain('Beta Inc')
    expect(stdout).toContain('beta')
  })

  test('sorts by name ascending by default', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {id: 'org-2', name: 'Zebra Ltd', slug: 'zebra'},
      {id: 'org-1', name: 'Acme Corp', slug: 'acme'},
    ])

    const {error, stdout} = await testCommand(ListOrganizationsCommand)

    if (error) throw error
    const lines = stdout.split('\n').filter(Boolean)
    const acmeIndex = lines.findIndex((line) => line.includes('Acme Corp'))
    const zebraIndex = lines.findIndex((line) => line.includes('Zebra Ltd'))

    expect(acmeIndex).toBeGreaterThan(0)
    expect(zebraIndex).toBeGreaterThan(0)
    expect(acmeIndex).toBeLessThan(zebraIndex)
  })

  test('sorts in descending order when --order desc is specified', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {id: 'org-1', name: 'Acme Corp', slug: 'acme'},
      {id: 'org-2', name: 'Zebra Ltd', slug: 'zebra'},
    ])

    const {error, stdout} = await testCommand(ListOrganizationsCommand, ['--order', 'desc'])

    if (error) throw error
    const lines = stdout.split('\n').filter(Boolean)
    const acmeIndex = lines.findIndex((line) => line.includes('Acme Corp'))
    const zebraIndex = lines.findIndex((line) => line.includes('Zebra Ltd'))

    expect(zebraIndex).toBeLessThan(acmeIndex)
  })

  test('sorts by id when --sort id is specified', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [
      {id: 'org-2', name: 'Acme Corp', slug: 'acme'},
      {id: 'org-1', name: 'Zebra Ltd', slug: 'zebra'},
    ])

    const {error, stdout} = await testCommand(ListOrganizationsCommand, ['--sort', 'id'])

    if (error) throw error
    const lines = stdout.split('\n').filter(Boolean)
    const org1Index = lines.findIndex((line) => line.includes('org-1'))
    const org2Index = lines.findIndex((line) => line.includes('org-2'))

    expect(org1Index).toBeLessThan(org2Index)
  })

  test('displays only header when no organizations exist', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [])

    const {error, stdout} = await testCommand(ListOrganizationsCommand)

    if (error) throw error
    const lines = stdout.split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('id')
    expect(lines[0]).toContain('name')
    expect(lines[0]).toContain('slug')
  })

  test('handles organizations with null slug', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(200, [{id: 'org-1', name: 'No Slug Org', slug: null}])

    const {error, stdout} = await testCommand(ListOrganizationsCommand)

    if (error) throw error
    expect(stdout).toContain('org-1')
    expect(stdout).toContain('No Slug Org')
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: ORGANIZATIONS_API_VERSION,
      uri: '/organizations',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(ListOrganizationsCommand)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list organizations')
  })
})
