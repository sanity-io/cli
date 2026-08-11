import {Output} from '@sanity/cli-core'
import {runWithCliExecutionContext} from '@sanity/cli-core/executionContext'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {warnAboutMissingAppId} from '../warnAboutMissingAppId'

describe('warnAboutMissingAppId', () => {
  const mockOutput = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('should log the expected warning when called', () => {
    warnAboutMissingAppId({
      appType: 'studio',
      output: mockOutput,
      projectId: 'project-id',
    })

    expect(mockOutput.warn).toBeCalledWith(expect.stringContaining('No appId configured'))
    expect(mockOutput.warn).toBeCalledWith(
      expect.stringContaining('https://www.sanity.io/manage/project/project-id/studios'),
    )
  })

  test('should be resilient to missing project IDs', () => {
    warnAboutMissingAppId({
      appType: 'app',
      output: mockOutput,
    })

    expect(mockOutput.warn).toBeCalledWith(expect.stringContaining('No appId configured'))
    expect(mockOutput.warn).toBeCalledWith(expect.stringContaining('https://www.sanity.io/manage'))
  })

  test('uses the invocation environment for the manage URL', () => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')

    runWithCliExecutionContext({sanityEnv: 'staging'}, () =>
      warnAboutMissingAppId({
        appType: 'studio',
        output: mockOutput,
        projectId: 'project-id',
      }),
    )

    expect(mockOutput.warn).toBeCalledWith(
      expect.stringContaining('https://sanity.work/manage/project/project-id/studios'),
    )
  })
})
