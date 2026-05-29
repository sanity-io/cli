import {describe, expect, test} from 'vitest'

import {isWorkbenchApp, parseWorkbenchCliConfig} from '../workbenchApp'

const BRAND = Symbol.for('sanity.workbench.defineApp')

/** Mimics what `unstable_defineApp` returns: the input plus the brand. */
function brandedApp(input: Record<string, unknown>) {
  return Object.defineProperty({...input}, BRAND, {enumerable: false, value: true})
}

describe('isWorkbenchApp', () => {
  test('detects a branded app', () => {
    expect(isWorkbenchApp(brandedApp({name: 'mini', title: 'Mini'}))).toBe(true)
  })

  test('ignores a plain app config', () => {
    expect(isWorkbenchApp({organizationId: 'o1', title: 'Mini'})).toBe(false)
    expect(isWorkbenchApp(null)).toBe(false)
    expect(isWorkbenchApp(undefined)).toBe(false)
  })
})

describe('parseWorkbenchCliConfig', () => {
  test('enables federation implicitly (no federation.enabled needed)', () => {
    const app = brandedApp({
      entry: './src/App.tsx',
      icon: './icon.svg',
      name: 'mini-desk',
      organizationId: 'o1',
      title: 'Mini Desk',
    })

    const config = parseWorkbenchCliConfig({app, server: {port: 3337}})

    expect(config.federation).toEqual({enabled: true})
  })

  test('keeps the branded app untouched (identity fields survive)', () => {
    const app = brandedApp({name: 'mini-desk', organizationId: 'o1', title: 'Mini Desk'})

    const config = parseWorkbenchCliConfig({app})

    // `name` would be stripped by the legacy `app` object schema — the branded
    // app must bypass it.
    expect(config.app).toBe(app)
    expect((config.app as {name?: string}).name).toBe('mini-desk')
  })

  test('still validates the non-app fields', () => {
    const app = brandedApp({name: 'mini', title: 'Mini'})

    expect(() => parseWorkbenchCliConfig({app, server: {port: 'not-a-number'}})).toThrow(
      /Invalid CLI config/,
    )
  })
})
