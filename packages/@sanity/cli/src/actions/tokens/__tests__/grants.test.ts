import {describe, expect, test} from 'vitest'

import {parseGrant} from '../grants.js'

describe('parseGrant', () => {
  test.each([
    'context=editor=viewer',
    'context==developer',
    'blueprints==editor',
    'project:p1=viewer=editor',
    'context=',
    'project:p1=editor,',
  ])('rejects malformed grant %s', (value) => {
    expect(parseGrant(value)).toEqual({error: expect.stringContaining('Invalid grant')})
  })

  test.each([
    {expected: {key: 'context', roles: ['viewer']}, value: 'context'},
    {expected: {key: 'project:p1', roles: ['viewer']}, value: 'project:p1'},
    {expected: {key: 'blueprints', roles: []}, value: 'blueprints'},
  ])('applies the default role for $value', ({expected, value}) => {
    expect(parseGrant(value)).toEqual({grant: expected})
  })
})
