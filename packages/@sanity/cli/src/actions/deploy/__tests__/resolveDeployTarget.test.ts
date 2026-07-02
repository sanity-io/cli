import {describe, expect, test} from 'vitest'

import {resolveAppDeployTarget} from '../resolveDeployTarget.js'

// The verdicts that hit the API (found / would-create / needs-input) are
// exercised end-to-end by the deploy integration tests; this covers the guard
// that short-circuits before any lookup.

describe('resolveAppDeployTarget', () => {
  test('no appId and no organizationId → blocked', async () => {
    const result = await resolveAppDeployTarget({appId: undefined, organizationId: undefined})

    expect(result).toEqual({message: 'app.organizationId is missing', type: 'blocked'})
  })
})
