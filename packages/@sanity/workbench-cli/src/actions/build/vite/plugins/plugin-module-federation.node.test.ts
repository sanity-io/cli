import {type Environment, type Plugin} from 'vite'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {FEDERATION_DIR_NAME} from '../constants.js'
import {sanityModuleFederation} from './plugin-module-federation.js'

const mockFederation = vi.hoisted(() => vi.fn())

vi.mock('@module-federation/vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@module-federation/vite')>()
  return {...actual, federation: mockFederation}
})

afterEach(() => {
  vi.clearAllMocks()
})

function runPlugin(): Plugin[] {
  return sanityModuleFederation({exposes: {}, name: 'test-app'}) as Plugin[]
}

function appliesTo(plugin: Plugin, name: string, command: 'build' | 'serve'): boolean {
  const apply = plugin.applyToEnvironment
  expect(typeof apply).toBe('function')
  if (typeof apply !== 'function') throw new Error('unreachable')
  return apply({config: {command}, name} as unknown as Environment) === true
}

describe('sanityModuleFederation', () => {
  // Regression test for TYPE-001: upstream defaults dts generation on for any
  // project with a tsconfig.json, but it compiles the generated .js/.jsx
  // expose shims with the user's compiler options — tsc rejects them without
  // allowJs (TS6504), and declaration emit of the user's noEmit app code fails
  // on its own (TS2742/TS4082). Type generation must stay explicitly off.
  it('disables dts entirely so the user tsconfig never compiles the generated exposes', () => {
    mockFederation.mockReturnValue([])

    runPlugin()

    expect(mockFederation).toHaveBeenCalledTimes(1)
    expect(mockFederation.mock.calls[0][0].dts).toBe(false)
    expect(mockFederation.mock.calls[0][0].manifest).toBe(true)
    expect(mockFederation.mock.calls[0][0]).not.toHaveProperty('filename')
  })

  it('scopes plugins to the dev server and the federation build environment', () => {
    mockFederation.mockReturnValue([{name: 'mf-core'} satisfies Plugin])

    const [plugin] = runPlugin()

    expect(plugin.name).toBe('mf-core')
    expect(appliesTo(plugin, 'client', 'serve')).toBe(true)
    expect(appliesTo(plugin, FEDERATION_DIR_NAME, 'build')).toBe(true)
    expect(appliesTo(plugin, 'client', 'build')).toBe(false)
  })
})
