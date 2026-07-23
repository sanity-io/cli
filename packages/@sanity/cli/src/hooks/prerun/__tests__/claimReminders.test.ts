import {afterEach, describe, expect, test, vi} from 'vitest'

import {claimReminders} from '../claimReminders.js'

const mockRunClaimNudges = vi.hoisted(() => vi.fn())

vi.mock('../../../util/claimNudges.js', () => ({
  runClaimNudges: mockRunClaimNudges,
}))

function runHook(commandId: string | undefined) {
  return (claimReminders as (opts: unknown) => Promise<void>).call(
    {},
    {Command: commandId ? {id: commandId} : undefined},
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('#claimReminders', () => {
  test('runs the nudge check for regular commands', async () => {
    await runHook('versions')

    expect(mockRunClaimNudges).toHaveBeenCalledTimes(1)
  })

  test.each(['new', 'projects:mint', 'project:mint'])('skips the %s command', async (id) => {
    await runHook(id)

    expect(mockRunClaimNudges).not.toHaveBeenCalled()
  })

  test('never throws when the nudge check fails', async () => {
    mockRunClaimNudges.mockRejectedValue(new Error('config unreadable'))

    await expect(runHook('versions')).resolves.toBeUndefined()
  })
})
