import {createMockOutput} from '@sanity/cli-test/test/util'
import {describe, expect, test} from 'vitest'

import {warnAboutMissingAppId} from '../warnAboutMissingAppId'

describe('warnAboutMissingAppId', () => {
  const mockOutput = createMockOutput()

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
})
