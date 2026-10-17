import {describe, expect, test} from 'vitest'

import {findGrantConflict, parseGrant} from '../grants.js'

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

  test('rejects more than one role for an organization permission', () => {
    expect(parseGrant('context=viewer,editor')).toEqual({
      error: expect.stringContaining('takes one role'),
    })
  })

  test('rejects the same permission with different roles across flags', () => {
    const grants = [
      {key: 'context', roles: ['viewer']},
      {key: 'context', roles: ['editor']},
    ]
    expect(findGrantConflict(grants)).toContain('different roles')
  })

  test.each([
    {expected: {key: 'context', roles: ['viewer']}, value: 'context'},
    {expected: {key: 'project:p1', roles: ['viewer']}, value: 'project:p1'},
    {expected: {key: 'blueprints', roles: []}, value: 'blueprints'},
  ])('applies the default role for $value', ({expected, value}) => {
    expect(parseGrant(value)).toEqual({grant: expected})
  })
})
