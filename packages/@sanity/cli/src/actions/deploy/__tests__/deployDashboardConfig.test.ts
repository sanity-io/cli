import {type CliConfig, type Output} from '@sanity/cli-core'
import {defineDashboard} from '@sanity/workbench-cli'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type DeployFlags} from '../types.js'

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

const mockUploadDashboardConfig = vi.hoisted(() => vi.fn())
const mockGetOrganizationDashboard = vi.hoisted(() => vi.fn())
vi.mock('@sanity/workbench-cli/deploy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/workbench-cli/deploy')>()),
  getOrganizationDashboard: mockGetOrganizationDashboard,
  uploadDashboardConfig: mockUploadDashboardConfig,
}))
const mockVerifyOutputDir = vi.hoisted(() => vi.fn())
vi.mock('../deployChecks.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../deployChecks.js')>()),
  checkPackageVersion: vi.fn(() => Promise.resolve('5.0.0')),
  verifyOutputDir: mockVerifyOutputDir,
}))
vi.mock('../deploymentPlan.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../deploymentPlan.js')>()),
  listDeploymentFiles: vi.fn(() => Promise.resolve([])),
}))
const mockBuildApp = vi.hoisted(() => vi.fn(() => Promise.resolve({mfManifest: {}})))
vi.mock('../../build/buildApp.js', () => ({buildApp: mockBuildApp}))

const {deployDashboardConfig} = await import('../deployDashboardConfig.js')

const SUMMARY = 'Dashboard configuration: ./src/dashboard.ts'

function deploy(flags: Partial<DeployFlags>) {
  const output = {error: vi.fn(), log: vi.fn(), logJson: vi.fn(), warn: vi.fn()}
  const run = deployDashboardConfig({
    cliConfig: {app: {organizationId: 'org-1'}} as CliConfig,
    config: defineDashboard({organizationId: 'org-1', src: './src/dashboard.ts'}),
    flags: {build: true, 'dry-run': false, json: true, yes: true, ...flags} as DeployFlags,
    output: output as unknown as Output,
    projectRoot: {directory: '/project', path: '/project/sanity.cli.ts', type: 'app'},
    sourceDir: '/project/dist',
  })

  return run.then(() => output.logJson.mock.calls[0]?.[0])
}

describe('deployDashboardConfig', () => {
  beforeEach(() => {
    mockGetOrganizationDashboard.mockResolvedValue(undefined)
    mockUploadDashboardConfig.mockResolvedValue(undefined)
  })
  afterEach(() => vi.clearAllMocks())

  test('reports the dashboard configuration summary and target in the --dry-run --json plan without deploying', async () => {
    const json = await deploy({'dry-run': true})

    expect(json).toMatchObject({
      action: 'create',
      canDeploy: true,
      payload: {appId: null, config: SUMMARY, organizationId: 'org-1', version: '5.0.0'},
      url: 'https://org-1.sanity.run',
    })
    expect(mockUploadDashboardConfig).not.toHaveBeenCalled()
  })

  test('creates the dashboard configuration on a first deploy and reports it in the --json result', async () => {
    const json = await deploy({})

    expect(mockUploadDashboardConfig).toHaveBeenCalledWith({
      dashboard: undefined,
      organizationId: 'org-1',
      sourceDir: '/project/dist',
      version: '5.0.0',
    })
    expect(json).toMatchObject({
      action: 'create',
      application: null,
      deployed: true,
      payload: {config: SUMMARY},
    })
  })

  test('builds without auto-updates', async () => {
    await deploy({})

    expect(mockBuildApp).toHaveBeenCalledWith(
      expect.objectContaining({autoUpdatesEnabled: false, outDir: '/project/dist'}),
    )
    expect(mockVerifyOutputDir).not.toHaveBeenCalled()
  })

  test('validates the existing output directory with --no-build', async () => {
    await deploy({build: false})

    expect(mockBuildApp).not.toHaveBeenCalled()
    expect(mockVerifyOutputDir).toHaveBeenCalledWith(
      expect.objectContaining({isWorkbenchApp: true, sourceDir: '/project/dist'}),
    )
  })

  test('uploads to the existing Dashboard and reports action "update" in --json', async () => {
    mockGetOrganizationDashboard.mockResolvedValue({id: 'dash-1', organizationId: 'org-1'})

    const json = await deploy({})

    expect(mockUploadDashboardConfig).toHaveBeenCalledWith(
      expect.objectContaining({dashboard: {id: 'dash-1', organizationId: 'org-1'}}),
    )
    expect(json).toMatchObject({action: 'update'})
  })
})
