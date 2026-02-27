import {type CliConfig, type Output} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getDevServerConfig} from '../getDevServerConfig.js'

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn(),
  })),
}))

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

/** These are not relevant for what we are testing, but still needed to pass type checker */
const FLAGS = {
  'auto-updates': false,
  host: 'localhost',
  json: false,
  'load-in-dashboard': false,
  port: '3333',
} as const

describe('getDevServerConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('should warn when both SANITY_STUDIO_BASEPATH env var and config basePath are set', () => {
    vi.stubEnv('SANITY_STUDIO_BASEPATH', '/env-base')
    const output = createMockOutput()
    const cliConfig: CliConfig = {project: {basePath: '/config-base'}}

    getDevServerConfig({
      cliConfig,
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(output.warn).toHaveBeenCalledWith(
      'Overriding configured base path (/config-base) with value from environment variable (/env-base)',
    )
  })

  test('should warn when both SANITY_APP_BASEPATH env var and config basePath are set for apps', () => {
    vi.stubEnv('SANITY_APP_BASEPATH', '/env-base')
    const output = createMockOutput()
    const cliConfig: CliConfig = {app: {}, project: {basePath: '/config-base'}}

    getDevServerConfig({
      cliConfig,
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(output.warn).toHaveBeenCalledWith(
      'Overriding configured base path (/config-base) with value from environment variable (/env-base)',
    )
  })

  test('should not warn when only config basePath is set', () => {
    const output = createMockOutput()
    const cliConfig: CliConfig = {project: {basePath: '/config-base'}}

    getDevServerConfig({
      cliConfig,
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('should not warn when only env var is set', () => {
    vi.stubEnv('SANITY_STUDIO_BASEPATH', '/env-base')
    const output = createMockOutput()

    getDevServerConfig({
      cliConfig: {},
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(output.warn).not.toHaveBeenCalled()
  })
})
