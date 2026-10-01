import {afterEach, describe, expect, test, vi} from 'vitest'

import {ApiError, isAuthError, request} from '../src/api.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('request', () => {
  test('sends JSON with the stored token', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'tok')
    const fetchMock = vi.fn(async () => Response.json({ok: true}))
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await request({apiVersion: 'v1', body: {a: 1}, method: 'POST', projectId: 'p1', url: '/x'}),
    ).toEqual({ok: true})
    expect(fetchMock).toHaveBeenCalledWith('https://p1.api.sanity.io/v1/x?tag=sanity.cli', {
      body: '{"a":1}',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer tok',
        'content-type': 'application/json',
      },
      method: 'POST',
    })
  })

  test('requires a token unless unauthenticated', async () => {
    const fetchMock = vi.fn(async () => new Response(''))
    vi.stubGlobal('fetch', fetchMock)
    await expect(request({apiVersion: 'v1', url: '/x'})).rejects.toThrow('You must login first')
    expect(await request({apiVersion: 'v1', unauthenticated: true, url: '/x'})).toBeUndefined()
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.sanity.io/v1/x?tag=sanity.cli',
      {body: undefined, headers: {accept: 'application/json'}, method: 'GET'},
    ])
  })

  test.each([
    [{error: {description: 'Described'}}, 'Described'],
    [{message: 'Message'}, 'Message'],
    [{error: 'Plain'}, 'Plain'],
    ['not json', 'Request failed with status code 401'],
  ])('turns %j into an ApiError', async (body, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        typeof body === 'string'
          ? new Response(body, {status: 401})
          : Response.json(body, {status: 401}),
      ),
    )
    const error = await request({apiVersion: 'v1', token: 't', url: '/x'}).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({message, statusCode: 401})
    expect(isAuthError(error)).toBe(true)
  })

  test('only 401 and 403 are auth errors', () => {
    expect(isAuthError(new ApiError(403, 'x'))).toBe(true)
    expect(isAuthError(new ApiError(500, 'x'))).toBe(false)
    expect(isAuthError(new Error('x'))).toBe(false)
  })
})
