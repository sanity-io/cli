import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {describe, expect, test} from 'vitest'

import {parseWorkbenchCliConfig} from '../workbenchApp'

const BRAND = Symbol.for('sanity.workbench.defineApp')
// A dir with no `sanity.config.*`, so detection resolves to a core app.
const APP_DIR = tmpdir()

/** Mimics what `unstable_defineApp` returns: the input plus the brand. */
function brandedApp(input: Record<string, unknown>) {
  return Object.defineProperty({...input}, BRAND, {enumerable: false, value: true})
}

describe('parseWorkbenchCliConfig', () => {
  test('keeps the branded app untouched, brand and identity fields intact', () => {
    const app = brandedApp({
      entry: './src/App.tsx',
      name: 'drop-desk',
      organizationId: 'o1',
      title: 'Drop Desk',
    })

    const config = parseWorkbenchCliConfig({app, server: {port: 3333}}, APP_DIR)

    expect(config.app).toBe(app)
    expect((config.app as {name?: string}).name).toBe('drop-desk')
    expect(BRAND in (config.app as object)).toBe(true)
  })

  test('infers applicationType "coreApp" when there is no sanity.config', () => {
    const app = brandedApp({name: 'drop-desk', title: 'Drop Desk'})

    parseWorkbenchCliConfig({app}, APP_DIR)

    expect((app as {applicationType?: string}).applicationType).toBe('coreApp')
  })

  test('keeps an explicit applicationType (no detection)', () => {
    const app = brandedApp({applicationType: 'media-library', name: 'media', title: 'Media'})

    parseWorkbenchCliConfig({app}, join(APP_DIR, 'nope'))

    expect((app as {applicationType?: string}).applicationType).toBe('media-library')
  })

  test('still validates the non-app fields', () => {
    const app = brandedApp({name: 'drop-desk', title: 'Drop Desk'})

    expect(() => parseWorkbenchCliConfig({app, server: {port: 'nope'}}, APP_DIR)).toThrow(
      /Invalid CLI config/,
    )
  })
})
