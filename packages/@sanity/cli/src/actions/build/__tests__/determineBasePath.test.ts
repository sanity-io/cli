import {afterEach, describe, expect, test, vi} from 'vitest'

import {determineBasePath} from '../determineBasePath.js'

describe('#determineBasePath', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('should return the base path from the CLI config', () => {
    expect(determineBasePath({project: {basePath: '/base'}}, 'app')).toBe('/base')
  })

  test('should return the base path from the environment variables', () => {
    vi.stubEnv('SANITY_APP_BASEPATH', '/base')
    expect(determineBasePath({project: {basePath: '/base'}}, 'app')).toBe('/base')
  })
})
