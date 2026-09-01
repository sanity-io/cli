import path from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {federation} from '../plugin.js'

const mockEnvironmentPlugin = vi.hoisted(() => vi.fn(() => ({name: 'sanity/environment'})))

vi.mock('../plugins/plugin-sanity-environment.js', () => ({
  sanityEnvironmentPlugin: mockEnvironmentPlugin,
}))

vi.mock('../plugins/plugin-module-federation.js', () => ({
  sanityModuleFederation: vi.fn(() => ({name: 'sanity/module-federation'})),
}))

const workDir = '/project'
const appBootstrap = path.join(workDir, '.sanity', 'runtime', 'app.js')

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('federation standalone SPA (clientInput) gate', () => {
  test('passes clientInput for an app with an entry', () => {
    federation({appEntry: '../../src/App', isApp: true, name: 'drop-desk', workDir})
    expect(mockEnvironmentPlugin).toHaveBeenCalledWith(
      expect.objectContaining({clientInput: appBootstrap}),
    )
  })

  test('passes clientInput for a studio', () => {
    federation({
      isApp: false,
      name: 'drop-desk',
      studioConfigPath: '../../sanity.config.ts',
      workDir,
    })
    expect(mockEnvironmentPlugin).toHaveBeenCalledWith(
      expect.objectContaining({clientInput: appBootstrap}),
    )
  })

  test('omits clientInput for a dock-only app (no ./App)', () => {
    federation({isApp: true, name: 'drop-desk', workDir})
    expect(mockEnvironmentPlugin).toHaveBeenCalledWith(
      expect.objectContaining({clientInput: undefined}),
    )
  })
})
