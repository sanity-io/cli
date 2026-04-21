import {describe, expect, test} from 'vitest'

import {getAppId} from '../appId'

const newCliConfig = {
  deployment: {
    appId: 'new-id',
  },
}

const oldCliConfig = {
  app: {
    id: 'old-id',
  },
}

describe('getAppId', () => {
  test('should return the expected app ID given the current config', () => {
    const result = getAppId(newCliConfig)
    expect(result).toBe('new-id')
  })

  test('should return the expected app ID given the deprecated config', () => {
    const result = getAppId(oldCliConfig)
    expect(result).toBe('old-id')
  })

  test('should return the app ID for the current config if both config styles are present', () => {
    const result = getAppId({
      ...newCliConfig,
      ...oldCliConfig,
    })
    expect(result).toBe('new-id')
  })
})
