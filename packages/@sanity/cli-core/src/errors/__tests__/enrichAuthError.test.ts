import {describe, expect, test} from 'vitest'

import {enrichAuthError} from '../enrichAuthError.js'

function httpError(
  message: string,
  statusCode: number,
  options: {body?: unknown; url?: string} = {},
): Error {
  return Object.assign(new Error(message), {
    response: {
      body: options.body ?? {},
      headers: {},
      method: 'GET',
      statusCode,
      url: options.url ?? 'https://api.sanity.io/v2021-06-07/users/me',
    },
    statusCode,
  })
}

describe('#enrichAuthError', () => {
  test('enhances 401 errors with helpful login message', () => {
    const error = httpError('Unauthorized', 401)

    const result = enrichAuthError(error)

    expect(result).toBe(error)
    expect(result.message).toContain('Unauthorized')
    expect(result.message).toContain('You may need to login again with')
    expect(result.message).toContain('sanity login')
    expect(result.message).toContain('https://www.sanity.io/help/cli-errors')
  })

  test('is idempotent', () => {
    const error = httpError('Unauthorized', 401)

    enrichAuthError(error)
    const once = error.message
    enrichAuthError(error)

    expect(error.message).toBe(once)
  })

  test('links to project members for projectUserNotFoundError on project hosts', () => {
    const error = httpError('Project user not found', 401, {
      body: {error: {type: 'projectUserNotFoundError'}},
      url: 'https://test-project.api.sanity.io/v2021-06-07/users/me',
    })

    const result = enrichAuthError(error)

    expect(result.message).toBe(
      'Project user not found. Add this account as a project member: https://www.sanity.io/manage/project/test-project/members.',
    )
    expect(result.message).not.toContain('sanity login')
  })

  test('links to project members on staging project hosts', () => {
    const error = httpError('Project user not found', 401, {
      body: {error: {type: 'projectUserNotFoundError'}},
      url: 'https://test-project.api.sanity.work/v2021-06-07/users/me',
    })

    const result = enrichAuthError(error)

    expect(result.message).toContain('/manage/project/test-project/members')
  })

  test('falls back to the login hint for projectUserNotFoundError on the global host', () => {
    const error = httpError('Project user not found', 401, {
      body: {error: {type: 'projectUserNotFoundError'}},
      url: 'https://api.sanity.io/v2021-06-07/users/me',
    })

    const result = enrichAuthError(error)

    expect(result.message).toContain('sanity login')
    expect(result.message).not.toContain('/members')
  })

  test('returns non-401 HTTP errors unchanged', () => {
    const error = httpError('Not Found', 404)

    const result = enrichAuthError(error)

    expect(result).toBe(error)
    expect(result.message).toBe('Not Found')
  })

  test('returns non-HTTP errors unchanged', () => {
    const error = new Error('Generic error')

    const result = enrichAuthError(error)

    expect(result).toBe(error)
    expect(result.message).toBe('Generic error')
  })
})
