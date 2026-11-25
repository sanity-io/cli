import {writeFile} from 'node:fs/promises'
import {platform} from 'node:os'
import {join} from 'node:path'

import {exitCodes} from '@sanity/cli-core'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import {defineDashboard} from '@sanity/workbench-cli'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {DeployCommand} from '../../../src/commands/deploy.js'

const organizationId = 'org-id'
const cliConfig = {app: defineDashboard({organizationId, src: './src/dashboard.ts'})}
const dashboard = {
  createdAt: '2026-11-25T12:00:00.000Z',
  createdBy: 'user-1',
  id: 'dash-1',
  organizationId,
  updatedAt: '2026-11-25T12:00:00.000Z',
}

async function dashboardProject() {
  const cwd = await testFixture('basic-app')
  process.chdir(cwd)
  await writeFile(
    join(cwd, 'src', 'dashboard.ts'),
    `export default {views: (views: unknown[]) => views}\n`,
  )
  return cwd
}

function deploy(args: string[] = []) {
  return testCommand(DeployCommand, args, {
    mocks: {cliConfig, isInteractive: true, token: 'test-token'},
  })
}

function mockDashboards(data: (typeof dashboard)[]) {
  mockApi({apiVersion: 'vX', query: {organizationId}, uri: '/applications/dashboards'}).reply(200, {
    data,
    nextCursor: null,
  })
}

/** Answers the config upload and records the multipart body it received. */
function mockConfigUpload(status = 201) {
  const upload = {body: ''}
  mockApi({
    apiVersion: 'vX',
    method: 'post',
    uri: `/applications/dashboards/${dashboard.id}/configs`,
  }).reply(status, (_uri, body) => {
    // nock hex-encodes a body that isn't valid UTF-8, as the gzipped tarball part is.
    upload.body = Buffer.from(String(body), 'hex').toString('latin1')
    return status === 201 ? {dashboardId: dashboard.id, id: 'cfg-1', isActive: true} : {}
  })
  return upload
}

// Skipped on Windows for the same in-process federation reason as `build.studio.test.ts`.
describe.skipIf(platform() === 'win32')(
  '#deploy dashboard configuration',
  {timeout: 120 * 1000},
  () => {
    beforeEach(() => {
      vi.stubEnv('MFE_VITE_NO_TEST_ENV_CHECK', 'true')
      mockApi({uri: `/organizations/${organizationId}`})
        .optionally()
        .reply(200, {name: 'Acme'})
        .persist()
      mockApi({uri: '/users/me'}).optionally().reply(200, {name: 'Sam'}).persist()
    })

    afterEach(() => {
      vi.unstubAllEnvs()
      const pending = pendingMocks()
      cleanAll()
      expect(pending, 'pending mocks').toEqual([])
    })

    test('creates the organization Dashboard on a first deploy and uploads the built configuration', async () => {
      await dashboardProject()
      mockDashboards([])
      mockApi({apiVersion: 'vX', method: 'post', uri: '/applications/dashboards'}).reply(
        201,
        (_uri, body) => {
          expect(body).toStrictEqual({organizationId})
          return dashboard
        },
      )
      const upload = mockConfigUpload()

      const {error, stdout} = await deploy()

      if (error) throw error
      expect(upload.body).toMatch(/name="version"\r\n\r\n1\r\n/)
      expect(upload.body).toContain('filename="dashboard-config.tar.gz"')
      expect(stdout).toContain('Dashboard configuration deployed in')
      expect(stdout).toContain('Created Dashboard configuration.')
    })

    test('uploads to the existing Dashboard on a redeploy', async () => {
      await dashboardProject()
      mockDashboards([dashboard])
      const upload = mockConfigUpload()

      const {error, stdout} = await deploy()

      if (error) throw error
      expect(upload.body).toContain('filename="dashboard-config.tar.gz"')
      expect(stdout).toContain('Updated Dashboard configuration.')
    })

    test('removes the Dashboard it created when the upload fails', async () => {
      await dashboardProject()
      mockDashboards([])
      mockApi({apiVersion: 'vX', method: 'post', uri: '/applications/dashboards'}).reply(
        201,
        dashboard,
      )
      mockConfigUpload(500)
      mockApi({
        apiVersion: 'vX',
        method: 'delete',
        uri: `/applications/dashboards/${dashboard.id}`,
      }).reply(200, {deleted: true})

      const {error} = await deploy()

      expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
    })

    test('reports the plan with --dry-run --json and writes nothing', async () => {
      await dashboardProject()
      mockDashboards([])

      const {error, stdout} = await deploy(['--dry-run', '--json'])

      if (error) throw error
      const plan = JSON.parse(stdout)
      expect(plan).toMatchObject({
        action: 'create',
        canDeploy: true,
        url: 'https://org-id.sanity.run',
      })
      expect(plan.payload).toStrictEqual({
        appId: null,
        config: 'Dashboard configuration: ./src/dashboard.ts',
        isAutoUpdating: false,
        organizationId,
        type: 'coreApp',
        version: expect.any(String),
      })
    })
  },
)
