import {type Environment, type Plugin, type Rolldown} from 'vite'
import {expect, it, vi} from 'vitest'

import {sanityStandaloneVendor} from './plugin-sanity-standalone-vendor.js'

const vendorPlugin = {name: 'vendor-named-exports'}
const plugin = sanityStandaloneVendor({
  entries: {'react/index': '/pkg/react/index.js'},
  fileName: 'vendor/[name]-[hash].mjs',
  plugins: [vendorPlugin],
})
const applyToEnvironment = plugin.applyToEnvironment as (environment: Environment) => unknown

it('applies only to the standalone client environment', () => {
  expect(applyToEnvironment({name: 'federation'} as Environment)).toBe(false)
  expect(applyToEnvironment({name: 'client'} as Environment)).toEqual([
    vendorPlugin,
    expect.objectContaining({name: 'sanity/standalone-vendor-entries'}),
  ])
})

it('emits the vendor entries and names them, keeping other chunks named as configured', () => {
  const [, entries] = applyToEnvironment({name: 'client'} as Environment) as Plugin[]

  const emitFile = vi.fn()
  ;(entries.buildStart as (this: unknown) => void).call({emitFile})
  expect(emitFile).toHaveBeenCalledWith({
    id: '/pkg/react/index.js',
    name: 'react/index',
    type: 'chunk',
  })

  const output = (
    entries.outputOptions as (options: Rolldown.OutputOptions) => Rolldown.OutputOptions
  )({
    chunkFileNames: (chunk) =>
      chunk.name === 'sanity-resource-bindings'
        ? 'sanity-resource-bindings.js'
        : 'static/[name]-[hash].js',
  })
  const chunkFileNames = output.chunkFileNames as (chunk: {name: string}) => string
  expect(chunkFileNames({name: 'react/index'})).toBe('vendor/[name]-[hash].mjs')
  expect(chunkFileNames({name: 'sanity-resource-bindings'})).toBe('sanity-resource-bindings.js')
  expect(chunkFileNames({name: 'Studio'})).toBe('static/[name]-[hash].js')
})
