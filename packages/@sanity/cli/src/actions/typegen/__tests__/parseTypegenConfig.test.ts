import {describe, expect, test} from 'vitest'

import {parseTypegenConfig} from '../parseTypegenConfig.js'

describe('parseTypegenConfig', () => {
  test('applies schema defaults for an empty config', () => {
    expect(parseTypegenConfig({})).toEqual({
      formatGeneratedCode: true,
      generates: './sanity.types.ts',
      overloadClientMethods: true,
      path: [
        './src/**/*.{ts,tsx,js,jsx,mjs,cjs,astro,vue,svelte}',
        './app/**/*.{ts,tsx,js,jsx,mjs,cjs,astro,vue,svelte}',
        './sanity/**/*.{ts,tsx,js,jsx,mjs,cjs}',
      ],
      schema: './schema.json',
    })
  })

  test('applies schema defaults when called without an argument', () => {
    expect(parseTypegenConfig()).toEqual(parseTypegenConfig({}))
  })

  test('honors overrides and keeps remaining defaults', () => {
    expect(
      parseTypegenConfig({
        generates: './custom.types.ts',
        overloadClientMethods: false,
      }),
    ).toEqual({
      formatGeneratedCode: true,
      generates: './custom.types.ts',
      overloadClientMethods: false,
      path: [
        './src/**/*.{ts,tsx,js,jsx,mjs,cjs,astro,vue,svelte}',
        './app/**/*.{ts,tsx,js,jsx,mjs,cjs,astro,vue,svelte}',
        './sanity/**/*.{ts,tsx,js,jsx,mjs,cjs}',
      ],
      schema: './schema.json',
    })
  })

  test('throws a TypeError with issue messages for invalid values', () => {
    expect(() => parseTypegenConfig({generates: 1})).toThrow(TypeError)
    expect(() => parseTypegenConfig({generates: 1})).toThrow(
      /Error in typegen config[\s\S]*Invalid type: Expected string but received 1/,
    )
  })

  test('attaches the original ValiError as the cause', () => {
    try {
      parseTypegenConfig({schema: false})
      throw new Error('expected parseTypegenConfig to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError)
      expect(error).toHaveProperty('cause')
      expect((error as TypeError).cause).toBeInstanceOf(Error)
    }
  })
})
