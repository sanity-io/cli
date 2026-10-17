import {type LoadFnOutput, type LoadHookContext} from 'node:module'

import {describe, expect, test, vi} from 'vitest'

import {initialize, load} from '../studioWorkerLoader.hooks.js'

const context = {conditions: [], format: undefined, importAttributes: {}} as LoadHookContext
const nextLoad = vi.fn(async (): Promise<LoadFnOutput> => ({
  format: 'module',
  source: 'export default "native"',
}))

describe('studioWorkerHooks', () => {
  test('loads modules normally before the hooks are initialized', async () => {
    await expect(load('file:///studio/sanity.config.ts', context, nextLoad)).resolves.toEqual({
      format: 'module',
      source: 'export default "native"',
    })
  })

  test('loads the bundle instead of the bundled file', async () => {
    await initialize?.({
      'file:///studio/broken.config.ts': {error: new Error('Failed to bundle')},
      'file:///studio/sanity.config.ts': {source: 'export default "bundled"'},
    })

    await expect(load('file:///studio/sanity.config.ts', context, nextLoad)).resolves.toEqual({
      format: 'module',
      shortCircuit: true,
      source: 'export default "bundled"',
    })
  })

  test('throws the error from bundling the file', async () => {
    await expect(load('file:///studio/broken.config.ts', context, nextLoad)).rejects.toThrow(
      'Failed to bundle',
    )
  })

  test('loads other modules normally', async () => {
    nextLoad.mockClear()
    await load('file:///studio/node_modules/sanity/lib/index.js', context, nextLoad)
    await load('file:///studio/constructor', context, nextLoad)
    expect(nextLoad).toHaveBeenCalledTimes(2)
  })
})
