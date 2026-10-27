import {describe, expect, test} from 'vitest'

import {importModule} from '../importModule.js'

type JsxFixture = {
  element: {children: unknown[]; props: Record<string, unknown> | null; type: unknown}
}

/**
 * Pins the published `jsx` option with the real jiti (unlike
 * `importModule.test.ts`, which mocks it): `.tsx` loads with `jsx: true` and
 * fails to parse without it. The fixtures carry a classic-runtime pragma with
 * a local factory, so they evaluate without react installed.
 */
describe('importModule jsx option (unmocked jiti)', () => {
  test('a .tsx module fails to parse without jsx', async () => {
    const fixture = new URL('fixtures/jsxModuleUntransformed.tsx', import.meta.url)

    await expect(importModule(fixture, {default: false})).rejects.toThrow()
  })

  test('jsx: true parses and evaluates a .tsx module', async () => {
    const fixture = new URL('fixtures/jsxModule.tsx', import.meta.url)

    const module = await importModule<JsxFixture>(fixture, {default: false, jsx: true})

    expect(module.element.type).toBe('div')
    expect(module.element.props).toEqual({id: 'jsx-fixture'})
    expect(module.element.children).toEqual(['rendered'])
  })
})
