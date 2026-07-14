import {describe, expect, test} from 'vitest'

import {getCoreAppUrl} from '../util/getCoreAppUrl.js'

describe('getCoreAppUrl', () => {
  test('points at the org-scoped application route in the dashboard', () => {
    expect(getCoreAppUrl('org-1', 'app-1')).toMatch(/\/@org-1\/application\/app-1$/)
  })
})
