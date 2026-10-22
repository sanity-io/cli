import path from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {federation} from '../plugin.js'

const mockEnvironmentPlugin = vi.hoisted(() => vi.fn(() => ({name: 'sanity/environment'})))
const mockModuleFederation = vi.hoisted(() => vi.fn(() => ({name: 'sanity/module-federation'})))
const mockHasIslandRuntime = vi.hoisted(() => vi.fn(() => true))

vi.mock('../plugins/plugin-sanity-environment.js', () => ({
  sanityEnvironmentPlugin: mockEnvironmentPlugin,
}))

vi.mock('../plugins/plugin-module-federation.js', () => ({
  sanityModuleFederation: mockModuleFederation,
}))

vi.mock('../../configs/mediaLibraryIslandRuntime.js', () => ({
  hasMediaLibraryIslandRuntime: mockHasIslandRuntime,
  MEDIA_LIBRARY_ISLAND_RUNTIME_MODULE: 'sanity/media-library-island-runtime',
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

describe('federation media-library config exposes', () => {
  const configExposes = {
    config: {
      appType: 'media-library' as const,
      fields: [{name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'}],
    },
  }

  test('exposes ./media-library-island-runtime next to the config when the installed sanity ships it', () => {
    mockHasIslandRuntime.mockReturnValue(true)
    federation({exposes: configExposes, isApp: true, name: 'ml-config', workDir})
    expect(mockHasIslandRuntime).toHaveBeenCalledWith(workDir)
    expect(mockModuleFederation).toHaveBeenCalledWith(
      expect.objectContaining({
        exposes: expect.objectContaining({
          // path.resolve, matching the artifact writer: on Windows it adds the
          // drive prefix that path.join('/project', ...) would not.
          './configs/installation_config': path.resolve(
            workDir,
            '.sanity',
            'federation',
            'configs',
            'installation_config.js',
          ),
          './media-library-island-runtime': path.resolve(
            workDir,
            '.sanity',
            'federation',
            'configs',
            'media_library_island_runtime.js',
          ),
        }),
      }),
    )
  })

  test('skips ./media-library-island-runtime (with a warning) on older sanity versions', () => {
    mockHasIslandRuntime.mockReturnValue(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      federation({exposes: configExposes, isApp: true, name: 'ml-config', workDir})
      const [[federationOptions]] = mockModuleFederation.mock.calls as unknown as [
        [{exposes: Record<string, string>}],
      ]
      expect(federationOptions.exposes).not.toHaveProperty('./media-library-island-runtime')
      expect(federationOptions.exposes).toHaveProperty('./configs/installation_config')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('media-library-island-runtime'))
    } finally {
      warn.mockRestore()
    }
  })

  test('never probes for the island runtime outside config apps', () => {
    federation({appEntry: '../../src/App', isApp: true, name: 'drop-desk', workDir})
    expect(mockHasIslandRuntime).not.toHaveBeenCalled()
  })
})

const hasAutoUpdatesPlugin = (plugins: unknown) =>
  (plugins as {name?: string}[]).some(({name}) => name === 'sanity/auto-updates-loader')

describe('federation auto-updates', () => {
  test('adds the auto-updates plugin when auto-updates are on', () => {
    const plugins = federation({
      autoUpdates: {imports: {sanity: 'https://sanity-cdn.com/v1/modules/sanity'}},
      isApp: false,
      name: 'drop-desk',
      studioConfigPath: '../../sanity.config.ts',
      workDir,
    })
    expect(hasAutoUpdatesPlugin(plugins)).toBe(true)
  })

  test('adds no auto-updates plugin otherwise', () => {
    const plugins = federation({
      isApp: false,
      name: 'drop-desk',
      studioConfigPath: '../../sanity.config.ts',
      workDir,
    })
    expect(hasAutoUpdatesPlugin(plugins)).toBe(false)
  })
})
