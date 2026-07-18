import {type CliConfig, type Output} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  updateUserApplication,
  type UserApplicationResolved,
} from '../../../services/userApplications.js'
import {type CoreAppManifest} from '../../manifest/types.js'
import {logAppDeployed, syncApplicationMetadata} from '../deployApp.js'

vi.mock('../../../services/userApplications.js', () => ({
  createDeployment: vi.fn(),
  updateUserApplication: vi.fn(),
}))
vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

const mockOutput = () => ({log: vi.fn(), warn: vi.fn()}) as unknown as Output

describe('logAppDeployed', () => {
  test("updating prints the dashboard URL from the deployed app's organization", () => {
    const output = mockOutput()

    logAppDeployed({
      applicationId: 'app-1',
      cliConfig: {app: {organizationId: 'config-org'}, deployment: {appId: 'app-1'}} as CliConfig,
      created: false,
      organizationId: 'org-1',
      output,
      title: 'My App',
    })

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Success! Application deployed to'),
    )
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Updated the existing application.'),
    )
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('/@org-1/application/app-1'))
  })

  test('creating without an appId warns that a redeploy creates another application', () => {
    const output = mockOutput()

    logAppDeployed({
      applicationId: 'app-2',
      cliConfig: {app: {organizationId: 'org-1'}} as CliConfig,
      created: true,
      organizationId: 'org-1',
      output,
      title: 'New App',
    })

    const logged = vi
      .mocked(output.log)
      .mock.calls.map((call) => call[0])
      .join('\n')
    expect(logged).toContain('Created a new application.')
    expect(logged).toContain('creates another new application')
    expect(logged).toContain("appId: 'app-2'")
  })
})

describe('syncApplicationMetadata', () => {
  const baseApp = {
    dashboardStatus: 'default',
    id: 'app-1',
    organizationId: 'org-1',
    title: 'My App',
    type: 'coreApp',
  } as UserApplicationResolved

  afterEach(() => vi.clearAllMocks())

  test('does not PATCH when nothing changed', async () => {
    const result = await syncApplicationMetadata({
      application: baseApp,
      manifest: undefined,
      output: mockOutput(),
      visibility: 'default',
    })

    expect(updateUserApplication).not.toHaveBeenCalled()
    expect(result).toBe(baseApp)
  })

  test('treats an unset dashboardStatus as default, so visibility "default" is a no-op', async () => {
    await syncApplicationMetadata({
      application: {...baseApp, dashboardStatus: undefined} as UserApplicationResolved,
      manifest: undefined,
      output: mockOutput(),
      visibility: 'default',
    })

    expect(updateUserApplication).not.toHaveBeenCalled()
  })

  test('PATCHes only dashboardStatus when visibility changed', async () => {
    vi.mocked(updateUserApplication).mockResolvedValue({...baseApp, dashboardStatus: 'unlisted'})

    await syncApplicationMetadata({
      application: baseApp,
      manifest: undefined,
      output: mockOutput(),
      visibility: 'unlisted',
    })

    expect(updateUserApplication).toHaveBeenCalledWith({
      applicationId: 'app-1',
      appType: 'coreApp',
      body: {dashboardStatus: 'unlisted'},
    })
  })

  test('PATCHes only title when the manifest title changed', async () => {
    vi.mocked(updateUserApplication).mockResolvedValue({...baseApp, title: 'Renamed'})

    await syncApplicationMetadata({
      application: baseApp,
      manifest: {title: 'Renamed', version: '1'} as CoreAppManifest,
      output: mockOutput(),
      visibility: undefined,
    })

    expect(updateUserApplication).toHaveBeenCalledWith({
      applicationId: 'app-1',
      appType: 'coreApp',
      body: {title: 'Renamed'},
    })
  })

  test('PATCHes both title and dashboardStatus in one call when both changed', async () => {
    vi.mocked(updateUserApplication).mockResolvedValue({
      ...baseApp,
      dashboardStatus: 'unlisted',
      title: 'Renamed',
    })

    await syncApplicationMetadata({
      application: baseApp,
      manifest: {title: 'Renamed', version: '1'} as CoreAppManifest,
      output: mockOutput(),
      visibility: 'unlisted',
    })

    expect(updateUserApplication).toHaveBeenCalledTimes(1)
    expect(updateUserApplication).toHaveBeenCalledWith({
      applicationId: 'app-1',
      appType: 'coreApp',
      body: {dashboardStatus: 'unlisted', title: 'Renamed'},
    })
  })
})
