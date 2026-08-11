import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  fetchNewInstructions,
  INSTRUCTIONS_URL,
  InstructionsUnavailableError,
} from '../newInstructions.js'

const MARKDOWN = '# Set up a Sanity project (mint and claim)\n\n## 1. Mint a project\n'

function mockFetch(response: Partial<Response> & Pick<Response, 'text'>): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ok: true, status: 200, ...response} as Response)
}

beforeEach(() => {
  mockFetch({text: () => Promise.resolve(MARKDOWN)})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchNewInstructions', () => {
  test('requests markdown from the prerendered sanity.new route', async () => {
    await fetchNewInstructions()

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://sanity.new/llms.txt',
      expect.objectContaining({
        headers: {Accept: 'text/markdown'},
        method: 'GET',
      }),
    )
    expect(INSTRUCTIONS_URL).toBe('https://sanity.new/llms.txt')
  })

  test('returns the document without reformatting its contents', async () => {
    await expect(fetchNewInstructions()).resolves.toBe(MARKDOWN.trim())
  })

  test('rejects an HTTP error rather than returning an error page as instructions', async () => {
    mockFetch({ok: false, status: 503, text: () => Promise.resolve('Service Unavailable')})

    await expect(fetchNewInstructions()).rejects.toThrow(InstructionsUnavailableError)
    await expect(fetchNewInstructions()).rejects.toThrow('the server responded with HTTP 503')
  })

  test('rejects HTML, which means the markdown route regressed to the landing page', async () => {
    mockFetch({text: () => Promise.resolve('<!doctype html>\n<html lang="en">')})

    await expect(fetchNewInstructions()).rejects.toThrow('HTML rather than markdown')
  })

  test('rejects an empty body', async () => {
    mockFetch({text: () => Promise.resolve('   \n  ')})

    await expect(fetchNewInstructions()).rejects.toThrow('the response was empty')
  })

  test('reports a timeout as a timeout', async () => {
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeout)

    await expect(fetchNewInstructions()).rejects.toThrow('the request timed out after 10 seconds')
  })

  test('reports a network failure with the underlying reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND sanity.new'))

    await expect(fetchNewInstructions()).rejects.toThrow('getaddrinfo ENOTFOUND sanity.new')
  })

  test('names the URL in every failure so the fallback is obvious', async () => {
    mockFetch({ok: false, status: 500, text: () => Promise.resolve('')})

    await expect(fetchNewInstructions()).rejects.toThrow(INSTRUCTIONS_URL)
  })
})
