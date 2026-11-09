import {type TelemetryEvent} from '@sanity/telemetry'
import {afterEach, expect, test, vi} from 'vitest'

import {sendEvents} from '../telemetry.js'

const {request} = vi.hoisted(() => ({request: vi.fn(async (_options: unknown) => undefined)}))
vi.mock('@sanity/cli-core', () => ({
  getCliToken: vi.fn(),
  getGlobalCliClient: vi.fn(async () => ({request})),
  getUserConfig: vi.fn(),
  subdebug: vi.fn(() => vi.fn()),
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

test.each(['pr0j1234', 'private input'])(
  'constructs a safe upload body with project attribution %s',
  async (projectId) => {
    vi.stubEnv('SANITY_TELEMETRY_PROJECT_ID', projectId)
    const event: TelemetryEvent = {
      context: {groupOrCommand: 'deploy', unknown: 'private input'},
      createdAt: '2026-10-14T00:00:00.000Z',
      data: {message: 'private input', name: 'TypeError'},
      name: 'CLI Command Executed',
      sessionId: 'session_01h3s55cezeqby0hf79brgdqj0',
      traceId: 'trace_01h3s55cezeqby0hf79brgdqj0',
      type: 'trace.error',
      version: 2,
    }
    await sendEvents([event])
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          batch: [
            expect.objectContaining({
              data: {message: 'CLI operation failed', name: 'TypeError'},
              redactionVersion: 1,
              source: 'cli',
              type: 'trace.error',
            }),
          ],
          projectId: projectId === 'pr0j1234' ? projectId : undefined,
        },
        method: 'POST',
        url: '/intake/batch',
      }),
    )
    expect(JSON.stringify(request.mock.calls)).not.toContain('private input')
  },
)
