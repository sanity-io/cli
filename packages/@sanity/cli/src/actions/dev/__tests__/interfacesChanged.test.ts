import {describe, expect, test} from 'vitest'

import {type DevServerInterface} from '../deriveInterfaces.js'
import {interfacesChanged, serializeInterfaces} from '../interfacesChanged.js'

const panel = (name: string, src = `./src/${name}.tsx`): DevServerInterface => ({
  entry_point: src,
  interface_type: 'panel',
  name,
})
const worker = (name: string, src = `./src/${name}.ts`): DevServerInterface => ({
  entry_point: src,
  interface_type: 'worker',
  name,
})

describe('serializeInterfaces', () => {
  test('undefined and empty both key to the empty set', () => {
    expect(serializeInterfaces(undefined)).toBe('')
    expect(serializeInterfaces([])).toBe('')
    expect(serializeInterfaces(undefined)).toBe(serializeInterfaces([]))
  })

  test('is order-independent', () => {
    expect(serializeInterfaces([panel('a'), worker('b')])).toBe(
      serializeInterfaces([worker('b'), panel('a')]),
    )
  })

  test('distinguishes type, name, and entry point', () => {
    expect(serializeInterfaces([panel('a')])).not.toBe(serializeInterfaces([worker('a')]))
    expect(serializeInterfaces([panel('a')])).not.toBe(serializeInterfaces([panel('b')]))
    expect(serializeInterfaces([panel('a', './x.tsx')])).not.toBe(
      serializeInterfaces([panel('a', './y.tsx')]),
    )
  })
})

describe('interfacesChanged', () => {
  test('no change when the set is identical (any order)', () => {
    expect(interfacesChanged([panel('a'), worker('b')], [worker('b'), panel('a')])).toBe(false)
  })

  test('detects an added view', () => {
    expect(interfacesChanged([panel('a')], [panel('a'), panel('b')])).toBe(true)
  })

  test('detects a removed service', () => {
    expect(interfacesChanged([panel('a'), worker('b')], [panel('a')])).toBe(true)
  })

  test('detects a repointed source (the same name, different entry)', () => {
    expect(interfacesChanged([panel('a', './old.tsx')], [panel('a', './new.tsx')])).toBe(true)
  })

  test('undefined ↔ empty is not a change', () => {
    expect(interfacesChanged(undefined, [])).toBe(false)
  })

  test('gaining the first interface is a change', () => {
    expect(interfacesChanged(undefined, [panel('a')])).toBe(true)
  })
})
