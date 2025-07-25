import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {mockApi} from '~test/helpers/mockApi.js'
import {testCommand} from '~test/helpers/testCommand.js'

import {getCliConfig} from '../../../config/cli/getCliConfig.js'
import {Detail} from '../detail.js'

vi.mock(import('../../../config/findProjectRoot.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock(import('../../../config/cli/getCliConfig.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCliConfig: vi.fn().mockResolvedValue({
      app: {
        organizationId: 'default-org',
      },
    }),
  }
})

describe('#detail', () => {
  let originalToLocaleString: typeof Date.prototype.toLocaleString

  beforeEach(() => {
    // Mock toLocaleString to return consistent formatting for snapshot tests
    originalToLocaleString = Date.prototype.toLocaleString
    Date.prototype.toLocaleString = vi.fn().mockImplementation(function (this: Date) {
      // Return consistent US locale formatting to match existing snapshots
      return originalToLocaleString.call(this, 'en-US', {timeZone: 'America/New_York'})
    })
  })

  afterEach(() => {
    // Restore original toLocaleString
    Date.prototype.toLocaleString = originalToLocaleString
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['intents detail', '--help'])

    expect(stdout).toMatchSnapshot()
  })

  test('displays intent details correctly', async () => {
    mockApi({
      apiVersion: 'vX',
      query: {organizationId: 'test-org'},
      uri: '/dashboards',
    }).reply(200, {
      data: [
        {
          id: 'dashboard-store-123',
          organizationId: 'test-org',
          status: 'active',
        },
      ],
    })

    mockApi({
      apiVersion: 'vX',
      query: {query: `*[_type == "sanity.dashboard.intents" && id == "viewProduct"][0]`},
      uri: '/dashboards/dashboard-store-123/query',
    }).reply(200, {
      result: {
        _system: {
          createdBy: 'user1',
        },
        _updatedAt: '2025-07-23T15:54:23Z',
        action: 'view' as const,
        applicationId: 'analytics-app',
        description: 'View product details',
        filters: [
          {
            dataset: 'production',
            projectId: 'test-project',
          },
        ],
        id: 'viewProduct',
        title: 'View Product',
      },
    })

    const {stdout} = await testCommand(Detail, ['viewProduct', '--organization', 'test-org'])

    expect(stdout).toMatchSnapshot()
  })

  test('shows error when no organization ID is available', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({})

    const {error} = await testCommand(Detail, ['viewProduct'])

    expect(error?.message).toContain(
      'Organization ID is required. Provide it via an --organization flag or set it in your sanity.cli.ts config file under the app.organizationId property.',
    )
  })

  test('displays intent with multiple filters correctly', async () => {
    mockApi({
      apiVersion: 'vX',
      query: {organizationId: 'test-org'},
      uri: '/dashboards',
    }).reply(200, {
      data: [
        {
          id: 'dashboard-store-123',
          organizationId: 'test-org',
          status: 'active',
        },
      ],
    })

    mockApi({
      apiVersion: 'vX',
      query: {query: `*[_type == "sanity.dashboard.intents" && id == "editTag"][0]`},
      uri: '/dashboards/dashboard-store-123/query',
    }).reply(200, {
      result: {
        _system: {
          createdBy: 'user2',
        },
        _updatedAt: '2025-07-23T15:54:52Z',
        action: 'create' as const,
        applicationId: 'analytics-app',
        description: 'Create new documents with default values',
        filters: [
          {
            dataset: 'development',
            projectId: 'test-project',
            types: ['product', 'article', 'user'],
          },
          {
            dataset: 'production',
            projectId: 'test-project-2',
          },
        ],
        id: 'editTag',
        title: 'Create Product',
      },
    })

    const {stdout} = await testCommand(Detail, ['editTag', '--organization', 'test-org'])

    expect(stdout).toMatchSnapshot()
  })

  test('displays intent without description correctly', async () => {
    // Mock getDashboardStoreId call
    mockApi({
      apiVersion: 'vX',
      query: {organizationId: 'test-org'},
      uri: '/dashboards',
    }).reply(200, {
      data: [
        {
          id: 'dashboard-store-123',
          organizationId: 'test-org',
          status: 'active',
        },
      ],
    })

    mockApi({
      apiVersion: 'vX',
      query: {query: `*[_type == "sanity.dashboard.intents" && id == "simpleIntent"][0]`},
      uri: '/dashboards/dashboard-store-123/query',
    }).reply(200, {
      result: {
        _system: {
          createdBy: 'user1',
        },
        _updatedAt: '2025-07-23T15:54:23Z',
        action: 'create' as const,
        applicationId: 'simple-app',
        filters: [],
        id: 'simpleIntent',
        title: 'Simple Intent',
      },
    })

    const {stdout} = await testCommand(Detail, ['simpleIntent', '--organization', 'test-org'])

    expect(stdout).toMatchSnapshot()
  })

  test('shows message when intent not found', async () => {
    mockApi({
      apiVersion: 'vX',
      query: {organizationId: 'test-org'},
      uri: '/dashboards',
    }).reply(200, {
      data: [
        {
          id: 'dashboard-store-123',
          organizationId: 'test-org',
          status: 'active',
        },
      ],
    })

    mockApi({
      apiVersion: 'vX',
      query: {query: `*[_type == "sanity.dashboard.intents" && id == "nonexistent"][0]`},
      uri: '/dashboards/dashboard-store-123/query',
    }).reply(200, {
      result: null, // result of [0] on empty array
    })

    const {stdout} = await testCommand(Detail, ['nonexistent', '--organization', 'test-org'])

    expect(stdout).toContain('No intent found with ID: "nonexistent" for organization test-org.')
  })
})
