import {stripVTControlCharacters} from 'node:util'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
const mockGetProjectClaimStatus = vi.hoisted(() => vi.fn())
const mockSet = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/config', () => ({
  getUserConfig: vi.fn(() => ({
    delete: mockDelete,
    get: mockGet,
    set: mockSet,
  })),
}))
vi.mock('../../../services/projects.js', () => ({
  getProjectClaimStatus: mockGetProjectClaimStatus,
}))

const claimToken = 'claim-secret'
const robotToken = 'sk-robot/token?scope=read&write#credential'
const record = {
  claimToken,
  claimUrl: `https://www.sanity.io/claim/${claimToken}`,
  dataset: 'production',
  expiresAt: '2026-08-01T00:00:00.000Z',
  mintedAt: '2026-07-29T12:00:00.000Z',
  projectId: 'abc123',
  token: robotToken,
}

const {UnclaimedProjectsCommand} = await import('../unclaimed.js')

function outputText(): string {
  return stripVTControlCharacters(vi.mocked(mocks.SanityCmdOutput.log).mock.calls.flat().join('\n'))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime('2026-07-31T12:00:00.000Z')
  mockGet.mockReturnValue({[record.projectId]: record})
  mockGetProjectClaimStatus.mockResolvedValue('unclaimed')
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  process.exitCode = undefined
})

describe('#projects:unclaimed', () => {
  test('lists local records without exposing tokens', async () => {
    await UnclaimedProjectsCommand.run([])

    const output = outputText()
    expect(output.split('\n')[0]?.trimEnd()).toMatch(
      /^id\s+dataset\s+created\s+claim deadline\s+claim url$/u,
    )
    expect(output).toContain(record.projectId)
    expect(output).toContain(record.dataset)
    expect(output).toContain(record.mintedAt)
    expect(output).toContain(record.expiresAt)
    expect(output).toContain(record.claimUrl)
    expect(output).not.toContain(robotToken)
    expect(mockGetProjectClaimStatus).toHaveBeenCalledWith(record.projectId, robotToken)
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('removes claimed records before listing', async () => {
    mockGetProjectClaimStatus.mockResolvedValue('claimed')

    await UnclaimedProjectsCommand.run([])

    expect(mockDelete).toHaveBeenCalledWith('unclaimedProjects')
    expect(outputText()).toContain(
      `✔ Project "${record.projectId}" is claimed. Local recovery details removed.`,
    )
    expect(outputText()).not.toContain('No locally recorded unclaimed projects')
    expect(outputText()).not.toContain(record.claimUrl)
    expect(outputText()).not.toContain(robotToken)
  })

  test('removes expired records without checking remote claim status', async () => {
    const expired = {...record, expiresAt: '2026-07-31T12:00:00.000Z'}
    mockGet.mockReturnValue({[expired.projectId]: expired})

    await UnclaimedProjectsCommand.run([])

    expect(mockGetProjectClaimStatus).not.toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledWith('unclaimedProjects')
    expect(outputText()).toContain(
      `✔ Project "${expired.projectId}" expired. Local recovery details removed.`,
    )
    expect(outputText()).not.toContain(expired.claimUrl)
    expect(outputText()).not.toContain(expired.token)
  })

  test('lists active records before expired project notices', async () => {
    const expired = {
      ...record,
      claimToken: 'expired-secret',
      claimUrl: 'https://www.sanity.io/claim/expired-secret',
      expiresAt: '2026-07-31T11:59:59.999Z',
      projectId: 'expired',
      token: 'sk-expired-token',
    }
    mockGet.mockReturnValue({[expired.projectId]: expired, [record.projectId]: record})

    await UnclaimedProjectsCommand.run([])

    const output = outputText()
    expect(mockGetProjectClaimStatus).toHaveBeenCalledOnce()
    expect(mockGetProjectClaimStatus).toHaveBeenCalledWith(record.projectId, robotToken)
    expect(output.indexOf(record.claimUrl)).toBeLessThan(
      output.indexOf(`✔ Project "${expired.projectId}" expired. Local recovery details removed.`),
    )
    expect(output).not.toContain(expired.claimUrl)
    expect(output).not.toContain(expired.token)
  })

  test('lists claimed project notices below remaining unclaimed projects', async () => {
    const claimed = {
      ...record,
      claimToken: 'claimed-secret',
      claimUrl: 'https://www.sanity.io/claim/claimed-secret',
      projectId: 'claimed',
      token: 'sk-claimed-token',
    }
    mockGet.mockReturnValue({[claimed.projectId]: claimed, [record.projectId]: record})
    mockGetProjectClaimStatus.mockImplementation(async (projectId: string) =>
      projectId === claimed.projectId ? 'claimed' : 'unclaimed',
    )

    await UnclaimedProjectsCommand.run([])

    const output = outputText()
    expect(output.indexOf(record.claimUrl)).toBeLessThan(
      output.indexOf(
        `✔ Project "${claimed.projectId}" is claimed. Local recovery details removed.`,
      ),
    )
    expect(output).not.toContain(claimed.claimUrl)
    expect(output).not.toContain(claimed.token)
  })

  test('keeps claimed records and warns when local cleanup fails', async () => {
    mockGetProjectClaimStatus.mockResolvedValue('claimed')
    mockDelete.mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    await UnclaimedProjectsCommand.run([])

    expect(mocks.SanityCmdOutput.warn).toHaveBeenCalledWith(
      `Project "${record.projectId}" is claimed, but its local recovery details could not be removed. Run this command again to retry.`,
    )
    expect(outputText()).not.toContain(record.claimUrl)
    expect(outputText()).not.toContain(robotToken)
  })

  test('keeps records and warns when claim status cannot be verified', async () => {
    mockGetProjectClaimStatus.mockResolvedValue('unknown')

    await UnclaimedProjectsCommand.run([])

    expect(mocks.SanityCmdOutput.warn).toHaveBeenCalledWith(
      `Could not verify whether project "${record.projectId}" is claimed. Local recovery details were kept. Run this command again to retry.`,
    )
    expect(outputText()).toContain(record.claimUrl)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('--project-id prints only the requested project details and access token', async () => {
    const other = {
      ...record,
      claimToken: 'other-claim-secret',
      claimUrl: 'https://www.sanity.io/claim/other-claim-secret',
      projectId: 'other',
      token: 'sk-other-token',
    }
    mockGet.mockReturnValue({[other.projectId]: other, [record.projectId]: record})

    await UnclaimedProjectsCommand.run(['--project-id', record.projectId])

    const output = outputText()
    expect(output.split('\n')).toEqual(
      expect.arrayContaining([
        'Project:',
        `  Project ID:     ${record.projectId}`,
        `  Dataset:        ${record.dataset}`,
        `  Created:        ${record.mintedAt}`,
        `  Claim deadline: ${record.expiresAt}`,
        `  Claim URL:      ${record.claimUrl}`,
        `  Access token:   ${robotToken}`,
      ]),
    )
    expect(output).not.toContain('Run a CLI command:')
    expect(output).not.toContain('Open the Studio:')
    expect(output).not.toContain('localhost:3333')
    expect(output).not.toContain(other.projectId)
    expect(output).not.toContain(other.token)
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('--project-id removes and reports a claimed project', async () => {
    const other = {
      ...record,
      claimToken: 'other-claim-secret',
      claimUrl: 'https://www.sanity.io/claim/other-claim-secret',
      projectId: 'other',
      token: 'sk-other-token',
    }
    mockGet.mockReturnValue({[other.projectId]: other, [record.projectId]: record})
    mockGetProjectClaimStatus.mockResolvedValue('claimed')

    await UnclaimedProjectsCommand.run(['--project-id', record.projectId])

    expect(mockGetProjectClaimStatus).toHaveBeenCalledOnce()
    expect(mockGetProjectClaimStatus).toHaveBeenCalledWith(record.projectId, robotToken)
    expect(mockSet).toHaveBeenCalledWith('unclaimedProjects', {
      [other.projectId]: other,
    })
    expect(outputText()).toContain(
      `✔ Project "${record.projectId}" is claimed. Local recovery details removed.`,
    )
    expect(outputText()).not.toContain(record.claimUrl)
    expect(outputText()).not.toContain(robotToken)
  })

  test('--project-id removes and reports an expired project without checking remotely', async () => {
    const expired = {...record, expiresAt: '2026-07-31T11:59:59.999Z'}
    mockGet.mockReturnValue({[expired.projectId]: expired})

    await UnclaimedProjectsCommand.run(['--project-id', expired.projectId])

    expect(mockGetProjectClaimStatus).not.toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledWith('unclaimedProjects')
    expect(outputText()).toContain(
      `✔ Project "${expired.projectId}" expired. Local recovery details removed.`,
    )
    expect(outputText()).not.toContain(expired.claimUrl)
    expect(outputText()).not.toContain(expired.token)
  })

  test('does not print expired recovery details when local cleanup fails', async () => {
    const expired = {...record, expiresAt: '2026-07-31T11:59:59.999Z'}
    mockGet.mockReturnValue({[expired.projectId]: expired})
    mockDelete.mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    await UnclaimedProjectsCommand.run(['--project-id', expired.projectId])

    expect(mocks.SanityCmdOutput.warn).toHaveBeenCalledWith(
      `Project "${expired.projectId}" expired, but its local recovery details could not be removed. Run this command again to retry.`,
    )
    expect(mockGetProjectClaimStatus).not.toHaveBeenCalled()
    expect(outputText()).not.toContain(expired.claimUrl)
    expect(outputText()).not.toContain(expired.token)
  })

  test('--project-id keeps details and warns when claim status cannot be verified', async () => {
    mockGetProjectClaimStatus.mockResolvedValue('unknown')

    await UnclaimedProjectsCommand.run(['--project-id', record.projectId])

    expect(mocks.SanityCmdOutput.warn).toHaveBeenCalledWith(
      `Could not verify whether project "${record.projectId}" is claimed. Local recovery details were kept. Run this command again to retry.`,
    )
    expect(outputText()).toContain(record.claimUrl)
    expect(outputText()).toContain(robotToken)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('has an actionable successful empty state', async () => {
    mockGet.mockReturnValue(undefined)

    await UnclaimedProjectsCommand.run([])

    expect(outputText()).toContain('Create one with `sanity new`')
    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
  })

  test('reports a missing requested project without exposing other records', async () => {
    await UnclaimedProjectsCommand.run(['--project-id', 'missing'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('No local recovery record found for project "missing"'),
      {exit: exitCodes.RUNTIME_ERROR},
    )

    expect(outputText()).not.toContain(robotToken)
    expect(outputText()).not.toContain(record.claimUrl)
  })

  test('reports malformed records without exposing partial contents', async () => {
    mockGet.mockReturnValue({
      [record.projectId]: {...record, dataset: undefined},
    })

    await UnclaimedProjectsCommand.run([])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringContaining('Could not read local unclaimed projects'),
      {exit: exitCodes.RUNTIME_ERROR},
    )

    const errorCalls = vi.mocked(mocks.SanityCmdOutput.error).mock.calls.flat().join('\n')
    expect(errorCalls).not.toContain(robotToken)
    expect(errorCalls).not.toContain(record.claimUrl)
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('does not activate credentials or mutate registry state', async () => {
    const originalToken = process.env.SANITY_AUTH_TOKEN

    await UnclaimedProjectsCommand.run(['--project-id', record.projectId])

    expect(process.env.SANITY_AUTH_TOKEN).toBe(originalToken)
    expect(mockSet).not.toHaveBeenCalled()
  })
})
