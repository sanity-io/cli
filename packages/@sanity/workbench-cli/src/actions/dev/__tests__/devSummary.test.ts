import {getGlobalCliClient} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  type DevSummaryDetails,
  fetchDevSummaryDetails,
  waitForDevSummaryDetails,
} from '../devSummary.js'

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
const app = {idOrSlug: 'test-app', organizationId: 'org-123'}
const HANG = Symbol('hang')

const httpError = (statusCode: number) => Object.assign(new Error('Failed'), {statusCode})

const mockRequest = vi.fn(
  async ({query, signal, url}: {query?: {include?: string}; signal?: AbortSignal; url: string}) => {
    const key = query?.include ? `${url}?include=${query.include}` : url
    const response = key in responses ? responses[key] : httpError(404)
    if (response instanceof Error) throw response
    if (response === HANG) {
      return new Promise((_, reject) => {
        signal?.throwIfAborted()
        signal?.addEventListener('abort', () => reject(signal.reason))
      })
    }

    return response
  },
)

beforeEach(() => {
  responses = {...defaultResponses}
  vi.mocked(getGlobalCliClient).mockResolvedValue({request: mockRequest} as never)
  mockSpin.start.mockReturnValue(mockSpin)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('fetchDevSummaryDetails', () => {
  test('resolves the organization name and the deployer of the active deployment', async () => {
    await expect(fetchDevSummaryDetails(app)).resolves.toEqual({
      deployment: {createdAt: '2026-05-12T10:00:00.000Z', deployedBy: 'Jules'},
      organizationName: 'Acme',
    })
  })

  test('reports an app without an active deployment as not deployed', async () => {
    responses['/organizations/org-123/applications/test-app?include=activeDeployment'] = {
      activeDeployment: null,
    }

    const details = await fetchDevSummaryDetails(app)

    expect(details.deployment).toBeNull()
  })

  test('reports an app that was never created as not deployed', async () => {
    const details = await fetchDevSummaryDetails({...app, idOrSlug: 'new-app'})

    expect(details.deployment).toBeNull()
  })

  test('keeps the deployment without a deployer when the user lookup fails', async () => {
    responses['/users/user-1'] = httpError(403)

    const details = await fetchDevSummaryDetails(app)

    expect(details.deployment).toEqual({createdAt: '2026-05-12T10:00:00.000Z', deployedBy: null})
  })

  test('leaves the deployment unknown, not undeployed, when the app lookup fails', async () => {
    responses['/organizations/org-123/applications/test-app?include=activeDeployment'] =
      httpError(500)

    await expect(fetchDevSummaryDetails(app)).resolves.toEqual({
      deployment: undefined,
      organizationName: 'Acme',
    })
  })

  describe('when a lookup outlasts the 3s deadline', () => {
    const deployment = {createdAt: '2026-05-12T10:00:00.000Z', deployedBy: 'Jules'}

    test.each([
      ['the organization', '/organizations/org-123', {deployment, organizationName: null}],
      [
        'the app',
        '/organizations/org-123/applications/test-app?include=activeDeployment',
        {deployment: undefined, organizationName: 'Acme'},
      ],
      [
        'the deployer',
        '/users/user-1',
        {deployment: {...deployment, deployedBy: null}, organizationName: 'Acme'},
      ],
    ])('drops only %s', async (_, key, expected) => {
      const deadline = new AbortController()
      vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
      responses[key] = HANG

      const details = fetchDevSummaryDetails(app)
      await vi.waitFor(() =>
        expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({url: key.split('?')[0]})),
      )
      deadline.abort()

      await expect(details).resolves.toEqual(expected)
      expect(AbortSignal.timeout).toHaveBeenCalledWith(3000)
    })
  })

  test('resolves no details when the client cannot be created', async () => {
    vi.mocked(getGlobalCliClient).mockRejectedValue(new Error('You must login first'))

    await expect(fetchDevSummaryDetails(app)).resolves.toEqual({
      deployment: undefined,
      organizationName: null,
    })
  })

  test('skips the deployment lookup without an app id or slug', async () => {
    const details = await fetchDevSummaryDetails({organizationId: 'org-123'})

    expect(details).toEqual({deployment: undefined, organizationName: 'Acme'})
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })
})

describe('waitForDevSummaryDetails', () => {
  test('returns details that already arrived without a spinner', async () => {
    const details = await waitForDevSummaryDetails(Promise.resolve({organizationName: 'Acme'}))

    expect(details).toEqual({organizationName: 'Acme'})
    expect(spinner).not.toHaveBeenCalled()
  })

  test('shows a spinner until pending details arrive', async () => {
    let resolve!: (details: DevSummaryDetails) => void
    const promise = new Promise<DevSummaryDetails>((done) => (resolve = done))

    const waiting = waitForDevSummaryDetails(promise)
    await new Promise((done) => setImmediate(done))
    expect(mockSpin.start).toHaveBeenCalled()

    resolve({organizationName: 'Acme'})

    await expect(waiting).resolves.toEqual({organizationName: 'Acme'})
    expect(mockSpin.stop).toHaveBeenCalled()
  })
})
