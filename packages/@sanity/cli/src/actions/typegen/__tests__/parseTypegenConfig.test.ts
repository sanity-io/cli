import {describe, expect, test} from 'vitest'

import {parseTypegenConfig} from '../parseTypegenConfig.js'

describe('parseTypegenConfig', () => {
  test('applies schema defaults for an empty config', async () => {
    expect(await parseTypegenConfig({})).toEqual({
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

  test('applies schema defaults when called without an argument', async () => {
    expect(await parseTypegenConfig()).toEqual(await parseTypegenConfig({}))
  })

  test('honors overrides and keeps remaining defaults', async () => {
    expect(
      await parseTypegenConfig({
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

  test('throws a TypeError with issue messages for invalid values', async () => {
    await expect(parseTypegenConfig({generates: 1})).rejects.toThrow(TypeError)
    await expect(parseTypegenConfig({generates: 1})).rejects.toThrow(
      /Error in typegen config[\s\S]*Invalid type: Expected string but received 1/,
    )
  })

  test('attaches the original ValiError as the cause', async () => {
    try {
      await parseTypegenConfig({schema: false})
      throw new Error('expected parseTypegenConfig to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError)
      expect(error).toHaveProperty('cause')
      expect((error as TypeError).cause).toBeInstanceOf(Error)
    }
  })
})
