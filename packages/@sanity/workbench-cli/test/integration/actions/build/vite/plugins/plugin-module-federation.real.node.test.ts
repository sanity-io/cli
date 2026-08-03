import {type Environment, type Plugin, type PluginOption} from 'vite'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {FEDERATION_DIR_NAME} from '../../../../../../src/actions/build/vite/constants.js'
import {sanityModuleFederation} from '../../../../../../src/actions/build/vite/plugins/plugin-module-federation.js'

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
      // applyToEnvironment only reads `config.command` and `name`, so a partial
      // Environment is enough — cast rather than build the whole object.
      const apply = plugin.applyToEnvironment
      expect(typeof apply).toBe('function')
      if (typeof apply === 'function') {
        const env = (command: 'build' | 'serve', name: string) =>
          ({config: {command}, name}) as unknown as Environment
        expect(apply(env('serve', 'client'))).toBe(true)
        expect(apply(env('build', FEDERATION_DIR_NAME))).toBe(true)
        expect(apply(env('build', 'client'))).toBe(false)
      }
    }
  })
})
