import {type RequestHandler} from '@sanity/client'
import {createMockFetch} from 'get-it/mock'
import {afterEach, describe, expect, test} from 'vitest'

import {getGlobalCliClient} from '../apiClient.js'
import {runWithCliExecutionContext} from '../executionContext.js'

import 'get-it/vitest'

const mock = createMockFetch()
const usersMeUrl = 'https://api.sanity.io/v2021-06-07/users/me'
const usersMeRequest = {query: {tag: 'sanity.cli'}}

function createTestClient(requestHandler?: RequestHandler) {
  return runWithCliExecutionContext({fetch: mock.fetch}, () =>
    getGlobalCliClient({
      apiVersion: '2021-06-07',
      maxRetries: 0,
      requestHandler,
      token: 'test-token',
    }),
  )
}

describe('api client request handler', () => {
  afterEach(() => {
    mock.clear()
  })

  test('enriches normalized 401 errors from the client', async () => {
    mock.on('GET', usersMeUrl, usersMeRequest).respond({
      body: {error: {description: 'Unauthorized - Session not found'}},
      status: 401,
    })
    const client = await createTestClient()

    await expect(client.users.getById('me')).rejects.toMatchObject({
      message: expect.stringContaining('sanity login'),
      statusCode: 401,
    })
    expect(mock).toHaveConsumedAllMocks()
  })

  test('lets a caller-provided request handler observe enriched errors', async () => {
    mock.on('GET', usersMeUrl, usersMeRequest).respond({
      body: {error: {description: 'Unauthorized - Session not found'}},
      status: 401,
    })
    let observedError: unknown
    const requestHandler: RequestHandler = async (request, next) => {
      try {
        return await next(request)
      } catch (error) {
        observedError = error
        throw error
      }
    }
    const client = await createTestClient(requestHandler)

    await expect(client.users.getById('me')).rejects.toMatchObject({
      message: expect.stringContaining('sanity login'),
    })
    expect(observedError).toMatchObject({
      message: expect.stringContaining('sanity login'),
      statusCode: 401,
    })
    expect(mock).toHaveConsumedAllMocks()
  })

  test('passes non-401 errors through unchanged', async () => {
    mock.on('GET', usersMeUrl, usersMeRequest).respond({
      body: {error: {description: 'Not Found'}},
      status: 404,
    })
    let observedError: unknown
    const requestHandler: RequestHandler = async (request, next) => {
      try {
        return await next(request)
      } catch (error) {
        observedError = error
        throw error
      }
    }
    const client = await createTestClient(requestHandler)

    const rejectedError: unknown = await client.users.getById('me').catch((error: unknown) => error)

    expect(rejectedError).toBe(observedError)
    expect(rejectedError).toMatchObject({
      message: expect.not.stringContaining('sanity login'),
      statusCode: 404,
    })
    expect(mock).toHaveConsumedAllMocks()
  })
})
