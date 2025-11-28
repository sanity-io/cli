import {Output} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {warnAboutMissingAppId} from '../warnAboutMissingAppId'

describe('warnAboutMissingAppId', () => {
  const mockOutput = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output

  test('should log the expected warning when called', () => {
    warnAboutMissingAppId({
      output: mockOutput,
      projectId: 'project-id',
    })

    expect(mockOutput.warn).toBeCalledWith(expect.stringContaining('No appId configured'))
    expect(mockOutput.warn).toBeCalledWith(
      expect.stringContaining('https://sanity.io/manage/project/project-id/studios'),
    )
  })

  test('should be resilient to missing project IDs', () => {
    warnAboutMissingAppId({
      output: mockOutput,
      projectId: '',
    })

    expect(mockOutput.warn).toBeCalledWith(expect.stringContaining('No appId configured'))
    expect(mockOutput.warn).toBeCalledWith(expect.stringContaining('https://sanity.io/manage'))
  })
})
