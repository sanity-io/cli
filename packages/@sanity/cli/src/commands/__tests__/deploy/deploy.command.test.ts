import {confirm} from '@sanity/cli-core/ux'
import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {checkDir} from '../../../actions/deploy/checkDir.js'
import {extractAppManifest} from '../../../actions/manifest/extractAppManifest.js'
import {USER_APPLICATIONS_API_VERSION} from '../../../services/userApplications.js'
import {dirIsEmptyOrNonExistent} from '../../../util/dirIsEmptyOrNonExistent.js'
import {getLocalPackageVersion} from '../../../util/getLocalPackageVersion.js'
import {DeployCommand} from '../../deploy.js'

vi.mock('../../../util/getLocalPackageVersion.js')

vi.mock('../../../actions/build/buildApp.js', () => ({
  buildApp: vi.fn(),
}))

vi.mock('../../../actions/build/buildStudio.js', () => ({
  buildStudio: vi.fn(),
}))

vi.mock('../../../actions/deploy/checkDir.js', () => ({
  checkDir: vi.fn(),
}))

vi.mock('../../../actions/manifest/extractAppManifest.js', () => ({
  appManifestHasData: vi.fn(),
  extractAppManifest: vi.fn(),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
  }
})

vi.mock('../../../util/dirIsEmptyOrNonExistent.js', () => ({
  dirIsEmptyOrNonExistent: vi.fn(() => true),
}))

vi.mock('tar-fs', () => ({
  pack: vi.fn(() => {
    return {
      pipe: vi.fn(),
    }
  }),
}))

const mockConfirm = vi.mocked(confirm)
const mockCheckDir = vi.mocked(checkDir)
const mockDirIsEmptyOrNonExistent = vi.mocked(dirIsEmptyOrNonExistent)
const mockGetLocalPackageVersion = vi.mocked(getLocalPackageVersion)
const mockExtractAppManifest = vi.mocked(extractAppManifest)

const appId = 'app-id'
const organizationId = 'org-id'

const defaultMocks = {
  cliConfig: {
    app: {
      organizationId,
    },
    deployment: {
      appId,
    },
  },
}

describe('#deploy:command', () => {
  beforeEach(async () => {
    // Set up default mocks
    mockGetLocalPackageVersion.mockImplementation(async (moduleName) => {
      if (moduleName === 'sanity') return '3.0.0' // for studio deployments
      if (moduleName === '@sanity/sdk-react') return '1.0.0' // for app deployments
      return null
    })
    mockCheckDir.mockResolvedValue()
    // Default to empty manifest for app deployments
    mockExtractAppManifest.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(DeployCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  test("should prompt to confirm deleting source directory if it's not empty", async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    mockConfirm.mockResolvedValue(true)
    mockDirIsEmptyOrNonExistent.mockResolvedValue(false)

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      query: {
        appType: 'coreApp',
      },
      uri: `/user-applications/${appId}`,
    }).reply(200, {
      appHost: 'existing-host',
      createdAt: '2024-01-01T00:00:00Z',
      id: appId,
      organizationId: 'org-id',
      projectId: null,
      title: 'Existing App',
      type: 'coreApp',
      updatedAt: '2024-01-01T00:00:00Z',
      urlType: 'internal',
    })

    mockApi({
      apiVersion: USER_APPLICATIONS_API_VERSION,
      method: 'post',
      query: {
        appType: 'coreApp',
      },
      uri: `/user-applications/${appId}/deployments`,
    }).reply(201, {id: 'deployment-id'}, {location: 'https://existing-host.sanity.app/'})

    const {error} = await testCommand(DeployCommand, ['build'], {
      config: {root: cwd},
      mocks: defaultMocks,
    })

    if (error) throw error
    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message: '"./build" is not empty, do you want to proceed?',
    })
  })

  test("should cancel the deployment if the user doesn't want to proceed", async () => {
    const cwd = await testFixture('basic-app')
    process.cwd = () => cwd

    mockConfirm.mockResolvedValue(false)

    const {error} = await testCommand(DeployCommand, ['build'], {
      config: {root: cwd},
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Cancelled.')
    expect(error?.oclif?.exit).toBe(1)
  })
})
