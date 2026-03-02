import {afterEach, describe, expect, test} from 'vitest'

import {startServerForTokenCallback} from '../authServer.js'

const servers: Array<{close: (cb?: (err?: Error) => void) => void}> = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
})

describe('#startServerForTokenCallback', () => {
  test('returns callbackUrl and uses it as origin in login URL', async () => {
    const fakeClient = {
      config: () => ({apiHost: 'https://api.sanity.io'}),
    } as unknown as Parameters<typeof startServerForTokenCallback>[0]['client']

    const {callbackUrl, loginUrl, server} = await startServerForTokenCallback({
      client: fakeClient,
      providerUrl: 'https://api.sanity.io/v1/auth/login/github',
    })
    servers.push(server)

    expect(callbackUrl.protocol).toBe('http:')
    expect(callbackUrl.hostname).toBe('localhost')
    expect(Number(callbackUrl.port)).toBeGreaterThan(0)
    expect(callbackUrl.pathname).toBe('/callback')
    expect(loginUrl.searchParams.get('origin')).toBe(callbackUrl.href)
    expect(loginUrl.searchParams.get('type')).toBe('token')
  })
})
