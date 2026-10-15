import {describe, expect, test} from 'vitest'

import {stripSuiGlobalLayer, stripSuiGlobalReset} from '../plugin-strip-sui-global-reset.js'

// Mirrors the real structure of @sanity/ui v5's styles.css: a layer-order
// statement, the document-wide reset block, component styles, and a second
// sui.global block holding a @font-face (nested braces).
const STYLESHEET = [
  '@layer sui;',
  '@layer sui.global{*,:after,:before{box-sizing:border-box}*{margin:0;padding:0}}',
  '@layer sui{.sui-Button-abc{display:flex}.sui-Card-abc{padding:4px}}',
  '@layer sui.global{@font-face{font-family:Inter;src:url(x.woff2) format("woff2")}}',
].join('\n')

function transformedCode(code: string, id: string): string | null {
  const plugin = stripSuiGlobalReset()
  const transform = plugin.transform as (code: string, id: string) => {code: string} | null
  return transform(code, id)?.code ?? null
}

describe('stripSuiGlobalLayer', () => {
  test('removes every sui.global block, keeping component styles', () => {
    const out = stripSuiGlobalLayer(STYLESHEET)
    expect(out).not.toContain('sui.global{')
    expect(out).not.toContain('margin:0')
    expect(out).not.toContain('@font-face')
    expect(out).toContain('.sui-Button-abc{display:flex}')
    expect(out).toContain('.sui-Card-abc{padding:4px}')
  })

  test('keeps layer-order statements', () => {
    expect(stripSuiGlobalLayer('@layer sui;\n@layer sui.global;')).toBe(
      '@layer sui;\n@layer sui.global;',
    )
  })

  test('counts nested braces inside the block', () => {
    const css = '@layer sui.global{@media (min-width: 0){*{margin:0}}}\n.keep{color:red}'
    expect(stripSuiGlobalLayer(css)).toBe('\n.keep{color:red}')
  })

  test('leaves differently-named layers alone', () => {
    const css = '@layer sui.globalish{*{margin:0}}'
    expect(stripSuiGlobalLayer(css)).toBe(css)
  })

  test('leaves an unbalanced block untouched rather than over-stripping', () => {
    const css = '@layer sui.global{*{margin:0}'
    expect(stripSuiGlobalLayer(css)).toBe(css)
  })
})

describe('stripSuiGlobalReset plugin', () => {
  test('strips the global layer from any stylesheet that declares it', () => {
    const out = transformedCode(STYLESHEET, '/node_modules/whatever/dist/styles.css')
    expect(out).not.toBeNull()
    expect(out).not.toContain('sui.global{')
    expect(out).toContain('.sui-Button-abc')
  })

  test('matches on content, not the import path (survives an alias rename)', () => {
    expect(
      transformedCode(STYLESHEET, '/@fs/store/@sanity+ui@5.0.0/renamed/base.css'),
    ).not.toBeNull()
  })

  test('handles query-suffixed css ids', () => {
    expect(transformedCode(STYLESHEET, '/app/styles.css?direct')).not.toBeNull()
  })

  test('ignores css without the sui global layer', () => {
    expect(transformedCode('.app{margin:10px}', '/app/styles.css')).toBeNull()
  })

  test('ignores non-css modules even if they mention the layer', () => {
    expect(transformedCode('const css = "@layer sui.global{}"', '/app/main.ts')).toBeNull()
  })

  test('runs before Vite own css handling', () => {
    expect(stripSuiGlobalReset().enforce).toBe('pre')
  })
})
