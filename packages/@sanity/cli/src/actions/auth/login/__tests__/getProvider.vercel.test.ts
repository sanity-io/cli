import {createTestClient} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {promptForProviders} from '../../../../prompts/promptForProviders.js'
import {getProvider} from '../getProvider.js'
import {getSSOProvider} from '../getSSOProvider.js'

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  const {client} = createTestClient({apiVersion: 'v2025-09-23'})

  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue(client),
    subdebug: vi.fn(() => vi.fn()),
  }
})

vi.mock('@sanity/cli-core/ux', () => ({
  input: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(() => ({
      stop: vi.fn(),
    })),
  })),
}))

vi.mock('../getSSOProvider.js', () => ({
  getSSOProvider: vi.fn(),
}))

vi.mock('../../../../prompts/promptForProviders.js', () => ({
  promptForProviders: vi.fn(),
}))

const mockedGetSSOProvider = vi.mocked(getSSOProvider)
const mockedPromptForProviders = vi.mocked(promptForProviders)

describe('#getProvider vercel provider', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns Vercel provider and skips provider selection flow', async () => {
    const provider = await getProvider({
      experimental: false,
      orgSlug: 'acme',
      specifiedProvider: 'vercel',
      ssoProvider: undefined,
    })

    expect(provider).toMatchObject({
      name: 'vercel',
      title: 'Vercel',
    })
    const url = new URL(provider!.url)
    expect(url.protocol).toBe('https:')
    expect(url.pathname).toBe('/v1/auth/login/vercel')
    expect(mockedGetSSOProvider).not.toHaveBeenCalled()
    expect(mockedPromptForProviders).not.toHaveBeenCalled()
  })
})
