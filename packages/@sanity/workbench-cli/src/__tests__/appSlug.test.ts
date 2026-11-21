import {toAppSlug} from '@sanity/cli-core/workbench'
import {describe, expect, test} from 'vitest'

describe('toAppSlug', () => {
  test.each([
    ['Drop Desk', 'drop-desk'],
    ["Acme's Dashboard (v2)!", 'acme-s-dashboard-v2'],
    ['Café Roma', 'cafe-roma'],
    ['Bodø Studio', 'bod-studio'],
    ['-leading-and-trailing-', 'leading-and-trailing'],
  ])('coerces %j to %j', (input, expected) => {
    expect(toAppSlug(input)).toBe(expected)
  })

  test.each(['', '日本語プロジェクト', '2024-desk', 'x'])(
    'returns null for %j — nothing lawful survives',
    (input) => {
      expect(toAppSlug(input)).toBeNull()
    },
  )
})
