import {type CliConfig} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {createMockOutput, DEV_FLAGS as FLAGS} from '../../__tests__/testHelpers.js'
import {getDevServerConfig} from '../getDevServerConfig.js'

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn(),
  })),
}))

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

  test('should not warn when env var is set and cliConfig is undefined', () => {
    vi.stubEnv('SANITY_STUDIO_BASEPATH', '/env-base')
    const output = createMockOutput()

    getDevServerConfig({
      cliConfig: undefined,
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('should resolve reactStrictMode to true when SANITY_STUDIO_REACT_STRICT_MODE env var is "true"', () => {
    vi.stubEnv('SANITY_STUDIO_REACT_STRICT_MODE', 'true')
    const output = createMockOutput()

    const config = getDevServerConfig({
      cliConfig: {},
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(config.reactStrictMode).toBe(true)
  })

  test('should resolve reactStrictMode to false when SANITY_STUDIO_REACT_STRICT_MODE env var is "false"', () => {
    vi.stubEnv('SANITY_STUDIO_REACT_STRICT_MODE', 'false')
    const output = createMockOutput()

    const config = getDevServerConfig({
      cliConfig: {},
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(config.reactStrictMode).toBe(false)
  })

  test('should resolve reactStrictMode to false when env var is absent and cliConfig opts out explicitly', () => {
    const output = createMockOutput()
    const cliConfig: CliConfig = {reactStrictMode: false}

    const config = getDevServerConfig({
      cliConfig,
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(config.reactStrictMode).toBe(false)
  })

  test('should resolve reactStrictMode to true when env var is absent and cliConfig opts in explicitly', () => {
    const output = createMockOutput()
    const cliConfig: CliConfig = {reactStrictMode: true}

    const config = getDevServerConfig({
      cliConfig,
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(config.reactStrictMode).toBe(true)
  })

  test('should resolve reactStrictMode to false when env var is absent and cliConfig is unset', () => {
    const output = createMockOutput()

    const config = getDevServerConfig({
      cliConfig: {},
      flags: FLAGS,
      output,
      workDir: '/tmp',
    })

    expect(config.reactStrictMode).toBe(false)
  })

  test('binds the explicit httpPort over the flag-resolved one (workbench claimed the configured port)', () => {
    const withOverride = getDevServerConfig({
      cliConfig: {},
      flags: FLAGS,
      httpPort: 4001,
      output: createMockOutput(),
      workDir: '/tmp',
    })
    expect(withOverride.httpPort).toBe(4001)

    const withoutOverride = getDevServerConfig({
      cliConfig: {},
      flags: FLAGS,
      output: createMockOutput(),
      workDir: '/tmp',
    })
    expect(withoutOverride.httpPort).toBe(3333)
  })
})
