import {Readable} from 'node:stream'

import FormData from 'form-data'
import {c as createTar} from 'tar'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type Dashboard} from '../../../services/dashboards.js'
import {uploadDashboardConfig} from '../uploadDashboardConfig.js'

const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getGlobalCliClient: vi.fn(async () => ({request: mockRequest})),
}))
vi.mock('tar', () => ({c: vi.fn(() => Readable.from(['tar']))}))

const dashboard: Dashboard = {id: 'dash-1'}

const sourceDir = '/project/dist'

describe('uploadDashboardConfig', () => {
  beforeEach(() => {
    mockRequest.mockImplementation(async ({method, url}: {method?: string; url: string}) =>
      method === 'POST' && url === '/applications/dashboards'
        ? dashboard
        : {dashboardId: dashboard.id, id: 'cfg-1', isActive: true, version: '5.0.0'},
    )
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  test("creates the organization's Dashboard on a first deploy, then uploads the config to it", async () => {
    const append = vi.spyOn(FormData.prototype, 'append')
    await uploadDashboardConfig({
      dashboard: undefined,
      organizationId: 'org-1',
      sourceDir,
      version: '5.0.0',
    })

    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      body: {organizationId: 'org-1'},
      method: 'POST',
      url: '/applications/dashboards',
    })
    expect(mockRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({method: 'POST', url: '/applications/dashboards/dash-1/configs'}),
    )
    expect(append.mock.calls.map(([name, , options]) => [name, options])).toStrictEqual([
      ['version', undefined],
      ['tarball', {contentType: 'application/gzip', filename: 'dashboard-config.tar.gz'}],
    ])
    expect(append.mock.calls[0][1]).toBe('5.0.0')
    expect(createTar).toHaveBeenCalledWith({cwd: '/project'}, ['dist'])
  })

  test('removes the Dashboard it created when the config upload fails', async () => {
    const uploadError = new Error('upload failed')
    mockRequest.mockImplementation(async ({method, url}: {method?: string; url: string}) => {
      if (method === 'POST' && url === '/applications/dashboards') return dashboard
      if (method === 'POST') throw uploadError
      return {deleted: true}
    })

    await expect(
      uploadDashboardConfig({
        dashboard: undefined,
        organizationId: 'org-1',
        sourceDir,
        version: '5.0.0',
      }),
    ).rejects.toBe(uploadError)

    expect(mockRequest).toHaveBeenLastCalledWith({
      method: 'DELETE',
      url: '/applications/dashboards/dash-1',
    })
  })

  test('keeps an existing Dashboard when the config upload fails', async () => {
    mockRequest.mockRejectedValue(new Error('upload failed'))

    await expect(
      uploadDashboardConfig({
        dashboard,
        organizationId: 'org-1',
        sourceDir,
        version: '5.0.0',
      }),
    ).rejects.toThrow('upload failed')

    expect(mockRequest).not.toHaveBeenCalledWith(expect.objectContaining({method: 'DELETE'}))
  })

  test('uploads to the existing Dashboard without creating another', async () => {
    await uploadDashboardConfig({
      dashboard,
      organizationId: 'org-1',
      sourceDir,
      version: '5.0.0',
    })

    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({url: '/applications/dashboards/dash-1/configs'}),
    )
  })
})
