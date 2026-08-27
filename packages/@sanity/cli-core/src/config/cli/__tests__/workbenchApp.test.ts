import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {describe, expect, test} from 'vitest'

import {parseWorkbenchCliConfig} from '../workbenchApp.js'

const BRAND = Symbol.for('sanity.workbench.defineApp')
const CONFIG_BRAND = Symbol.for('sanity.workbench.defineConfig')
// A dir with no `sanity.config.*`, so detection resolves to a core app.
const APP_DIR = tmpdir()

/** Mimics what `defineApplication` returns: the input plus the brand. */
function brandedApp(input: Record<string, unknown>) {
  return Object.defineProperty({...input}, BRAND, {enumerable: false, value: true})
}

/** Mimics what `unstable_defineMediaLibrary` returns: the config plus its brand. */
function brandedConfig(input: Record<string, unknown>) {
  return Object.defineProperty({...input}, CONFIG_BRAND, {enumerable: false, value: true})
}

describe('parseWorkbenchCliConfig', () => {
  test('keeps the identity fields and the brand on the resolved app', () => {
    const app = brandedApp({
      entry: './src/App.tsx',
      name: 'drop-desk',
      organizationId: 'o1',
      title: 'Drop Desk',
    })

    const config = parseWorkbenchCliConfig({app, server: {port: 3333}}, APP_DIR)

    expect((config.app as {name?: string}).name).toBe('drop-desk')
    expect(BRAND in (config.app as object)).toBe(true)
  })

  test('resolves applicationType onto a clone without mutating the caller', () => {
    const app = brandedApp({name: 'drop-desk', title: 'Drop Desk'})

    const config = parseWorkbenchCliConfig({app}, APP_DIR)

    // Caller's object is untouched; the resolved value lives on the returned clone.
    expect('applicationType' in app).toBe(false)
    expect(config.app).not.toBe(app)
    expect((config.app as {applicationType?: string}).applicationType).toBe('coreApp')
  })

  test('keeps an explicit applicationType (no detection)', () => {
    const app = brandedApp({applicationType: 'canvas', name: 'media', title: 'Media'})

    const config = parseWorkbenchCliConfig({app}, join(APP_DIR, 'nope'))

    expect((config.app as {applicationType?: string}).applicationType).toBe('canvas')
  })

  test('passes a config through without stamping applicationType', () => {
    const app = brandedConfig({
      appType: 'media-library',
      fields: [],
      organizationId: 'o1',
    })

    const config = parseWorkbenchCliConfig({app}, APP_DIR)

    // A config is not an app — it keeps its brand and gains no applicationType.
    expect(CONFIG_BRAND in (config.app as object)).toBe(true)
    expect('applicationType' in (config.app as object)).toBe(false)
    expect((config.app as {appType?: string}).appType).toBe('media-library')
  })

  test('rejects an unknown applicationType', () => {
    const app = brandedApp({applicationType: 'Studio', name: 'typo', title: 'Typo'})

    expect(() => parseWorkbenchCliConfig({app}, APP_DIR)).toThrow(/Invalid `applicationType`/)
  })

  test('still validates the non-app fields', () => {
    const app = brandedApp({name: 'drop-desk', title: 'Drop Desk'})

    expect(() => parseWorkbenchCliConfig({app, server: {port: 'nope'}}, APP_DIR)).toThrow(
      /Invalid CLI config/,
    )
  })
})
