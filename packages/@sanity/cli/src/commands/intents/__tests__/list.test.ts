import {runCommand} from '@oclif/test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {mockApi} from '~test/helpers/mockApi.js'
import {testCommand} from '~test/helpers/testCommand.js'

import {getCliConfig} from '../../../config/cli/getCliConfig.js'
import {List} from '../list.js'

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

describe('#list', () => {
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
    const {stdout} = await runCommand(['intents list', '--help'])

    expect(stdout).toMatchSnapshot()
  })

  test('displays intents correctly', async () => {
    // Mock getDashboardStoreId call
    mockApi({
      apiVersion: 'vX',
      query: {organizationId: 'default-org'},
      uri: '/dashboards',
    }).reply(200, {
      data: [
        {
          id: 'dashboard-store-123',
          organizationId: 'default-org',
          status: 'active',
        },
      ],
    })

    // Mock queryDashboardStore call
    mockApi({
      apiVersion: 'vX',
      query: {query: `*[_type == "sanity.dashboard.intents"]`},
      uri: '/dashboards/dashboard-store-123/query',
    }).reply(200, {
      result: [
        {
          _system: {
            createdBy: 'user1',
          },
          _updatedAt: '2025-07-23T15:54:23Z',
          action: 'view' as const,
          applicationId: 'analytics-app',
          filters: [],
          id: 'viewProduct',
          title: 'View Product',
        },
        {
          _system: {
            createdBy: 'user2',
          },
          _updatedAt: '2025-07-23T15:54:52Z',
          action: 'edit' as const,
          applicationId: 'analytics-app',
          filters: [],
          id: 'editTag',
          title: 'Process Orders',
        },
      ],
    })

    const {stdout} = await testCommand(List)

    expect(stdout).toMatchSnapshot()
  })

  test('uses organization flag when provided', async () => {
    mockApi({
      apiVersion: 'vX',
      query: {organizationId: 'flag-org'},
      uri: '/dashboards',
    }).reply(200, {
      data: [
        {
          id: 'dashboard-store-456',
          organizationId: 'flag-org',
          status: 'active',
        },
      ],
    })

    mockApi({
      apiVersion: 'vX',
      query: {query: `*[_type == "sanity.dashboard.intents"]`},
      uri: '/dashboards/dashboard-store-456/query',
    }).reply(200, {
      result: [],
    })

    const {stdout} = await testCommand(List, ['--organization', 'flag-org'])

    expect(stdout).toContain('flag-org')
  })

  test('shows error when no organization ID is available', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({})

    const {error} = await testCommand(List)

    expect(error?.message).toContain(
      'Organization ID is required. Provide it via an --organization flag or set it in your sanity.cli.ts config file under the app.organizationId property.',
    )
  })

  test('shows message when no intents found', async () => {
    mockApi({
      apiVersion: 'vX',
      query: {organizationId: 'default-org'},
      uri: '/dashboards',
    }).reply(200, {
      data: [
        {
          id: 'dashboard-store-123',
          organizationId: 'default-org',
          status: 'active',
        },
      ],
    })
    mockApi({
      apiVersion: 'vX',
      query: {query: `*[_type == "sanity.dashboard.intents"]`},
      uri: '/dashboards/dashboard-store-123/query',
    }).reply(200, {
      result: [],
    })

    const {stdout} = await testCommand(List)

    expect(stdout).toContain('No intents found for organization default-org.')
  })
})
