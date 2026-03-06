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
  listen: (server: http.Server) => void,
  address: ReturnType<http.Server['address']> = null,
) {
  mockCreateServer.mockImplementationOnce(() => {
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    const server = {
      address: () => address,
      emit(event: string, ...args: unknown[]) {
        for (const h of listeners.get(event) ?? []) h(...args)
      },
      listen: function () {
        listen(server as unknown as http.Server)
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
    vi.clearAllMocks()
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
