import {describe, expect, test} from 'vitest'

import pageBuilder from '../pageBuilder.js'

describe('pageBuilder template', () => {
  test('declares @sanity/presets as a dependency', () => {
    expect(pageBuilder.dependencies?.['@sanity/presets']).toMatch(/^\^?\d+\.\d+\.\d+/)
  })
})
