import {describe, expect, test} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {apiErrorCode} from '../apiErrorCode.js'

function withBody(body: unknown): Error {
  const error = httpError(409)
  Object.assign(error, {response: {...(error as unknown as {response: object}).response, body}})
  return error
}

describe('apiErrorCode', () => {
  test('reads the code from a Context API error body', () => {
    expect(apiErrorCode(withBody({code: 'sourceDeletionsUnconfirmed'}))).toBe(
      'sourceDeletionsUnconfirmed',
    )
  })

  test.each([
    ['a non-HTTP error', new Error('boom')],
    ['a body without a code', withBody({})],
    ['a non-string code', withBody({code: 409})],
    ['a text body', withBody('Conflict')],
  ])('is undefined for %s', (_label, error) => {
    expect(apiErrorCode(error)).toBeUndefined()
  })
})
