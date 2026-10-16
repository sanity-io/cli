import {stripVTControlCharacters} from 'node:util'

import {Separator} from '@sanity/cli-core/ux'
import {describe, expect, test} from 'vitest'

import {searchChoices, searchTheme} from '../searchChoices.js'

const create = {name: 'Create new project', value: 'new'}
const separator = new Separator()
const acme = {name: 'Acme Docs (abc123)', value: 'abc123'}
const globex = {name: 'Globex Shop (def456)', value: 'def456'}
const locked = {disabled: 'Insufficient permissions', name: 'Acme Locked [ghi789]', value: 'ghi789'}
const source = searchChoices([create, separator, acme, globex, separator, locked])

describe('searchChoices', () => {
  test.each([undefined, '', '  '])('returns all choices for empty term %j', (term) => {
    expect(source(term)).toEqual([create, separator, acme, globex, separator, locked])
  })

  test('matches any substring of the name case-insensitively, with pinned choices after matches', () => {
    expect(source('ACME')).toEqual([acme, locked, separator, create])
    expect(source('def4')).toEqual([globex, separator, create])
  })

  test('matches every word anywhere in the name', () => {
    expect(source('shop globex')).toEqual([globex, separator, create])
    expect(source('acme shop')).toEqual([new Separator('No matches for "acme shop"'), create])
  })

  test('shows the search term and keeps pinned choices when nothing matches', () => {
    expect(source(' nope ')).toEqual([new Separator('No matches for "nope"'), create])
  })

  test('filters all choices when there is no separator', () => {
    expect(searchChoices([acme, globex])('globex')).toEqual([globex])
  })
})

describe('searchTheme', () => {
  test('prepends the search hint to the key help line', () => {
    expect(stripVTControlCharacters(searchTheme.style.keysHelpTip([['⏎', 'select']]))).toBe(
      'type to search • ⏎ select',
    )
  })
})
