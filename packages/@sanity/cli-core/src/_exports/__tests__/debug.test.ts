import createDebug from 'debug'
import {afterEach, describe, expect, test} from 'vitest'

import {enableDebug} from '../debug.js'

afterEach(() => createDebug.disable())

describe('enableDebug', () => {
  test('enables the CLI and @sanity/client namespaces', () => {
    createDebug.disable()
    enableDebug()
    expect(createDebug.enabled('sanity:cli:deploy')).toBe(true)
    expect(createDebug.enabled('sanity:client')).toBe(true)
  })

  test('keeps namespaces already enabled via DEBUG', () => {
    createDebug.enable('other:ns')
    enableDebug()
    expect(createDebug.enabled('other:ns')).toBe(true)
    expect(createDebug.enabled('sanity:cli')).toBe(true)
  })
})
