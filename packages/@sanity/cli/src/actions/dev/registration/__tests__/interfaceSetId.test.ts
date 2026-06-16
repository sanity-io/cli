import {describe, expect, test} from 'vitest'

import {type DevServerInterface} from '../deriveInterfaces.js'
import {interfaceSetId, trackInterfaceSet} from '../interfaceSetId.js'

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

describe('interfaceSetId', () => {
  test('undefined and empty both id to the empty set', () => {
    expect(interfaceSetId(undefined)).toBe('')
    expect(interfaceSetId([])).toBe('')
    expect(interfaceSetId(undefined)).toBe(interfaceSetId([]))
  })

  test('is order-independent — reordering views/services is not a change', () => {
    expect(interfaceSetId([panel('a'), worker('b')])).toBe(
      interfaceSetId([worker('b'), panel('a')]),
    )
  })

  test('distinguishes interface_type, name, and entry_point', () => {
    expect(interfaceSetId([panel('a')])).not.toBe(interfaceSetId([worker('a')]))
    expect(interfaceSetId([panel('a')])).not.toBe(interfaceSetId([panel('b')]))
    expect(interfaceSetId([panel('a', './x.tsx')])).not.toBe(
      interfaceSetId([panel('a', './y.tsx')]),
    )
  })

  // The id is what both detection sites compare against their last-seen value;
  // these assert the change semantics they rely on.
  test('a stable id across an add, remove, or repoint signals the change', () => {
    expect(interfaceSetId([panel('a')])).not.toBe(interfaceSetId([panel('a'), panel('b')])) // add
    expect(interfaceSetId([panel('a'), worker('b')])).not.toBe(interfaceSetId([panel('a')])) // remove
    expect(interfaceSetId([panel('a', './old.tsx')])).not.toBe(
      interfaceSetId([panel('a', './new.tsx')]),
    ) // repoint
  })
})

describe('trackInterfaceSet', () => {
  test('reports no change for the seeded set, the same set, or a reorder', () => {
    const changed = trackInterfaceSet([panel('a'), worker('b')])
    expect(changed([panel('a'), worker('b')])).toBe(false)
    expect(changed([worker('b'), panel('a')])).toBe(false)
  })

  test('reports the change once, then settles on the new set', () => {
    const changed = trackInterfaceSet([panel('a')])
    expect(changed([panel('a'), panel('b')])).toBe(true) // added
    expect(changed([panel('a'), panel('b')])).toBe(false) // same again
    expect(changed([panel('a')])).toBe(true) // removed
  })

  test('treats undefined and empty as the same set', () => {
    expect(trackInterfaceSet(undefined)([])).toBe(false)
  })
})
