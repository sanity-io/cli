import {describe, expect, test} from 'vitest'

import {resolveEntries} from '../writeSanityRuntime.js'

describe('resolveEntries', () => {
  // For apps, `resolveEntries` is pure path math (no studio-config lookup), so a
  // real absolute cwd is enough; the runtime dir defaults to `<cwd>/.sanity/runtime`,
  // which is always two levels below `<cwd>/src/...`.
  const cwd = process.cwd()

  test('a non-branded app without an entry keeps the ./src/App default', async () => {
    // Regression guard: gating the dock-only stub on `isApp` regressed legacy
    // (non-branded) SDK apps that rely on the `./src/App` default to "no app view".
    const {relativeEntry} = await resolveEntries({cwd, isApp: true, isWorkbenchApp: false})
    expect(relativeEntry).toBe('../../src/App')
  })

  test('a branded app without an entry has no app view (null → dock-only)', async () => {
    const {relativeEntry} = await resolveEntries({cwd, isApp: true, isWorkbenchApp: true})
    expect(relativeEntry).toBeNull()
  })

  test('a branded app with an explicit entry resolves it', async () => {
    const {relativeEntry} = await resolveEntries({
      cwd,
      entry: './src/Main.tsx',
      isApp: true,
      isWorkbenchApp: true,
    })
    expect(relativeEntry).toBe('../../src/Main.tsx')
  })
})
