import {type CliConfig} from '@sanity/cli-core'
import {describe, expect, test} from 'vitest'

import {unstable_defineApp, unstable_defineMediaLibrary} from '../defineApp.js'
import {resolveWorkbenchConfig} from '../resolveWorkbenchConfig.js'

const asConfig = (app: unknown) => ({app}) as CliConfig

describe('resolveWorkbenchConfig', () => {
  test.each([
    ['a null config', null],
    ['an undefined config', undefined],
    ['a config without an app', {} as CliConfig],
    ['a plain (unbranded) app', asConfig({name: 'plain'})],
    // An app is not a config — it resolves through `resolveWorkbenchApp`.
    ['a branded app', asConfig(unstable_defineApp({organizationId: 'o', slug: 's', title: 'T'}))],
  ])('returns null for %s', (_label, config) => {
    expect(resolveWorkbenchConfig(config as CliConfig | null | undefined)).toBeNull()
  })

  test('resolves a media library config to its appType, organizationId, and fields', () => {
    const config = asConfig(
      unstable_defineMediaLibrary({
        fields: [{name: 'rights', src: './src/rights.ts', title: 'Rights'}],
        organizationId: 'org-123',
      }),
    )

    expect(resolveWorkbenchConfig(config)).toEqual({
      appType: 'media-library',
      fields: [{name: 'rights', src: './src/rights.ts', title: 'Rights'}],
      organizationId: 'org-123',
    })
  })

  test('resolves a config with no fields', () => {
    const config = asConfig(unstable_defineMediaLibrary({organizationId: 'org-123'}))

    expect(resolveWorkbenchConfig(config)).toEqual({
      appType: 'media-library',
      fields: [],
      organizationId: 'org-123',
    })
  })

  test('throws on duplicate field names', () => {
    const config = asConfig(
      unstable_defineMediaLibrary({
        fields: [
          {name: 'dupe', src: './src/a.ts', title: 'A'},
          {name: 'dupe', src: './src/b.ts', title: 'B'},
        ],
        organizationId: 'org-123',
      }),
    )

    expect(() => resolveWorkbenchConfig(config)).toThrow(/unique/)
  })
})
