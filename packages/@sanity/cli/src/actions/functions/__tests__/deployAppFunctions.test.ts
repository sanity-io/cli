import {join} from 'node:path'

import {createMockOutput} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {deployAppFunctions} from '../deployAppFunctions.js'

const mockDeployFunctions = vi.hoisted(() => vi.fn())
const mockTransport = vi.hoisted(() => vi.fn())

vi.mock('@sanity/runtime-cli/functions/deploy', () => ({deployFunctions: mockDeployFunctions}))
vi.mock('../../../services/appFunctionTransport.js', () => ({
  createAppFunctionTransport: mockTransport,
}))

const event = {dayOfMonth: '*', dayOfWeek: '*', hour: '9', minute: '0', month: '*'}
const manifest = {
  appId: 'app-1',
  environment: 'production' as const,
  functions: [
    {name: 'greet', type: 'pubsub' as const},
    {event, name: 'cleanup', timezone: 'UTC', type: 'cron' as const},
  ],
  organizationId: 'org-1',
  version: 1 as const,
}

beforeEach(() => {
  mockTransport.mockResolvedValue({fetchFn: vi.fn(), token: 'token'})
})

describe('deployAppFunctions', () => {
  test('passes each function trigger from the build manifest to the deploy', async () => {
    mockDeployFunctions.mockResolvedValue({success: true})

    await deployAppFunctions({
      manifest,
      output: createMockOutput(),
      stackId: 'stack-1',
      workDir: '/work',
    })

    expect(mockDeployFunctions).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-1',
        functions: [
          {name: 'greet', src: join('.sanity', 'functions', 'greet'), type: 'pubsub'},
          {
            event,
            name: 'cleanup',
            src: join('.sanity', 'functions', 'cleanup'),
            timezone: 'UTC',
            type: 'cron',
          },
        ],
        organizationId: 'org-1',
        stackId: 'stack-1',
      }),
    )
  })

  test('reports a failed deploy with the stack to inspect', async () => {
    mockDeployFunctions.mockResolvedValue({error: 'invalid schedule', success: false})

    await expect(
      deployAppFunctions({manifest, output: createMockOutput(), stackId: 'stack-1', workDir: '/w'}),
    ).rejects.toThrow('App function deployment: invalid schedule')
  })
})
