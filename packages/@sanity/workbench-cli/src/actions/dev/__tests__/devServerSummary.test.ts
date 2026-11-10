import {styleText} from 'node:util'

import {getGlobalCliClient} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type DevServerDetails,
  fetchDevServerDetails,
  waitForDevServerDetails,
} from '../devServerSummary.js'
import {mediaLibraryCliConfig, workbenchApp, workbenchCliConfig} from './devTestHelpers.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => ({
  ...(await importOriginal()),
  getGlobalCliClient: vi.fn(),
}))

const mockSpin = vi.hoisted(() => ({start: vi.fn(), stop: vi.fn()}))
vi.mock('@sanity/cli-core/ux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
  spinner: vi.fn(() => mockSpin),
}))

const defaultResponses: Record<string, unknown> = {
  '/organizations/org-123': {name: 'Acme'},
  '/organizations/org-123/applications/test-app?include=activeDeployment': {
    activeDeployment: {createdAt: '2026-05-12T10:00:00.000Z', deployedBy: 'user-1'},
  },
  '/users/user-1': {displayName: 'Jules'},
}
let responses: Record<string, unknown>

const httpError = (statusCode: number) => Object.assign(new Error('Failed'), {statusCode})

const mockRequest = vi.fn(async ({query, url}: {query?: {include?: string}; url: string}) => {
  const key = query?.include ? `${url}?include=${query.include}` : url
  const response = key in responses ? responses[key] : httpError(404)
  if (response instanceof Error) throw response

  return response
})

beforeEach(() => {
  responses = {...defaultResponses}
  vi.mocked(getGlobalCliClient).mockResolvedValue({request: mockRequest} as never)
  mockSpin.start.mockReturnValue(mockSpin)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('fetchDevServerDetails', () => {
  test('resolves the organization name and the deployer of the active deployment', async () => {
    await expect(fetchDevServerDetails(workbenchCliConfig())).resolves.toEqual({
      organizationName: 'Acme',
      version: `local preview ${styleText('dim', '· deployed May 12, 2026 by Jules')}`,
    })
  })

  test('looks the app up by deployment.appId over its slug', async () => {
    await fetchDevServerDetails(workbenchCliConfig({deployment: {appId: 'app-id'}}))

    expect(mockRequest).toHaveBeenCalledWith({
      query: {include: 'activeDeployment'},
      url: '/organizations/org-123/applications/app-id',
    })
  })

  test('reports an app without an active deployment as not deployed', async () => {
    responses['/organizations/org-123/applications/test-app?include=activeDeployment'] = {
      activeDeployment: null,
    }

    const details = await fetchDevServerDetails(workbenchCliConfig())

    expect(details.version).toBe(`local preview ${styleText('dim', '· not deployed')}`)
  })

  test('reports an app that was never created as not deployed', async () => {
    const details = await fetchDevServerDetails(
      workbenchCliConfig({app: workbenchApp({slug: 'new-app'})}),
    )

    expect(details.version).toBe(`local preview ${styleText('dim', '· not deployed')}`)
  })

  test('shows the deploy date alone when the deployer cannot be looked up', async () => {
    responses['/users/user-1'] = httpError(403)

    const details = await fetchDevServerDetails(workbenchCliConfig())

    expect(details.version).toBe(`local preview ${styleText('dim', '· deployed May 12, 2026')}`)
  })

  test('drops the version row, not marks it undeployed, when the app lookup fails', async () => {
    responses['/organizations/org-123/applications/test-app?include=activeDeployment'] =
      httpError(500)

    await expect(fetchDevServerDetails(workbenchCliConfig())).resolves.toEqual({
      organizationName: 'Acme',
      version: undefined,
    })
  })

  test('resolves no details when the client cannot be created', async () => {
    vi.mocked(getGlobalCliClient).mockRejectedValue(new Error('You must login first'))

    await expect(fetchDevServerDetails(workbenchCliConfig())).resolves.toEqual({})
  })

  test('skips the deployment lookup for a media library config', async () => {
    const details = await fetchDevServerDetails(mediaLibraryCliConfig())

    expect(details).toEqual({organizationName: 'Acme', version: undefined})
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })
})

describe('waitForDevServerDetails', () => {
  test('returns details that already arrived without a spinner', async () => {
    const details = await waitForDevServerDetails(Promise.resolve({organizationName: 'Acme'}))

    expect(details).toEqual({organizationName: 'Acme'})
    expect(spinner).not.toHaveBeenCalled()
  })

  test('shows a spinner until pending details arrive', async () => {
    let resolve!: (details: DevServerDetails) => void
    const promise = new Promise<DevServerDetails>((done) => (resolve = done))

    const waiting = waitForDevServerDetails(promise)
    await new Promise((done) => setImmediate(done))
    expect(mockSpin.start).toHaveBeenCalled()

    resolve({organizationName: 'Acme'})

    await expect(waiting).resolves.toEqual({organizationName: 'Acme'})
    expect(mockSpin.stop).toHaveBeenCalled()
  })

  test('gives up on details that never arrive', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'setImmediate']})
    try {
      const waiting = waitForDevServerDetails(new Promise(() => {}))
      await vi.runAllTimersAsync()

      await expect(waiting).resolves.toEqual({})
      expect(mockSpin.stop).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
