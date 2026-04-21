import {type CliConfig, type Output} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {getAppId, normalizeAppId} from '../appId'

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

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
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

describe('normalizeAppId', () => {
  test('copies deprecated app.id into deployment.appId and warns', () => {
    const cliConfig: CliConfig = {app: {id: 'old-id'}}
    const output = createMockOutput()

    normalizeAppId({cliConfig, output})

    expect(cliConfig.deployment?.appId).toBe('old-id')
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('`app.id` config has moved to `deployment.appId`'),
    )
  })

  test('keeps existing deployment.appId and warns when both are set', () => {
    const cliConfig: CliConfig = {app: {id: 'old-id'}, deployment: {appId: 'new-id'}}
    const output = createMockOutput()

    normalizeAppId({cliConfig, output})

    expect(cliConfig.deployment?.appId).toBe('new-id')
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('Found both `app.id` (deprecated) and `deployment.appId`'),
    )
  })

  test('is a no-op when only deployment.appId is set', () => {
    const cliConfig: CliConfig = {deployment: {appId: 'new-id'}}
    const output = createMockOutput()

    normalizeAppId({cliConfig, output})

    expect(cliConfig.deployment?.appId).toBe('new-id')
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('is a no-op when neither is set', () => {
    const cliConfig: CliConfig = {}
    const output = createMockOutput()

    normalizeAppId({cliConfig, output})

    expect(cliConfig.deployment).toBeUndefined()
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('preserves other deployment fields when copying app.id', () => {
    const cliConfig: CliConfig = {
      app: {id: 'old-id'},
      deployment: {autoUpdates: true},
    }
    const output = createMockOutput()

    normalizeAppId({cliConfig, output})

    expect(cliConfig.deployment).toEqual({appId: 'old-id', autoUpdates: true})
  })
})
