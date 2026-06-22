import {describe, expect, test} from 'vitest'

import {type DevServerInterface} from '../deriveInterfaces.js'
import {createInterfacesTracker, interfaceSetId, trackInterfaceSet} from '../interfaceSetId.js'
import {type DevServerManifest} from '../registry.js'

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
const server = (id: string, port: number, interfaces: DevServerInterface[]): DevServerManifest => ({
  host: 'localhost',
  id,
  interfaces,
  pid: 1,
  port,
  startedAt: '2026-01-01T00:00:00.000Z',
  type: 'coreApp',
  version: 1,
  workDir: '/tmp/app',
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
    const set = trackInterfaceSet([panel('a'), worker('b')])
    expect(set.changed([panel('a'), worker('b')])).toBe(false)
    expect(set.changed([worker('b'), panel('a')])).toBe(false)
  })

  test('detection does not commit — `changed` stays true until `commit` advances the baseline', () => {
    const set = trackInterfaceSet([panel('a')])
    // Repeated detection without a commit keeps reporting the change, so a
    // rebuild that threw (never committed) is retried on the next pass instead
    // of being skipped — the self-healing property the registry relies on.
    expect(set.changed([panel('a'), panel('b')])).toBe(true)
    expect(set.changed([panel('a'), panel('b')])).toBe(true)
    set.commit([panel('a'), panel('b')])
    expect(set.changed([panel('a'), panel('b')])).toBe(false)
    expect(set.changed([panel('a')])).toBe(true) // removed — a new change off the committed set
  })

  test('treats undefined and empty as the same set', () => {
    expect(trackInterfaceSet(undefined).changed([])).toBe(false)
  })
})

describe('createInterfacesTracker', () => {
  test('the first snapshot is never a rebuild — no app is known yet', () => {
    const tracker = createInterfacesTracker()
    expect(tracker.hasChanged([server('a', 1, [panel('x')])])).toBe(false)
  })

  test('a known app whose set changed signals a rebuild', () => {
    const tracker = createInterfacesTracker()
    tracker.hasChanged([server('a', 1, [panel('x')])])
    expect(tracker.hasChanged([server('a', 1, [panel('x'), panel('y')])])).toBe(true)
  })

  test('a newly appearing app is not a rebuild — it reconciles softly', () => {
    const tracker = createInterfacesTracker()
    tracker.hasChanged([server('a', 1, [panel('x')])])
    expect(tracker.hasChanged([server('a', 1, [panel('x')]), server('b', 2, [panel('z')])])).toBe(
      false,
    )
  })

  test('a reorder of a known app is not a rebuild', () => {
    const tracker = createInterfacesTracker()
    tracker.hasChanged([server('a', 1, [panel('x'), worker('y')])])
    expect(tracker.hasChanged([server('a', 1, [worker('y'), panel('x')])])).toBe(false)
  })
})
