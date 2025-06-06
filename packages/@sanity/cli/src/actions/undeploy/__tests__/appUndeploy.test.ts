import {afterEach, describe, expect, test, vi} from 'vitest'

import {undeployApp} from '../appUndeploy.js'
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

describe('undeployApp', () => {
  test('exits if no app id', async () => {
    await undeployApp({client, cliConfig: {} as any, flags: {yes: true}, log})

    expect(log).toHaveBeenCalledWith('No application ID provided.')
  })

  test('exits if application does not exist', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce(null)

    await undeployApp({client, cliConfig: {app: {id: '123'}} as any, flags: {yes: true}, log})

    expect(log).toHaveBeenCalledWith('Application with the given ID does not exist.')
  })

  test('asks for confirmation', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({id: '123', appHost: 'h'} as any)
    const confirmMock = vi.mocked((await import('@inquirer/prompts')).confirm)
    confirmMock.mockResolvedValueOnce(false)

    await undeployApp({client, cliConfig: {app: {id: '123'}} as any, flags: {yes: false}, log})

    expect(confirmMock).toHaveBeenCalled()
    expect(deleteUserApplication).not.toHaveBeenCalled()
  })

  test('undeploys when confirmed', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({id: '123', appHost: 'h'} as any)
    const confirmMock = vi.mocked((await import('@inquirer/prompts')).confirm)
    confirmMock.mockResolvedValueOnce(true)

    await undeployApp({client, cliConfig: {app: {id: '123'}} as any, flags: {yes: false}, log})

    expect(deleteUserApplication).toHaveBeenCalled()
  })

  test('throws on delete error', async () => {
    vi.mocked(getUserApplication).mockResolvedValueOnce({id: '123', appHost: 'h'} as any)
    vi.mocked(deleteUserApplication).mockRejectedValueOnce(new Error('fail'))

    await expect(
      undeployApp({client, cliConfig: {app: {id: '123'}} as any, flags: {yes: true}, log})
    ).rejects.toThrow('fail')
  })
})
