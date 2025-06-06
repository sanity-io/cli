import {afterEach, describe, expect, test, vi} from 'vitest'

import {deleteUserApplication, getUserApplication} from '../../../services/userApplications.js'
import {undeployStudio} from '../studioUndeploy.js'

vi.mock('../../../services/userApplications.js')
vi.mock('../../../core/spinner.js', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(() => ({fail: vi.fn(), succeed: vi.fn(), text: ''})),
  })),
}))
vi.mock('@inquirer/prompts', () => ({confirm: vi.fn()}))

const log = vi.fn()
const client = {} as never

afterEach(() => {
  vi.clearAllMocks()
})

describe('undeployStudio', () => {
  test('exits if no studio hostname', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce(null)

    await undeployStudio({cliConfig: {} as never, client, flags: {yes: true}, log})

    expect(log).toHaveBeenCalledWith('Your project has not been assigned a studio hostname')
  })

  test('asks for confirmation', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({appHost: 'host', id: 'id'} as never)
    const confirmMock = vi.mocked((await import('@inquirer/prompts')).confirm)
    confirmMock.mockResolvedValueOnce(false)

    await undeployStudio({
      cliConfig: {studioHost: 'host'} as never,
      client,
      flags: {yes: false},
      log,
    })

    expect(confirmMock).toHaveBeenCalled()
    expect(deleteUserApplication).not.toHaveBeenCalled()
  })

  test('undeploys when confirmed', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({appHost: 'host', id: 'id'} as never)
    const confirmMock = vi.mocked((await import('@inquirer/prompts')).confirm)
    confirmMock.mockResolvedValueOnce(true)

    await undeployStudio({
      cliConfig: {studioHost: 'host'} as never,
      client,
      flags: {yes: false},
      log,
    })

    expect(deleteUserApplication).toHaveBeenCalled()
  })

  test('throws on delete error', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({appHost: 'host', id: 'id'} as never)
    vi.mocked(deleteUserApplication).mockRejectedValueOnce(new Error('fail'))

    await expect(
      undeployStudio({cliConfig: {studioHost: 'host'} as never, client, flags: {yes: true}, log}),
    ).rejects.toThrow('fail')
  })
})
