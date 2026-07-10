import {type CliConfig} from '@sanity/cli-core/types'
import {describe, expect, test} from 'vitest'

import {getAppId, resolveAppIdIssue} from '../appId'

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

describe('resolveAppIdIssue', () => {
  test('flags a conflict when both config styles are present', () => {
    expect(resolveAppIdIssue({...newCliConfig, ...oldCliConfig} as CliConfig)).toBe(
      'conflicting-config',
    )
  })

  test('flags the deprecated config when only app.id is present', () => {
    expect(resolveAppIdIssue(oldCliConfig as CliConfig)).toBe('deprecated-config')
  })

  test('returns null for the current config', () => {
    expect(resolveAppIdIssue(newCliConfig as CliConfig)).toBeNull()
  })
})
