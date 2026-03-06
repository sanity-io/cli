import {afterEach, describe, expect, test, vi} from 'vitest'

import {promptForProviders} from '../../../../prompts/promptForProviders.js'
import {getVercelProviderUrl} from '../../../../services/auth.js'
import {getProvider} from '../getProvider.js'
import {getSSOProvider} from '../getSSOProvider.js'

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
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

vi.mock('../../../../services/auth.js', () => ({
  getProviders: vi.fn(),
  getVercelProviderUrl: vi.fn(),
}))

const mockedGetSSOProvider = vi.mocked(getSSOProvider)
const mockedPromptForProviders = vi.mocked(promptForProviders)
const mockedGetVercelProviderUrl = vi.mocked(getVercelProviderUrl)

describe('#getProvider vercel provider', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns Vercel provider and skips provider selection flow', async () => {
    mockedGetVercelProviderUrl.mockResolvedValue('https://api.sanity.io/v1/auth/login/vercel')

    const provider = await getProvider({
      experimental: false,
      orgSlug: 'acme',
      specifiedProvider: 'vercel',
    })

    expect(provider).toEqual({
      name: 'vercel',
      title: 'Vercel',
      url: 'https://api.sanity.io/v1/auth/login/vercel',
    })
    expect(mockedGetVercelProviderUrl).toHaveBeenCalled()
    expect(mockedGetSSOProvider).not.toHaveBeenCalled()
    expect(mockedPromptForProviders).not.toHaveBeenCalled()
  })
})
