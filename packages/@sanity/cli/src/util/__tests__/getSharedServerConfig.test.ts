import {afterEach, describe, expect, test, vi} from 'vitest'

import {getSharedServerConfig} from '../getSharedServerConfig'

describe('getSharedServerConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('falls back to port 3333 and reports it as unconfigured', () => {
    const result = getSharedServerConfig({flags: {}, workDir: '/tmp/project'})

    expect(result.httpPort).toBe(3333)
    expect(result.httpPortConfigured).toBe(false)
  })

  test('reports a flag-provided port as configured', () => {
    const result = getSharedServerConfig({flags: {port: '5555'}, workDir: '/tmp/project'})

    expect(result.httpPort).toBe(5555)
    expect(result.httpPortConfigured).toBe(true)
  })

  test('reports an env-provided port as configured', () => {
    vi.stubEnv('SANITY_STUDIO_SERVER_PORT', '5555')

    const result = getSharedServerConfig({flags: {}, workDir: '/tmp/project'})

    expect(result.httpPort).toBe(5555)
    expect(result.httpPortConfigured).toBe(true)
  })

  test('reports a cli-config port as configured', () => {
    const result = getSharedServerConfig({
      cliConfig: {server: {port: 5555}},
      flags: {},
      workDir: '/tmp/project',
    })

    expect(result.httpPort).toBe(5555)
    expect(result.httpPortConfigured).toBe(true)
  })

  test('a pinned port equal to the default still counts as configured', () => {
    const result = getSharedServerConfig({
      cliConfig: {server: {port: 3333}},
      flags: {},
      workDir: '/tmp/project',
    })

    expect(result.httpPort).toBe(3333)
    expect(result.httpPortConfigured).toBe(true)
  })
})
