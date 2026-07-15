import {type Environment, type Plugin} from 'vite'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {DTS_TSCONFIG_PATH, FEDERATION_DIR_NAME} from '../constants.js'
import {sanityModuleFederation} from './plugin-module-federation.js'

const mockFederation = vi.hoisted(() => vi.fn())

vi.mock('@module-federation/vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@module-federation/vite')>()
  return {...actual, federation: mockFederation}
})

afterEach(() => {
  vi.clearAllMocks()
})

function runPlugin(): (Plugin | Promise<Plugin>)[] {
  return sanityModuleFederation({exposes: {}, name: 'test-app'}) as (Plugin | Promise<Plugin>)[]
}

function appliesTo(plugin: Plugin, name: string, command: 'build' | 'serve'): boolean {
  const apply = plugin.applyToEnvironment
  expect(typeof apply).toBe('function')
  if (typeof apply !== 'function') throw new Error('unreachable')
  return apply({config: {command}, name} as unknown as Environment) === true
}

describe('sanityModuleFederation', () => {
  // Type generation compiles the exposes with a tsconfig the build owns, not the
  // app's — so real projects generate types without their own compiler options
  // breaking the compile — and stays best-effort so a failure never fails the build.
  it('generates dts from the build-owned tsconfig, best-effort', () => {
    mockFederation.mockReturnValue([])

    runPlugin()

    expect(mockFederation).toHaveBeenCalledTimes(1)
    expect(mockFederation.mock.calls[0][0].dts).toEqual({
      consumeTypes: true,
      displayErrorInTerminal: false,
      generateTypes: {abortOnError: false, tsConfigPath: DTS_TSCONFIG_PATH},
    })
  })

  it('surfaces type-generation errors in the terminal only for the dev server', () => {
    mockFederation.mockReturnValue([])

    sanityModuleFederation({dev: true, exposes: {}, name: 'test-app'})

    expect(mockFederation.mock.calls[0][0].dts.displayErrorInTerminal).toBe(true)
  })

  it('scopes plugins to the dev server and the federation build environment', () => {
    mockFederation.mockReturnValue([{name: 'mf-core'} satisfies Plugin])

    const [plugin] = runPlugin()
    if (plugin instanceof Promise) throw new Error('expected a sync plugin')

    expect(plugin.name).toBe('mf-core')
    expect(appliesTo(plugin, 'client', 'serve')).toBe(true)
    expect(appliesTo(plugin, FEDERATION_DIR_NAME, 'build')).toBe(true)
    expect(appliesTo(plugin, 'client', 'build')).toBe(false)
  })

  it('keeps the promise-delivered dts plugins intact and scopes them once resolved', async () => {
    // mirrors loadPluginDts: a promise resolving to an array of plugins
    mockFederation.mockReturnValue([
      Promise.resolve([
        {name: 'mf-dts-serve'} satisfies Plugin,
        {name: 'mf-dts-build'} satisfies Plugin,
      ]),
    ])

    const [plugin] = runPlugin()

    expect(plugin).toBeInstanceOf(Promise)
    const resolved = (await plugin) as unknown as Plugin[]
    expect(resolved.map((p) => p.name)).toEqual(['mf-dts-serve', 'mf-dts-build'])
    for (const dtsPlugin of resolved) {
      expect(appliesTo(dtsPlugin, FEDERATION_DIR_NAME, 'build')).toBe(true)
      expect(appliesTo(dtsPlugin, 'client', 'build')).toBe(false)
    }
  })
})
