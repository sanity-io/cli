import {describe, expect, test} from 'vitest'

import {determineBasePath} from '../determineBasePath.js'

describe('#determineBasePath', () => {
  test('should return the base path from the CLI config', () => {
    expect(determineBasePath({project: {basePath: '/base'}}, 'app')).toBe('/base')
  })

  test('should return the base path from the environment variables', () => {
    process.env.SANITY_APP_BASEPATH = '/base'
    expect(determineBasePath({project: {basePath: '/base'}}, 'app')).toBe('/base')
  })
})
