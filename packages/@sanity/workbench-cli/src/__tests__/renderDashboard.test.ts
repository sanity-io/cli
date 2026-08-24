import {createInstance} from '@module-federation/runtime'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {renderDashboard} from '../renderDashboard.js'

const mockLoadRemote = vi.hoisted(() => vi.fn())

vi.mock('@module-federation/runtime', () => ({
  createInstance: vi.fn(() => ({loadRemote: mockLoadRemote})),
}))

describe('renderDashboard', () => {
  const config = {organizationId: 'org-123'}
  const rootElement = {} as HTMLElement
  const unmount = vi.fn()
  const render = vi.fn(() => unmount)

  beforeEach(() => {
    mockLoadRemote.mockResolvedValue({render})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    delete globalThis.__SANITY_STAGING__
  })

  test('loads and renders the deployed dashboard', async () => {
    const cleanup = await renderDashboard(rootElement, config, {reactStrictMode: true})

    expect(createInstance).toHaveBeenCalledWith({
      name: 'sanity-workbench',
      remotes: [
        {
          entry: 'https://workbench-apps-osyh1iet5.sanity.run/mf-manifest.json',
          name: 'workbench-remote',
        },
      ],
    })
    expect(mockLoadRemote).toHaveBeenCalledWith('workbench-remote/App')
    expect(render).toHaveBeenCalledWith(
      rootElement,
      {
        appConfigs: undefined,
        config: {organizationId: 'org-123'},
        localApplications: undefined,
      },
      {reactStrictMode: true},
    )

    cleanup()
    expect(unmount).toHaveBeenCalled()
  })

  test('uses the staging dashboard', async () => {
    globalThis.__SANITY_STAGING__ = true

    await renderDashboard(rootElement, config)

    expect(createInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        remotes: [
          expect.objectContaining({
            entry: 'https://workbench-apps-of5p8qpku.run.sanity.work/mf-manifest.json',
          }),
        ],
      }),
    )
  })

  test('uses a configured dashboard URL', async () => {
    vi.stubEnv('SANITY_INTERNAL_WORKBENCH_REMOTE_URL', 'http://localhost:5173/mf-manifest.json')

    await renderDashboard(rootElement, config)

    expect(createInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        remotes: [expect.objectContaining({entry: 'http://localhost:5173/mf-manifest.json'})],
      }),
    )
  })

  test('rejects a missing root element', async () => {
    await expect(renderDashboard(null, config)).rejects.toThrow(
      'Missing root element to mount application into',
    )
  })

  test('wraps remote loading errors', async () => {
    const cause = new Error('network failed')
    mockLoadRemote.mockRejectedValue(cause)

    await expect(renderDashboard(rootElement, config)).rejects.toMatchObject({
      cause,
      message: 'Failed to load remote module "workbench-remote/App"',
    })
  })

  test.each([null, {}, {render: 'nope'}])('rejects an invalid remote module', async (remote) => {
    mockLoadRemote.mockResolvedValue(remote)

    await expect(renderDashboard(rootElement, config)).rejects.toThrow(
      'Remote module "workbench-remote/App" did not expose a render function',
    )
  })
})
