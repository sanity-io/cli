import {describe, expect, test} from 'vitest'

import {type DevServerInterface} from '../deriveInterfaces.js'
import {interfaceSetId} from '../interfaceSetId.js'

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
