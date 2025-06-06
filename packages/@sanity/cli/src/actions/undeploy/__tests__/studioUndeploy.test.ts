import {afterEach, describe, expect, test, vi} from 'vitest'

import {undeployStudio} from '../studioUndeploy.js'
import {deleteUserApplication, getUserApplication} from '../../../services/userApplications.js'

vi.mock('../../../services/userApplications.js')
vi.mock('../../../core/spinner.js', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn(() => ({succeed: vi.fn(), fail: vi.fn(), text: ''})),
  })),
}))
vi.mock('@inquirer/prompts', () => ({confirm: vi.fn()}))

const log = vi.fn()
const client = {} as any

afterEach(() => {
  vi.clearAllMocks()
})

describe('undeployStudio', () => {
  test('exits if no studio hostname', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce(null)

    await undeployStudio({client, cliConfig: {} as any, flags: {yes: true}, log})

    expect(log).toHaveBeenCalledWith('Your project has not been assigned a studio hostname')
  })

  test('asks for confirmation', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({id: 'id', appHost: 'host'} as any)
    const confirmMock = vi.mocked((await import('@inquirer/prompts')).confirm)
    confirmMock.mockResolvedValueOnce(false)

    await undeployStudio({client, cliConfig: {studioHost: 'host'} as any, flags: {yes: false}, log})

    expect(confirmMock).toHaveBeenCalled()
    expect(deleteUserApplication).not.toHaveBeenCalled()
  })

  test('undeploys when confirmed', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({id: 'id', appHost: 'host'} as any)
    const confirmMock = vi.mocked((await import('@inquirer/prompts')).confirm)
    confirmMock.mockResolvedValueOnce(true)

    await undeployStudio({client, cliConfig: {studioHost: 'host'} as any, flags: {yes: false}, log})

    expect(deleteUserApplication).toHaveBeenCalled()
  })

  test('throws on delete error', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({id: 'id', appHost: 'host'} as any)
    vi.mocked(deleteUserApplication).mockRejectedValueOnce(new Error('fail'))

    await expect(
      undeployStudio({client, cliConfig: {studioHost: 'host'} as any, flags: {yes: true}, log})
    ).rejects.toThrow('fail')
  })
})
