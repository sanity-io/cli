import {type Output} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {determineBasePath} from '../determineBasePath.js'

function createMockOutput(): Output {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

describe('#determineBasePath', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('should return "/" when no config or env var is set', () => {
    expect(determineBasePath({}, 'studio')).toBe('/')
  })

  test('should return the base path from the CLI config', () => {
    expect(determineBasePath({project: {basePath: '/base'}}, 'app')).toBe('/base')
  })

  test('should return the base path from the app environment variable', () => {
    vi.stubEnv('SANITY_APP_BASEPATH', '/env-base')
    expect(determineBasePath({}, 'app')).toBe('/env-base')
  })

  test('should return the base path from the studio environment variable', () => {
    vi.stubEnv('SANITY_STUDIO_BASEPATH', '/env-base')
    expect(determineBasePath({}, 'studio')).toBe('/env-base')
  })

  test('should prefer env var over config for app', () => {
    vi.stubEnv('SANITY_APP_BASEPATH', '/env-base')
    expect(determineBasePath({project: {basePath: '/config-base'}}, 'app')).toBe('/env-base')
  })

  test('should prefer env var over config for studio', () => {
    vi.stubEnv('SANITY_STUDIO_BASEPATH', '/env-base')
    expect(determineBasePath({project: {basePath: '/config-base'}}, 'studio')).toBe('/env-base')
  })

  test('should warn when both env var and config are set for studio', () => {
    vi.stubEnv('SANITY_STUDIO_BASEPATH', '/env-base')
    const output = createMockOutput()

    determineBasePath({project: {basePath: '/config-base'}}, 'studio', output)

    expect(output.warn).toHaveBeenCalledWith(
      'Overriding configured base path (/config-base) with value from environment variable (/env-base)',
    )
  })

  test('should warn when both env var and config are set for app', () => {
    vi.stubEnv('SANITY_APP_BASEPATH', '/env-base')
    const output = createMockOutput()

    determineBasePath({project: {basePath: '/config-base'}}, 'app', output)

    expect(output.warn).toHaveBeenCalledWith(
      'Overriding configured base path (/config-base) with value from environment variable (/env-base)',
    )
  })

  test('should not warn when only env var is set', () => {
    vi.stubEnv('SANITY_STUDIO_BASEPATH', '/env-base')
    const output = createMockOutput()

    determineBasePath({}, 'studio', output)

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('should not warn when only config is set', () => {
    const output = createMockOutput()

    determineBasePath({project: {basePath: '/config-base'}}, 'studio', output)

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('should not warn when output is not provided', () => {
    vi.stubEnv('SANITY_STUDIO_BASEPATH', '/env-base')

    // Should not throw even without output
    expect(determineBasePath({project: {basePath: '/config-base'}}, 'studio')).toBe('/env-base')
  })
})
