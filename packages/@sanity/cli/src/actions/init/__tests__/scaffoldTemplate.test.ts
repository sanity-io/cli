import {describe, expect, test} from 'vitest'

import {getTemplateChoices} from '../scaffoldTemplate.js'

describe('getTemplateChoices', () => {
  test('includes the page-builder template in non-production environments', () => {
    const values = getTemplateChoices('staging').map((choice) => choice.value)
    expect(values).toContain('page-builder')
  })

  test('excludes the page-builder template in production', () => {
    const values = getTemplateChoices('production').map((choice) => choice.value)
    expect(values).not.toContain('page-builder')
  })
})
