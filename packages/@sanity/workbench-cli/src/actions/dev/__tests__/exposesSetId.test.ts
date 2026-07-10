import {describe, expect, test} from 'vitest'

import {type DevServerConfig, type DevServerInterface} from '../deriveInterfaces.js'
import {createExposesTracker, exposesSetId, trackExposesSet} from '../exposesSetId.js'
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
const mlConfig = (fields: DevServerConfig['fields']): DevServerConfig => ({
  appType: 'media-library',
  fields,
  id: 'cfg-hash',
  version: 1,
})
const config = mlConfig([{name: 'd', src: './src/d.ts', title: 'D'}])
const server = (
  id: string,
  port: number,
  interfaces: DevServerInterface[],
  config?: DevServerConfig,
): DevServerManifest => ({
  configs: config ? [config] : undefined,
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

describe('exposesSetId', () => {
  test('undefined and empty both id to the empty set', () => {
    expect(exposesSetId({})).toBe('')
    expect(exposesSetId({interfaces: []})).toBe('')
    expect(exposesSetId({interfaces: undefined})).toBe(exposesSetId({interfaces: []}))
  })

  test('is order-independent — reordering views/services is not a change', () => {
    expect(exposesSetId({interfaces: [panel('a'), worker('b')]})).toBe(
      exposesSetId({interfaces: [worker('b'), panel('a')]}),
    )
  })

  test('distinguishes interface_type, name, and entry_point', () => {
    expect(exposesSetId({interfaces: [panel('a')]})).not.toBe(
      exposesSetId({interfaces: [worker('a')]}),
    )
    expect(exposesSetId({interfaces: [panel('a')]})).not.toBe(
      exposesSetId({interfaces: [panel('b')]}),
    )
    expect(exposesSetId({interfaces: [panel('a', './x.tsx')]})).not.toBe(
      exposesSetId({interfaces: [panel('a', './y.tsx')]}),
    )
  })

  test('the config toggles the id (its module is a new expose)', () => {
    // adding the config changes the expose set → rebuild
    expect(exposesSetId({interfaces: [panel('a')]})).not.toBe(
      exposesSetId({configs: [config], interfaces: [panel('a')]}),
    )
  })

  test('a zero-field config still toggles the id — its module is an expose on its own', () => {
    expect(exposesSetId({interfaces: [panel('a')]})).not.toBe(
      exposesSetId({configs: [mlConfig([])], interfaces: [panel('a')]}),
    )
  })

  test('a config field add or rename changes the id (module is build-baked)', () => {
    const one = mlConfig([{name: 'description', src: './src/d.ts', title: 'Description'}])
    const added = mlConfig([
      {name: 'description', src: './src/d.ts', title: 'Description'},
      {name: 'language', src: './src/l.ts', title: 'Language'},
    ])
    const renamed = mlConfig([{name: 'locale', src: './src/d.ts', title: 'Description'}])
    expect(exposesSetId({configs: [one]})).not.toBe(exposesSetId({configs: [added]}))
    expect(exposesSetId({configs: [one]})).not.toBe(exposesSetId({configs: [renamed]}))
  })

  test('a config field pointed at a different file is a rebuild — the module reimports it', () => {
    const before = mlConfig([{name: 'x', src: './src/x.ts', title: 'X'}])
    const after = mlConfig([{name: 'x', src: './src/y.ts', title: 'X'}])
    expect(exposesSetId({configs: [before]})).not.toBe(exposesSetId({configs: [after]}))
  })

  test('reordering config fields is not a change', () => {
    const a = mlConfig([
      {name: 'x', src: './src/x.ts', title: 'X'},
      {name: 'y', src: './src/y.ts', title: 'Y'},
    ])
    const b = mlConfig([
      {name: 'y', src: './src/y.ts', title: 'Y'},
      {name: 'x', src: './src/x.ts', title: 'X'},
    ])
    expect(exposesSetId({configs: [a]})).toBe(exposesSetId({configs: [b]}))
  })

  test('a field title/public edit is not a rebuild — those ride the wire, not the module', () => {
    const a = mlConfig([{name: 'x', public: true, src: './src/x.ts', title: 'X'}])
    const b = mlConfig([{name: 'x', public: false, src: './src/x.ts', title: 'Renamed'}])
    expect(exposesSetId({configs: [a]})).toBe(exposesSetId({configs: [b]}))
  })

  // The id is what both detection sites compare against their last-seen value;
  // these assert the change semantics they rely on.
  test('a changed id across an add, remove, or repoint signals the change', () => {
    expect(exposesSetId({interfaces: [panel('a')]})).not.toBe(
      exposesSetId({interfaces: [panel('a'), panel('b')]}),
    ) // add
    expect(exposesSetId({interfaces: [panel('a'), worker('b')]})).not.toBe(
      exposesSetId({interfaces: [panel('a')]}),
    ) // remove
    expect(exposesSetId({interfaces: [panel('a', './old.tsx')]})).not.toBe(
      exposesSetId({interfaces: [panel('a', './new.tsx')]}),
    ) // repoint
  })
})

describe('trackExposesSet', () => {
  test('reports no change for the seeded set, the same set, or a reorder', () => {
    const set = trackExposesSet({interfaces: [panel('a'), worker('b')]})
    expect(set.changed({interfaces: [panel('a'), worker('b')]})).toBe(false)
    expect(set.changed({interfaces: [worker('b'), panel('a')]})).toBe(false)
  })

  test('detection does not commit — `changed` stays true until `commit` advances the baseline', () => {
    const set = trackExposesSet({interfaces: [panel('a')]})
    // Repeated detection without a commit keeps reporting the change, so a
    // rebuild that threw (never committed) is retried on the next pass instead
    // of being skipped — the self-healing property the registry relies on.
    expect(set.changed({interfaces: [panel('a'), panel('b')]})).toBe(true)
    expect(set.changed({interfaces: [panel('a'), panel('b')]})).toBe(true)
    set.commit({interfaces: [panel('a'), panel('b')]})
    expect(set.changed({interfaces: [panel('a'), panel('b')]})).toBe(false)
    expect(set.changed({interfaces: [panel('a')]})).toBe(true) // removed — a new change off the committed set
  })

  test('the config appearing is a change off the seeded set', () => {
    const set = trackExposesSet({interfaces: [panel('a')]})
    expect(set.changed({configs: [config], interfaces: [panel('a')]})).toBe(true)
  })

  test('treats undefined and empty as the same set', () => {
    expect(trackExposesSet({}).changed({interfaces: []})).toBe(false)
  })
})

describe('createExposesTracker', () => {
  test('the first snapshot is never a rebuild — no app is known yet', () => {
    const tracker = createExposesTracker()
    expect(tracker.hasChanged([server('a', 1, [panel('x')])])).toBe(false)
  })

  test('a known app whose set changed signals a rebuild', () => {
    const tracker = createExposesTracker()
    tracker.hasChanged([server('a', 1, [panel('x')])])
    expect(tracker.hasChanged([server('a', 1, [panel('x'), panel('y')])])).toBe(true)
  })

  test('a known app that gains an config signals a rebuild', () => {
    const tracker = createExposesTracker()
    tracker.hasChanged([server('a', 1, [panel('x')])])
    expect(tracker.hasChanged([server('a', 1, [panel('x')], config)])).toBe(true)
  })

  test('a newly appearing app is not a rebuild — it reconciles softly', () => {
    const tracker = createExposesTracker()
    tracker.hasChanged([server('a', 1, [panel('x')])])
    expect(tracker.hasChanged([server('a', 1, [panel('x')]), server('b', 2, [panel('z')])])).toBe(
      false,
    )
  })

  test('a reorder of a known app is not a rebuild', () => {
    const tracker = createExposesTracker()
    tracker.hasChanged([server('a', 1, [panel('x'), worker('y')])])
    expect(tracker.hasChanged([server('a', 1, [worker('y'), panel('x')])])).toBe(false)
  })
})
