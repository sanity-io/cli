import {styleText} from 'node:util'

import {getGlobalCliClient} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {fetchDeploySummaryDetails, formatDeploySummary} from '../deploySummary.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => ({
  ...(await importOriginal()),
  getGlobalCliClient: vi.fn(),
}))

const url = 'https://org-1.sanity.run/applications/reports'
const link = styleText(['blue', 'underline'], url)

const mockRequest = vi.fn()

function summarize(options: Partial<Parameters<typeof formatDeploySummary>[0]> = {}) {
  return formatDeploySummary({
    applicationId: 'k3vq8m2rxt',
    created: false,
    durationMs: 8400,
    isApp: true,
    organizationId: 'org-1',
    title: 'Reports',
    url,
    ...options,
  })
}

beforeEach(() => {
  mockRequest.mockImplementation(async ({url: path}: {url: string}) => {
    if (path === '/organizations/org-1') return {name: 'Acme'}
    if (path === '/users/me') return {name: 'Sam'}
    throw new Error(`Unexpected request ${path}`)
  })
  vi.mocked(getGlobalCliClient).mockResolvedValue({request: mockRequest} as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('fetchDeploySummaryDetails', () => {
  test('resolves the organization and deployer names', async () => {
    await expect(fetchDeploySummaryDetails('org-1')).resolves.toEqual({
      organizationName: 'Acme',
      userName: 'Sam',
    })
  })

  test('resolves without names when the requests fail', async () => {
    mockRequest.mockRejectedValue(new Error('Unauthorized'))

    await expect(fetchDeploySummaryDetails('org-1')).resolves.toEqual({
      organizationName: undefined,
      userName: undefined,
    })
  })
})

describe('formatDeploySummary', () => {
  test('a first deploy lists the app, the deployer, and how to pin the created id', () => {
    expect(summarize({created: true, organizationName: 'Acme', userName: 'Sam'})).toBe(
      [
        '',
        '  Reports deployed in 8.4s',
        '',
        '    Organization  Acme',
        '    App           Reports',
        `    URL           ${link}`,
        '    Version       just now by Sam',
        '',
        styleText('green', `  ${logSymbols.success} Created Reports as a new application.`),
        '',
        `  ${styleText('dim', 'Add')} deployment.appId: "k3vq8m2rxt" ${styleText('dim', 'to sanity.cli.ts so the next deploy updates it')}`,
        '',
      ].join('\n'),
    )
  })

  test('a redeploy without names lists the organization id and no appId hint', () => {
    const summary = summarize({isApp: false, title: 'Federated Studio'})

    expect(summary.split('\n').slice(1)).toEqual([
      '  Federated Studio deployed in 8.4s',
      '',
      '    Organization  org-1',
      '    Studio        Federated Studio',
      `    URL           ${link}`,
      '    Version       just now',
      '',
      styleText('green', `  ${logSymbols.success} Updated Federated Studio.`),
      '',
    ])
  })
})
