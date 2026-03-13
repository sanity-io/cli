import {describe, expect, test} from 'vitest'

import {ANSI_COLORS_BASIC, ANSI_COLORS_EXTENDED, CSS_COLORS, selectColor} from '../colors.js'

describe('color palettes', () => {
  test('basic ANSI palette has 6 colors', () => {
    expect(ANSI_COLORS_BASIC).toHaveLength(6)
    expect(ANSI_COLORS_BASIC).toEqual([6, 2, 3, 4, 5, 1])
  })

  test('extended ANSI palette has 70+ colors', () => {
    expect(ANSI_COLORS_EXTENDED.length).toBeGreaterThan(70)
    for (const c of ANSI_COLORS_EXTENDED) {
      expect(typeof c).toBe('number')
    }
  })

  test('CSS palette has 70+ colors', () => {
    expect(CSS_COLORS.length).toBeGreaterThan(70)
    for (const c of CSS_COLORS) {
      expect(c).toMatch(/^#[0-9A-F]{6}$/)
    }
  })
})

describe('selectColor', () => {
  test('returns deterministic color for same namespace', () => {
    const colors = [1, 2, 3, 4, 5, 6]
    const color1 = selectColor('test:namespace', colors)
    const color2 = selectColor('test:namespace', colors)
    expect(color1).toBe(color2)
  })

  test('different namespaces can get different colors', () => {
    const colors = [1, 2, 3, 4, 5, 6]
    const results = new Set<number>()
    for (const ns of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      results.add(selectColor(ns, colors) as number)
    }
    expect(results.size).toBeGreaterThanOrEqual(2)
  })

  test('always returns a value from the provided palette', () => {
    const colors = [10, 20, 30]
    for (const ns of ['foo', 'bar', 'baz', 'qux', 'sanity:cli:build']) {
      expect(colors).toContain(selectColor(ns, colors))
    }
  })
})
