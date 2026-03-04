import {type SanityClient} from '@sanity/client'
import {describe, expect, test, vi} from 'vitest'

import {promptForProviders} from '../../../../prompts/promptForProviders.js'
import {getProvider} from '../getProvider.js'
import {getSSOProvider} from '../getSSOProvider.js'

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
  test('returns Vercel provider and skips provider selection flow', async () => {
    const client = {
      config: vi.fn(() => ({apiHost: 'https://api.sanity.io'})),
      request: vi.fn(),
    } as unknown as SanityClient

    const provider = await getProvider({
      client,
      experimental: false,
      orgSlug: 'acme',
      specifiedProvider: 'vercel',
    })

    expect(provider).toEqual({
      name: 'vercel',
      title: 'Vercel',
      url: 'https://api.sanity.io/v1/auth/login/vercel',
    })
    expect(client.request).not.toHaveBeenCalled()
    expect(mockedGetSSOProvider).not.toHaveBeenCalled()
    expect(mockedPromptForProviders).not.toHaveBeenCalled()
  })
})
