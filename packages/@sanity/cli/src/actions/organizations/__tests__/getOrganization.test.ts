import {createMockOutput} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getOrganization} from '../getOrganization.js'

const mockPromptForOrgName = vi.hoisted(() => vi.fn())
const mockCreateOrg = vi.hoisted(() => vi.fn())
const mockListOrgs = vi.hoisted(() => vi.fn())
const mockFindOrgByUserName = vi.hoisted(() => vi.fn())
const mockGetOrgChoices = vi.hoisted(() => vi.fn())
const mockGetOrgsWithGrantInfo = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../../../prompts/promptForOrganizationName.js', () => ({
  promptForOrganizationName: mockPromptForOrgName,
}))
vi.mock('../../../services/organizations.js', () => ({
  createOrganization: mockCreateOrg,
  listOrganizations: mockListOrgs,
}))
vi.mock('../findOrganizationByUserName.js', () => ({
  findOrganizationByUserName: mockFindOrgByUserName,
}))
vi.mock('../getOrganizationChoices.js', () => ({
  getOrganizationChoices: mockGetOrgChoices,
}))
vi.mock('../getOrganizationsWithAttachGrantInfo.js', () => ({
  getOrganizationsWithAttachGrantInfo: mockGetOrgsWithGrantInfo,
}))

const output = createMockOutput()
const user = {
  email: 'test@example.com',
  id: 'user-123',
  name: 'TestUser',
  provider: 'sanity' as const,
}
const org = {id: 'org-1', name: 'Org 1', slug: 'org-1'}
const baseFlags = {isUnattended: true, output, requestedId: undefined, user}
const orgWithGrantInfo = {hasAttachGrant: true, organization: org}

describe('actions/organizations/getOrganization', () => {
  beforeEach(() => {
    mockListOrgs.mockResolvedValue([org])
    mockPromptForOrgName.mockResolvedValue(org.name)
    mockCreateOrg.mockResolvedValue(org)
    mockGetOrgsWithGrantInfo.mockResolvedValue([orgWithGrantInfo])
    mockGetOrgChoices.mockReturnValue([])
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('throws if listing orgs fails', async () => {
    const err = new Error('boom')
    mockListOrgs.mockRejectedValue(err)
    await expect(getOrganization(baseFlags)).rejects.toThrow(err)
  })

  test('throws if requestedId does not match returned listed orgs', async () => {
    await expect(
      getOrganization({isUnattended: true, output, requestedId: 'nope', user}),
    ).rejects.toThrow(`Organization "nope" not found or you don't have access to it`)
  })

  test('prompts to create an org if none returned by list orgs', async () => {
    mockListOrgs.mockResolvedValue([])
    await getOrganization({...baseFlags, isUnattended: false})
    expect(output.log).toHaveBeenCalledWith(
      'You need to create an organization to create projects.',
    )
    expect(mockPromptForOrgName).toHaveBeenCalled()
    expect(mockCreateOrg).toHaveBeenCalled()
    expect(mockGetOrgsWithGrantInfo).not.toHaveBeenCalled()
  })

  describe('unattended mode', () => {
    test('throws an actionable error instead of prompting if no organizations exist', async () => {
      mockListOrgs.mockResolvedValue([])

      await expect(getOrganization(baseFlags)).rejects.toThrow(
        'No organizations are available. Create an organization at https://www.sanity.io/manage, then pass its ID or slug with --organization.',
      )
      expect(mockPromptForOrgName).not.toHaveBeenCalled()
      expect(uxMocks.select).not.toHaveBeenCalled()
    })

    test('returns the only organization with attach access', async () => {
      const result = await getOrganization(baseFlags)
      expect(result).toEqual(org)
    })

    test('requires an explicit organization when multiple organizations have attach access', async () => {
      const otherOrg = {id: 'org-2', name: 'Org 2', slug: 'org-2'}
      mockListOrgs.mockResolvedValue([org, otherOrg])
      mockGetOrgsWithGrantInfo.mockResolvedValue([
        orgWithGrantInfo,
        {hasAttachGrant: true, organization: otherOrg},
      ])

      await expect(getOrganization(baseFlags)).rejects.toThrow(
        'Multiple organizations are available. Select one with --organization <slug|id>.',
      )
      expect(uxMocks.select).not.toHaveBeenCalled()
    })

    test('should return undefined if no attached-grant-info orgs exist', async () => {
      mockGetOrgsWithGrantInfo.mockResolvedValue([])
      const result = await getOrganization(baseFlags)
      expect(result).toBeUndefined()
    })
  })

  describe('interactive mode', () => {
    const attendedFlags = {...baseFlags, isUnattended: false}
    test('should prompt user to select an org and create if "-new-" selected', async () => {
      uxMocks.select.mockResolvedValue('-new-')
      await getOrganization(attendedFlags)
      expect(mockPromptForOrgName).toHaveBeenCalled()
      expect(mockCreateOrg).toHaveBeenCalled()
    })

    test('should prompt user to select an org and return selected org', async () => {
      uxMocks.select.mockResolvedValue(org.id)

      const result = await getOrganization(attendedFlags)

      expect(mockPromptForOrgName).not.toHaveBeenCalled()
      expect(mockCreateOrg).not.toHaveBeenCalled()
      expect(result).toEqual(org)
    })
  })
})
