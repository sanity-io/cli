import {describe, expect, test} from 'vitest'

import {type WorkbenchConfigValue} from '../../../../contract.js'
import {isMediaLibraryConfigApp} from '../configApp.js'

describe('isMediaLibraryConfigApp', () => {
  test('true for a config declaring the media-library appType', () => {
    const config: WorkbenchConfigValue = {appType: 'media-library', fields: []}
    expect(isMediaLibraryConfigApp({config})).toBe(true)
  })

  test('false without a config', () => {
    expect(isMediaLibraryConfigApp(undefined)).toBe(false)
    expect(isMediaLibraryConfigApp({})).toBe(false)
    expect(isMediaLibraryConfigApp({views: {}})).toBe(false)
  })

  test('false for a config of another type — presence alone is not enough', () => {
    const otherConfig = {appType: 'something-else', fields: []} as unknown as WorkbenchConfigValue
    expect(isMediaLibraryConfigApp({config: otherConfig})).toBe(false)
  })
})
