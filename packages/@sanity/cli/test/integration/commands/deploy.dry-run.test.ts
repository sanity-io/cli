import {studioWorkerTask} from '@sanity/cli-core'
import {testCommand, testFixture} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {buildApp} from '../../../src/actions/build/buildApp.js'
import {buildStudio} from '../../../src/actions/build/buildStudio.js'
import {checkDir} from '../../../src/actions/deploy/checkDir.js'
import {type DryRunReport} from '../../../src/actions/deploy/dryRunReport.js'
import {extractCoreAppManifest} from '../../../src/actions/manifest/extractCoreAppManifest.js'
import {DeployCommand} from '../../../src/commands/deploy.js'
import {
  coreApplication,
  createDistFiles,
  mockGetCoreApp,
  mockGetStudioAppByHost,
  mockListCoreApps,
  studioApplication,
} from './deployTestHelpers.js'

const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getLocalPackageVersion: mockGetLocalPackageVersion,
    studioWorkerTask: vi.fn(),
  }
})

vi.mock('../../../src/actions/build/buildStudio.js', () => ({
  buildStudio: vi.fn(),
}))

vi.mock('../../../src/actions/build/buildApp.js', () => ({
  buildApp: vi.fn(),
}))

vi.mock('../../../src/actions/deploy/checkDir.js', () => ({
  checkDir: vi.fn(),
}))

vi.mock('../../../src/actions/manifest/extractCoreAppManifest.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/actions/manifest/extractCoreAppManifest.js')>()
  return {
    ...actual,
    extractCoreAppManifest: vi.fn(),
  }
})

const mockStudioWorkerTask = vi.mocked(studioWorkerTask)
const mockCheckDir = vi.mocked(checkDir)
const mockBuildStudio = vi.mocked(buildStudio)
const mockBuildApp = vi.mocked(buildApp)
const mockExtractAppManifest = vi.mocked(extractCoreAppManifest)

const projectId = 'test-project-id'
const studioHost = 'existing-studio'
const studioAppId = 'studio-app-id'

function getCheck(report: DryRunReport | undefined, name: string) {
  return report?.checks.find((check) => check.name === name)
}

describe('#deploy dry run', () => {
  beforeEach(() => {
    mockGetLocalPackageVersion.mockImplementation(async (moduleName) => {
      if (moduleName === 'sanity') return '3.0.0'
      if (moduleName === '@sanity/sdk-react') return '1.0.0'
      return null
    })
    mockCheckDir.mockResolvedValue()
    mockExtractAppManifest.mockResolvedValue(undefined)
    mockStudioWorkerTask.mockResolvedValue({
      studioManifest: null,
      type: 'success',
      workspaces: [{dataset: 'production', name: 'default', projectId, schemaTypes: 12}],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    process.exitCode = 0
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  describe('studio', () => {
    test('reports deployable and lists files for an existing studio', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd
      await createDistFiles(cwd)

      mockGetStudioAppByHost({appHost: studioHost, projectId}).reply(
        200,
        studioApplication({
          appHost: studioHost,
          id: studioAppId,
          projectId,
          title: 'Existing Studio',
        }),
      )

      const {error, result, stdout} = await testCommand(DeployCommand, ['--dry-run'], {
        config: {root: cwd},
        mocks: {cliConfig: {api: {projectId}, studioHost}},
      })

      if (error) throw error
      const report = result as DryRunReport

      expect(report.deployable).toBe(true)
      expect(report.dryRun).toBe(true)
      expect(getCheck(report, 'sanity-version')?.status).toBe('pass')
      expect(getCheck(report, 'project-id')?.status).toBe('pass')
      expect(getCheck(report, 'target')).toMatchObject({
        message: `Deploys to existing studio https://${studioHost}.sanity.studio`,
        status: 'pass',
      })
      expect(getCheck(report, 'build')?.status).toBe('pass')
      expect(getCheck(report, 'schema')).toMatchObject({
        message: 'Schema valid (1 workspace, 12 types)',
        status: 'pass',
      })
      expect(getCheck(report, 'output-dir')?.status).toBe('pass')

      expect(report.target).toEqual({
        appId: studioAppId,
        exists: true,
        host: studioHost,
        type: 'studio',
      })
      expect(report.files).toEqual({
        count: 2,
        list: [
          {path: 'index.html', size: 13},
          {path: 'static/app.js', size: 14},
        ],
        totalBytes: 27,
      })

      // No deployment.appId configured, so the report should nudge towards it
      expect(getCheck(report, 'app-id-config')).toMatchObject({status: 'warn'})

      // The build runs, but nothing is uploaded (any POST would fail the pending-mocks check)
      expect(mockBuildStudio).toHaveBeenCalledTimes(1)
      expect(mockBuildStudio).toHaveBeenCalledWith(
        expect.objectContaining({flags: expect.objectContaining({yes: true})}),
      )
      expect(mockStudioWorkerTask).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({workerData: expect.objectContaining({dryRun: true})}),
      )

      expect(stdout).toContain('Ready to deploy')
      expect(process.exitCode ?? 0).toBe(0)
    })

    test('reports the hostname that would be created when it does not exist yet', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd
      await createDistFiles(cwd)

      mockGetStudioAppByHost({appHost: 'new-studio', projectId}).reply(404, {message: 'Not found'})

      const {error, result} = await testCommand(DeployCommand, ['--dry-run'], {
        config: {root: cwd},
        mocks: {cliConfig: {api: {projectId}, studioHost: 'new-studio'}},
      })

      if (error) throw error
      const report = result as DryRunReport

      expect(report.deployable).toBe(true)
      expect(getCheck(report, 'target')?.status).toBe('pass')
      expect(getCheck(report, 'target')?.message).toContain(
        'Would create studio hostname https://new-studio.sanity.studio',
      )
      expect(report.target).toEqual({
        appId: null,
        exists: false,
        host: 'new-studio',
        type: 'studio',
      })
    })

    test('aggregates all failures and exits non-zero', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      mockStudioWorkerTask.mockResolvedValue({
        error: 'Schema extraction failed',
        type: 'error',
        validation: [],
      })
      mockCheckDir.mockRejectedValue(new Error('Directory "dist" does not exist'))

      const {error, result, stdout} = await testCommand(DeployCommand, ['--dry-run'], {
        config: {root: cwd},
        // No projectId and no studioHost: target cannot resolve, deploy would prompt
        mocks: {cliConfig: {}},
      })

      if (error) throw error
      const report = result as DryRunReport

      expect(report.deployable).toBe(false)
      expect(getCheck(report, 'project-id')?.status).toBe('fail')
      expect(getCheck(report, 'target')?.status).toBe('fail')
      expect(getCheck(report, 'schema')?.status).toBe('fail')
      expect(getCheck(report, 'output-dir')?.status).toBe('fail')
      expect(report.files).toBeNull()

      expect(stdout).toContain('Not deployable')
      expect(process.exitCode).toBe(2)
    })

    test('emits a machine-readable report with --json', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd
      await createDistFiles(cwd)

      mockGetStudioAppByHost({appHost: studioHost, projectId}).reply(
        200,
        studioApplication({
          appHost: studioHost,
          id: studioAppId,
          projectId,
          title: 'Existing Studio',
        }),
      )

      const {error, stdout} = await testCommand(DeployCommand, ['--dry-run', '--json'], {
        config: {root: cwd},
        mocks: {cliConfig: {api: {projectId}, studioHost}},
      })

      if (error) throw error
      const parsed = JSON.parse(stdout)

      expect(parsed.deployable).toBe(true)
      expect(parsed.dryRun).toBe(true)
      expect(Array.isArray(parsed.checks)).toBe(true)
      expect(parsed.files.count).toBe(2)
      expect(parsed.target.appId).toBe(studioAppId)
    })
  })

  describe('app', () => {
    const appId = 'app-id'
    const organizationId = 'org-id'

    test('reports deployable for an existing application', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd
      await createDistFiles(cwd)

      mockExtractAppManifest.mockResolvedValue({title: 'New Title', version: '1'})

      mockGetCoreApp({appId}).reply(
        200,
        coreApplication({
          appHost: 'existing-host',
          id: appId,
          organizationId,
          projectId: null,
          title: 'Existing App',
        }),
      )

      const {error, result} = await testCommand(DeployCommand, ['--dry-run'], {
        config: {root: cwd},
        mocks: {cliConfig: {app: {organizationId}, deployment: {appId}}},
      })

      if (error) throw error
      const report = result as DryRunReport

      expect(report.deployable).toBe(true)
      expect(getCheck(report, 'sdk-version')?.status).toBe('pass')
      expect(getCheck(report, 'organization-id')?.status).toBe('pass')
      expect(getCheck(report, 'target')).toMatchObject({
        message: 'Deploys to existing application "Existing App"',
        status: 'pass',
      })
      // Title differs from the manifest: a real deploy would sync it
      expect(getCheck(report, 'app-manifest')).toMatchObject({
        message: 'Would update application title from "Existing App" to "New Title"',
        status: 'pass',
      })
      expect(report.target).toEqual({
        appId,
        exists: true,
        host: 'existing-host',
        type: 'coreApp',
      })
      expect(report.files?.count).toBe(2)

      // The build runs, but nothing is uploaded or updated
      // (any POST or PATCH would fail the pending-mocks check)
      expect(mockBuildApp).toHaveBeenCalledTimes(1)
    })

    test('fails the target check when no appId is configured and applications exist', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd
      await createDistFiles(cwd)

      mockListCoreApps({organizationId}).reply(200, [
        coreApplication({
          appHost: 'existing-host',
          id: 'other-app-id',
          organizationId,
          projectId: null,
          title: 'Existing App',
        }),
      ])

      const {error, result} = await testCommand(DeployCommand, ['--dry-run'], {
        config: {root: cwd},
        mocks: {cliConfig: {app: {organizationId}}},
      })

      if (error) throw error
      const report = result as DryRunReport

      expect(report.deployable).toBe(false)
      expect(getCheck(report, 'target')).toMatchObject({status: 'fail'})
      expect(getCheck(report, 'target')?.message).toContain('deploy would prompt')
      expect(report.target).toBeNull()
      expect(process.exitCode).toBe(2)
    })
  })
})
