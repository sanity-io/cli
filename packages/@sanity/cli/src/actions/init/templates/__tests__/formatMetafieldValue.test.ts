import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

import {formatMetafieldValue} from '../../../../../templates/shopify/utils/formatMetafieldValue.js'

const templatesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../templates',
)

describe('formatMetafieldValue', () => {
  test.each([
    ['dimension', {unit: 'cm', value: 10}, '10 cm'],
    ['weight', {unit: 'kg', value: 2.5}, '2.5 kg'],
    ['volume', {unit: 'l', value: 1}, '1 l'],
    ['money', {amount: '19.99', currency_code: 'USD'}, '19.99 USD'],
    ['rating', {scale_max: 5, value: 4}, '4 / 5'],
    ['list.single_line_text_field', ['red', 'blue'], 'red, blue'],
  ])('formats %s', (type, value, expected) => {
    expect(formatMetafieldValue(type, value)).toBe(expected)
  })

  test('returns an empty string for null and undefined', () => {
    expect(formatMetafieldValue('single_line_text_field', null)).toBe('')
    expect(formatMetafieldValue('single_line_text_field', undefined)).toBe('')
  })

  test('passes through scalars that need no formatter', () => {
    expect(formatMetafieldValue('single_line_text_field', 'hello')).toBe('hello')
    expect(formatMetafieldValue('number_integer', 42)).toBe('42')
    expect(formatMetafieldValue('boolean', true)).toBe('true')
  })

  test('falls back to JSON for unmapped object types', () => {
    expect(formatMetafieldValue('list.number_integer', [1, 2])).toBe('[1,2]')
    expect(formatMetafieldValue('json', {a: 1})).toBe('{"a":1}')
  })

  test('falls back when the type is missing', () => {
    expect(formatMetafieldValue(undefined, 'raw')).toBe('raw')
    expect(formatMetafieldValue(undefined, {a: 1})).toBe('{"a":1}')
  })

  test('both template copies stay identical', async () => {
    const [shopify, storefront] = await Promise.all(
      ['shopify', 'shopify-online-storefront'].map((template) =>
        readFile(path.join(templatesRoot, template, 'utils/formatMetafieldValue.ts'), 'utf8'),
      ),
    )

    expect(storefront).toBe(shopify)
  })
})
