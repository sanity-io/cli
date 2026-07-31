import {describe, expect, test} from 'vitest'

import {formatClaimDeadline} from '../formatClaimDeadline.js'

describe('formatClaimDeadline', () => {
  test('formats the deadline in UTC', () => {
    expect(formatClaimDeadline('2026-07-31T10:30:00.000Z')).toBe('31 July 2026, 10:30 UTC')
  })

  test('preserves an invalid deadline', () => {
    expect(formatClaimDeadline('invalid')).toBe('invalid')
  })
})
