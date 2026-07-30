import {stripVTControlCharacters} from 'node:util'

import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())
const mockSet = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/config', () => ({
  getUserConfig: vi.fn(() => ({
    get: mockGet,
    set: mockSet,
  })),
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
  mockGet.mockReturnValue({[record.projectId]: record})
})

afterEach(() => {
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
      {exit: 1},
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
      {exit: 1},
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
