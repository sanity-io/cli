import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getDashboardAppURL} from '../getDashboardAppUrl.js'

const mockFetch = vi.fn()

describe('#getDashboardAppUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('should send default dashboard app url if fetch timesout', async () => {
    mockFetch.mockImplementation(
      (_url, {signal}) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => resolve({json: () => ({url: 'https://custom.url'}), ok: true}),
            6000,
          )
          signal.addEventListener('abort', () => {
            clearTimeout(timeout)
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const promise = getDashboardAppURL({
      httpHost: 'localhost',
      httpPort: 3333,
      organizationId: 'org-123',
    })

    await vi.advanceTimersByTimeAsync(5000)

    const result = await promise

    expect(result).toBe('https://www.sanity.io/@org-123?dev=http%3A%2F%2Flocalhost%3A3333')
  })

  test('should send default dashboard app url if fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    })

    const result = await getDashboardAppURL({
      httpHost: 'localhost',
      httpPort: 3333,
      organizationId: 'org-456',
    })

    expect(result).toBe('https://www.sanity.io/@org-456?dev=http%3A%2F%2Flocalhost%3A3333')
  })

  test('should send default url if body does not return url', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    })

    const result = await getDashboardAppURL({
      httpHost: 'localhost',
      httpPort: 3333,
      organizationId: 'org-789',
    })

    expect(result).toBe('https://www.sanity.io/@org-789?dev=http%3A%2F%2Flocalhost%3A3333')
  })

  test('sends back dashboard app url when successful', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({url: 'https://custom-dashboard.sanity.io/@org-789?dev=test'}),
      ok: true,
    })

    const result = await getDashboardAppURL({
      httpHost: 'localhost',
      httpPort: 3333,
      organizationId: 'org-789',
    })

    expect(result).toBe('https://custom-dashboard.sanity.io/@org-789?dev=test')
  })
})
