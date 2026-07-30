import {getUserConfig} from '@sanity/cli-core/config'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type MintedProject} from '../../services/mintProject.js'
import {
  readUnclaimedProjects,
  recordUnclaimedProject,
  UNCLAIMED_PROJECTS_CONFIG_KEY,
} from '../unclaimedProjects.js'

const mockGet = vi.fn()
const mockSet = vi.fn()

vi.mock('@sanity/cli-core/config', () => ({
  getUserConfig: vi.fn(() => ({
    delete: vi.fn(),
    get: mockGet,
    set: mockSet,
  })),
}))

const minted: MintedProject = {
  apiHost: 'https://abc123.api.sanity.io',
  claimApiUrl: 'https://api.sanity.io/v1/provision/claim',
  claimToken: 'claim-token',
  claimUrl: 'https://www.sanity.io/claim/claim-token',
  datasetName: 'production',
  expiresAt: '2026-08-01T00:00:00.000Z',
  resourceId: 'abc123',
  token: 'sk-robot-token',
}

beforeEach(() => {
  mockGet.mockReturnValue({})
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('recordUnclaimedProject', () => {
  test('writes the mint response under its project ID', () => {
    expect(recordUnclaimedProject(minted, '2026-07-29T12:00:00.000Z')).toBe(true)

    expect(mockGet).toHaveBeenCalledWith(UNCLAIMED_PROJECTS_CONFIG_KEY)
    expect(mockSet).toHaveBeenCalledWith(UNCLAIMED_PROJECTS_CONFIG_KEY, {
      abc123: {
        claimToken: minted.claimToken,
        claimUrl: minted.claimUrl,
        dataset: minted.datasetName,
        expiresAt: minted.expiresAt,
        mintedAt: '2026-07-29T12:00:00.000Z',
        projectId: minted.resourceId,
        token: minted.token,
      },
    })
  })

  test('preserves other project records', () => {
    const existing = {
      previous: {
        claimToken: 'old-claim-token',
        claimUrl: 'https://www.sanity.io/claim/old-claim-token',
        expiresAt: '2026-07-30T00:00:00.000Z',
        mintedAt: '2026-07-27T00:00:00.000Z',
        projectId: 'previous',
        token: 'sk-old-token',
      },
    }
    mockGet.mockReturnValue(existing)

    recordUnclaimedProject(minted, '2026-07-29T12:00:00.000Z')

    expect(mockSet).toHaveBeenCalledWith(
      UNCLAIMED_PROJECTS_CONFIG_KEY,
      expect.objectContaining({previous: existing.previous}),
    )
  })

  test('replaces a record for the same project ID', () => {
    mockGet.mockReturnValue({
      abc123: {
        projectId: 'abc123',
        token: 'sk-old-token',
      },
    })

    recordUnclaimedProject(minted, '2026-07-29T12:00:00.000Z')

    expect(mockSet).toHaveBeenCalledWith(
      UNCLAIMED_PROJECTS_CONFIG_KEY,
      expect.objectContaining({
        abc123: expect.objectContaining({token: minted.token}),
      }),
    )
  })

  test.each([undefined, null, [], 'invalid'])(
    'starts a new registry when the stored value is %j',
    (stored) => {
      mockGet.mockReturnValue(stored)

      recordUnclaimedProject(minted, '2026-07-29T12:00:00.000Z')

      expect(mockSet).toHaveBeenCalledWith(
        UNCLAIMED_PROJECTS_CONFIG_KEY,
        expect.objectContaining({abc123: expect.any(Object)}),
      )
    },
  )

  test('returns false without exposing the record when the config write fails', () => {
    vi.mocked(getUserConfig).mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    expect(recordUnclaimedProject(minted)).toBe(false)
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('handles non-Error config failures', () => {
    vi.mocked(getUserConfig).mockImplementationOnce(() => {
      throw 'unavailable'
    })

    expect(recordUnclaimedProject(minted)).toBe(false)
  })
})

describe('readUnclaimedProjects', () => {
  const record = {
    claimToken: minted.claimToken,
    claimUrl: minted.claimUrl,
    dataset: minted.datasetName,
    expiresAt: minted.expiresAt,
    mintedAt: '2026-07-29T12:00:00.000Z',
    projectId: minted.resourceId,
    token: minted.token,
  }

  test('returns an empty list when the registry does not exist', () => {
    mockGet.mockReturnValue(undefined)

    expect(readUnclaimedProjects()).toEqual([])
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('returns validated records newest first without mutating the registry', () => {
    mockGet.mockReturnValue({
      [minted.resourceId]: record,
      older: {
        ...record,
        mintedAt: '2026-07-28T12:00:00.000Z',
        projectId: 'older',
      },
    })

    expect(readUnclaimedProjects()).toEqual([record, expect.objectContaining({projectId: 'older'})])
    expect(mockSet).not.toHaveBeenCalled()
  })

  test.each([
    ['invalid registry', []],
    ['missing dataset', {abc123: {...record, dataset: undefined}}],
    ['mismatched project ID', {abc123: {...record, projectId: 'other'}}],
    ['invalid claim URL', {abc123: {...record, claimUrl: 'not-a-url'}}],
    ['invalid mint time', {abc123: {...record, mintedAt: 'not-a-date'}}],
    ['invalid claim deadline', {abc123: {...record, expiresAt: 'not-a-date'}}],
  ])('rejects a malformed %s', (_label, stored) => {
    mockGet.mockReturnValue(stored)

    expect(() => readUnclaimedProjects()).toThrow(/malformed/u)
    expect(mockSet).not.toHaveBeenCalled()
  })
})
