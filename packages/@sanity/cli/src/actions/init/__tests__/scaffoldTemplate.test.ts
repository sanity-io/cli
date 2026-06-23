import {describe, expect, test} from 'vitest'

import {templateChoices} from '../scaffoldTemplate.js'

describe('templateChoices', () => {
  test('offers the page-builder template', () => {
    const values = templateChoices.map((choice) => choice.value)
    expect(values).toContain('page-builder')
  })
})
