import MagicString from 'magic-string'
import {parseAst} from 'vite'
import {describe, expect, test} from 'vitest'

import {injectNamedExports} from '../injectNamedExports.js'

/**
 * Runs `injectNamedExports` against `code` using a real (JS) `MagicString` and
 * Vite's `parseAst`, mirroring how the plugin drives the native MagicString in
 * production. Returns the rewritten code.
 */
function inject(
  code: string,
  names: string[],
  exports: string[] = ['default'],
  chunkName = 'react/index',
): string {
  const magicString = new MagicString(code)
  injectNamedExports({chunkName, exports, magicString, names, program: parseAst(code)})
  return magicString.toString()
}

describe('injectNamedExports', () => {
  describe('Shape A: inline `export default <expr>`', () => {
    test('captures the default into a local and appends named exports', () => {
      const result = inject(`var t = makeReact();\nexport default t;\n`, [
        'useState',
        'createElement',
      ])

      expect(result).toContain('const __sanityVendorDefault = t;')
      expect(result).toContain('export default __sanityVendorDefault')
      expect(result).toContain('export const useState = __sanityVendorDefault.useState')
      expect(result).toContain('export const createElement = __sanityVendorDefault.createElement')
      // exactly one default export remains
      expect(result.match(/export default/g)).toHaveLength(1)
    })

    test('handles a call-expression default', () => {
      const result = inject(`export default factory();`, ['jsx'])

      expect(result).toContain('const __sanityVendorDefault = factory();')
      expect(result).toContain('export const jsx = __sanityVendorDefault.jsx')
      expect(result.match(/export default/g)).toHaveLength(1)
    })
  })

  describe('Shape B: re-exported default', () => {
    test('imports the re-exported binding and appends named exports', () => {
      const result = inject(`export { r as default } from "./chunk-abc.mjs";`, ['useState'])

      expect(result).toContain('import {r as __sanityVendorDefault} from "./chunk-abc.mjs"')
      expect(result).toContain('export const useState = __sanityVendorDefault.useState')
      // original default re-export is preserved
      expect(result).toContain('export { r as default } from "./chunk-abc.mjs"')
    })

    test('uses a default import when the re-exported local name is `default`', () => {
      const result = inject(`export { default } from "./chunk-abc.mjs";`, ['jsx'])

      expect(result).toContain('import __sanityVendorDefault from "./chunk-abc.mjs"')
      expect(result).toContain('export const jsx = __sanityVendorDefault.jsx')
    })
  })

  test('skips names already exported by the chunk', () => {
    const result = inject(`export default t;`, ['useState', 'version'], ['default', 'version'])

    expect(result).toContain('export const useState = __sanityVendorDefault.useState')
    expect(result).not.toContain('export const version =')
  })

  test('is a no-op when every name is already exported', () => {
    const code = `export default t;`

    expect(inject(code, ['useState'], ['default', 'useState'])).toBe(code)
  })

  test('avoids colliding with an existing `__sanityVendorDefault` binding', () => {
    const result = inject(`var __sanityVendorDefault = 1;\nexport default factory();`, ['jsx'])

    expect(result).toContain('const __sanityVendorDefault2 = factory();')
    expect(result).toContain('export const jsx = __sanityVendorDefault2.jsx')
  })

  test('offset guard: correct span with non-ASCII content before the default', () => {
    const result = inject(`var s = "café ☕ résumé";\nexport default factory();`, ['jsx'])

    expect(result).toContain('var s = "café ☕ résumé";')
    expect(result).toContain('const __sanityVendorDefault = factory();')
    expect(result).toContain('export const jsx = __sanityVendorDefault.jsx')
  })

  test('throws (fail-loud) when no default export can be located', () => {
    expect(() => inject(`export const foo = 1;`, ['useState'], [])).toThrow(
      /Could not locate the default export of chunk 'react\/index'/,
    )
  })
})
