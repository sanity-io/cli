import type http from 'node:http'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {startServerForTokenCallback} from '../authServer.js'

const mockCreateServer = vi.hoisted(() => vi.fn())

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>()
  return {
    ...actual,
    createServer: mockCreateServer,
  }
})

function useMockServer(
  listen: (server: http.Server, port?: number) => void,
  address: ReturnType<http.Server['address']> = null,
) {
  mockCreateServer.mockImplementationOnce(() => {
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    const server = {
      address: () => address,
      emit(event: string, ...args: unknown[]) {
        for (const h of listeners.get(event) ?? []) h(...args)
      },
      listen: function (port?: number) {
        listen(server as unknown as http.Server, port)
        return server
      },
      on(event: string, handler: (...args: unknown[]) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), handler])
        return this
      },
    } as unknown as http.Server
    return server
  })
}

describe('startServerForTokenCallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  test('uses ports from SANITY_CLI_CALLBACK_PORTS, including OS-assigned port 0', async () => {
    vi.stubEnv('SANITY_CLI_CALLBACK_PORTS', '1234,0')

    const attemptedPorts: (number | undefined)[] = []
    useMockServer(
      (server, port) => {
        attemptedPorts.push(port)
        if (attemptedPorts.length === 1) {
          // First port is busy, should fall back to the next one (0)
          setImmediate(() =>
            server.emit('error', Object.assign(new Error('In use'), {code: 'EADDRINUSE'})),
          )
        } else {
          setImmediate(() => server.emit('listening'))
        }
      },
      {address: '127.0.0.1', family: 'IPv4', port: 54_321},
    )

    const {loginUrl} = await startServerForTokenCallback('https://api.sanity.io/auth/google')

    expect(attemptedPorts).toEqual([1234, 0])
    // The login URL must use the port the OS actually assigned, not the requested `0`
    expect(loginUrl.searchParams.get('origin')).toBe('http://localhost:54321/callback')
  })

  test('rejects when SANITY_CLI_CALLBACK_PORTS is not a list of ports', async () => {
    vi.stubEnv('SANITY_CLI_CALLBACK_PORTS', 'not-a-port')

    await expect(startServerForTokenCallback('https://api.sanity.io/auth/google')).rejects.toThrow(
      'Invalid SANITY_CLI_CALLBACK_PORTS value: "not-a-port"',
    )
  })

  test('rejects when SANITY_CLI_CALLBACK_PORTS contains out-of-range ports', async () => {
    vi.stubEnv('SANITY_CLI_CALLBACK_PORTS', '4321,70000')

    await expect(startServerForTokenCallback('https://api.sanity.io/auth/google')).rejects.toThrow(
      'Invalid SANITY_CLI_CALLBACK_PORTS value: "4321,70000"',
    )
  })

  test('rejects with non-EADDRINUSE server errors', async () => {
    useMockServer((server) =>
      setImmediate(() =>
        server.emit('error', Object.assign(new Error('Network unreachable'), {code: 'ENETDOWN'})),
      ),
    )

    await expect(startServerForTokenCallback('https://api.sanity.io/auth/google')).rejects.toThrow(
      'Network unreachable',
    )
  })

  test('throws when server address is invalid after listening', async () => {
    useMockServer((server) => server.emit('listening'), null)

    await expect(startServerForTokenCallback('https://api.sanity.io/auth/google')).rejects.toThrow(
      'Failed to start auth callback server',
    )
  })
})
