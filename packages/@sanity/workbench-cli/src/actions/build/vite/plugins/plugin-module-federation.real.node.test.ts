import {type Plugin, type PluginOption} from 'vite'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {FEDERATION_DIR_NAME} from '../constants.js'
import {sanityModuleFederation} from './plugin-module-federation.js'

// Companion to plugin-module-federation.node.test.ts, which mocks
// `@module-federation/vite` and checks the scoping wrapper with injected plugins.
// This one runs the REAL integration: it proves `sanityModuleFederation` composes
// actual, environment-scoped Vite plugins — if the upstream plugin shape changed
// or our scoping broke, the mocked test would still pass but this would not.

// `@module-federation/vite` returns an empty plugin set when it detects vitest in
// the env; opt out so we exercise the real plugins.
vi.stubEnv('MFE_VITE_NO_TEST_ENV_CHECK', 'true')

afterEach(() => {
  vi.unstubAllEnvs()
})

// The MF plugin set can include promise-delivered dts plugins, so flatten and
// await before inspecting.
async function resolvePlugins(option: PluginOption): Promise<Plugin[]> {
  const settled = await option
  if (Array.isArray(settled)) {
    return (await Promise.all(settled.map((entry) => resolvePlugins(entry)))).flat()
  }
  return settled ? [settled as Plugin] : []
}

describe('sanityModuleFederation (real @module-federation/vite)', () => {
  it('composes named, environment-scoped vite plugins', async () => {
    const plugins = await resolvePlugins(
      sanityModuleFederation({exposes: {'./App': '/tmp/app.js'}, name: 'test-remote'}),
    )

    expect(plugins.length).toBeGreaterThan(0)
    for (const plugin of plugins) {
      expect(typeof plugin.name).toBe('string')
      // Every plugin is scoped to the dev server or the federation build env.
      const apply = plugin.applyToEnvironment
      expect(typeof apply).toBe('function')
      if (typeof apply === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(apply({config: {command: 'serve'}, name: 'client'} as any)).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(apply({config: {command: 'build'}, name: FEDERATION_DIR_NAME} as any)).toBe(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(apply({config: {command: 'build'}, name: 'client'} as any)).toBe(false)
      }
    }
  })
})
