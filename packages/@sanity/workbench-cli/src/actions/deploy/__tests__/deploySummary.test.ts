import {styleText} from 'node:util'

import {getGlobalCliClient} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {formatDeploySummary} from '../deploySummary.js'

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
    configFile: 'sanity.cli.ts',
    created: false,
    durationMs: 8400,
    hasAppId: true,
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

describe('formatDeploySummary', () => {
  test('a first deploy lists the app, the deployer, and how to pin the created id', async () => {
    await expect(summarize({created: true, hasAppId: false})).resolves.toBe(
      [
        '',
        '  Sanity Dashboard deployed in 8.4s',
        '',
        '    Organization  Acme',
        '    App           Reports',
        `    URL           ${link}`,
        '    Version       just now by Sam',
        '',
        styleText('green', `  ${logSymbols.success} Created Reports as a new application.`),
        '',
        `  ${styleText('dim', 'Add')} deployment.appId: ${styleText('dim', '"k3vq8m2rxt" to sanity.cli.ts')}`,
        '',
      ].join('\n'),
    )
  })

  test('a studio redeploy without org or user access shows only what is known', async () => {
    mockRequest.mockRejectedValue(new Error('Unauthorized'))

    const summary = await summarize({isApp: false, title: 'Federated Studio'})

    expect(summary.split('\n').slice(3)).toEqual([
      '    Studio   Federated Studio',
      `    URL      ${link}`,
      '    Version  just now',
      '',
      styleText('green', `  ${logSymbols.success} Updated Federated Studio studio.`),
      '',
    ])
  })
})
