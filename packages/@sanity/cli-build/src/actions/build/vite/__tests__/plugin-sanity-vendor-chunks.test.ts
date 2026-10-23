import {type Environment, type Plugin, type Rolldown} from 'vite'
import {expect, test, vi} from 'vitest'

import {sanityVendorChunks} from '../plugin-sanity-vendor-chunks.js'

const plugin = sanityVendorChunks({
  imports: {sanity: 'https://sanity-cdn.example/sanity'},
  vendor: {
    entries: {'react/index': '/pkg/react/index.js'},
    namesByChunkName: {'react/index': ['useState']},
    specifiersByChunkName: {'react/index': 'react'},
  },
})
const applyToEnvironment = plugin.applyToEnvironment as (environment: Environment) => unknown

test('emits the vendor entries into the vendor directory of the client environment, keeping other chunk names', () => {
  expect(applyToEnvironment({name: 'federation'} as Environment)).toBe(false)
  const entries = (applyToEnvironment({name: 'client'} as Environment) as Plugin[])[2]

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
