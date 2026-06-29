import {afterEach, describe, expect, test, vi} from 'vitest'

import {workbenchVitePlugins} from '../workbench-vite-plugins.js'

const mockFederation = vi.hoisted(() => vi.fn(() => ({name: 'sanity/federation'})))
const mockReadPackageJson = vi.hoisted(() => vi.fn(async () => ({name: 'drop-desk'})))

vi.mock('../plugin.js', () => ({
  federation: mockFederation,
}))

vi.mock('@sanity/cli-core/package-manager', () => ({
  readPackageJson: mockReadPackageJson,
}))

const cwd = '/project'

afterEach(() => {
  vi.clearAllMocks()
})

describe('workbenchVitePlugins', () => {
  test('builds a studio remote from its sanity.config path', async () => {
    await workbenchVitePlugins({
      cwd,
      entries: {relativeConfigLocation: '../../sanity.config.ts', relativeEntry: null},
    })
    expect(mockFederation).toHaveBeenCalledWith(
      expect.objectContaining({
        isApp: false,
        pkgJson: {name: 'drop-desk'},
        studioConfigPath: '../../sanity.config.ts',
        workDir: cwd,
      }),
    )
  })

  test('throws when a workbench studio has no sanity config', async () => {
    await expect(
      workbenchVitePlugins({cwd, entries: {relativeConfigLocation: null, relativeEntry: null}}),
    ).rejects.toThrow('Workbench studios need a sanity.config')
    expect(mockFederation).not.toHaveBeenCalled()
  })

  test('builds an app remote with its entry', async () => {
    await workbenchVitePlugins({
      cwd,
      entries: {relativeConfigLocation: null, relativeEntry: '../../src/App'},
      isApp: true,
    })
    expect(mockFederation).toHaveBeenCalledWith(
      expect.objectContaining({appEntry: '../../src/App', isApp: true, workDir: cwd}),
    )
  })

  test('omits appEntry for a dock-only app with no entry', async () => {
    await workbenchVitePlugins({
      cwd,
      entries: {relativeConfigLocation: null, relativeEntry: null},
      isApp: true,
    })
    expect(mockFederation).toHaveBeenCalledWith(expect.objectContaining({isApp: true}))
    expect(mockFederation).not.toHaveBeenCalledWith(
      expect.objectContaining({appEntry: expect.anything()}),
    )
  })

  test('passes the declared views and services through to federation', async () => {
    const views = [{name: 'feed', src: './src/panel.tsx', type: 'panel' as const}]
    const services = [{name: 'sync', src: './src/sync.ts', type: 'worker' as const}]
    await workbenchVitePlugins({
      cwd,
      entries: {relativeConfigLocation: null, relativeEntry: '../../src/App'},
      exposes: {services, views},
      isApp: true,
    })
    expect(mockFederation).toHaveBeenCalledWith(
      expect.objectContaining({exposes: {services, views}}),
    )
  })
})
