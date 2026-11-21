import path from 'node:path'

import {describe, expect, test} from 'vitest'

import {getResourceKey, parseTypegenResources} from '../parseTypegenResources.js'

const workDir = path.resolve('/project')

const production = {
  dataset: 'production',
  generates: './src/sanity.types.production.ts',
  projectId: 'abc123',
}
const staging = {
  dataset: 'staging',
  generates: './src/sanity.types.staging.ts',
  projectId: 'abc123',
  schema: './schema.staging.json',
}

describe('getResourceKey', () => {
  test('joins the project ID and dataset with a dot, matching the SDK runtime key', () => {
    expect(getResourceKey({dataset: 'production', projectId: 'abc123'})).toBe('abc123.production')
  })
})

describe('parseTypegenResources', () => {
  test('returns undefined when resources is not set', async () => {
    expect(await parseTypegenResources(undefined, workDir)).toBeUndefined()
    expect(await parseTypegenResources({generates: './sanity.types.ts'}, workDir)).toBeUndefined()
  })

  test('returns the resources and the shared settings', async () => {
    const parsed = await parseTypegenResources(
      {
        path: './app/**/*.ts',
        resources: [production, staging],
      },
      workDir,
    )

    expect(parsed?.resources).toEqual([production, staging])
    expect(parsed?.config.path).toBe('./app/**/*.ts')
    expect(parsed?.config.formatGeneratedCode).toBe(true)
    expect(parsed?.warnings).toEqual([])
  })

  test('defaults overloadClientMethods to false', async () => {
    expect(
      (await parseTypegenResources({resources: [production]}, workDir))?.config
        .overloadClientMethods,
    ).toBe(false)
  })

  test('keeps an explicit overloadClientMethods', async () => {
    const parsed = await parseTypegenResources(
      {overloadClientMethods: true, resources: [production]},
      workDir,
    )
    expect(parsed?.config.overloadClientMethods).toBe(true)
    expect(parsed?.warnings).toEqual([])
  })

  test('warns when overloadClientMethods is enabled for more than one resource', async () => {
    const parsed = await parseTypegenResources(
      {
        overloadClientMethods: true,
        resources: [production, staging],
      },
      workDir,
    )
    expect(parsed?.warnings).toEqual([expect.stringContaining('TS2717')])
  })

  test('rejects a resource listed twice', async () => {
    await expect(
      parseTypegenResources(
        {
          resources: [production, {...production, generates: './other.ts'}],
        },
        workDir,
      ),
    ).rejects.toThrow(/"abc123\.production" is listed more than once/)
  })

  test('rejects two resources writing the same file, comparing normalized paths', async () => {
    await expect(
      parseTypegenResources(
        {
          resources: [
            {...production, generates: './src/sanity.types.ts'},
            {...staging, generates: 'src/sanity.types.ts'},
          ],
        },
        workDir,
      ),
    ).rejects.toThrow(
      /"abc123\.production" and "abc123\.staging" both generate "src\/sanity\.types\.ts"/,
    )
  })

  test('rejects a relative and an absolute path to the same file', async () => {
    await expect(
      parseTypegenResources(
        {
          resources: [
            {...production, generates: './src/sanity.types.ts'},
            {...staging, generates: path.join(workDir, 'src', 'sanity.types.ts')},
          ],
        },
        workDir,
      ),
    ).rejects.toThrow(/both generate/)
  })

  test('rejects output paths that differ only in case', async () => {
    await expect(
      parseTypegenResources(
        {
          resources: [
            {...production, generates: './src/Sanity.Types.ts'},
            {...staging, generates: './src/sanity.types.ts'},
          ],
        },
        workDir,
      ),
    ).rejects.toThrow(/both generate/)
  })

  test('warns about top-level schema and generates, which resources replace', async () => {
    const parsed = await parseTypegenResources(
      {generates: './sanity.types.ts', resources: [production], schema: './schema.json'},
      workDir,
    )
    expect(parsed?.warnings).toEqual([
      'typegen.schema is not used when typegen.resources is set. Each resource sets its own.',
      'typegen.generates is not used when typegen.resources is set. Each resource sets its own.',
    ])
  })

  test('warns that enforceRequiredFields does nothing for a local schema file', async () => {
    const parsed = await parseTypegenResources(
      {
        resources: [
          {...production, enforceRequiredFields: true},
          {...staging, enforceRequiredFields: true},
        ],
      },
      workDir,
    )
    expect(parsed?.warnings).toEqual([
      expect.stringContaining('enforceRequiredFields has no effect for "abc123.staging"'),
    ])
  })

  test('rejects an empty list', async () => {
    await expect(parseTypegenResources({resources: []}, workDir)).rejects.toThrow(
      /resources: List at least one resource/,
    )
  })

  test('names the field of an invalid resource', async () => {
    await expect(
      parseTypegenResources({resources: [production, {...staging, projectId: ''}]}, workDir),
    ).rejects.toThrow(/resources\.1\.projectId: Must not be empty/)
    await expect(
      // @ts-expect-error -- `generates` is missing
      parseTypegenResources({resources: [{dataset: 'production', projectId: 'abc123'}]}, workDir),
    ).rejects.toThrow(/resources\.0\.generates: /)
  })

  test('rejects unknown resource fields', async () => {
    await expect(
      // @ts-expect-error -- `schemaPath` is not a resource field
      parseTypegenResources({resources: [{...production, schemaPath: './schema.json'}]}, workDir),
    ).rejects.toThrow(/resources\.0\.schemaPath: /)
  })

  test('throws a TypeError with the validation error as its cause', async () => {
    try {
      // @ts-expect-error -- `resources` must be an array
      await parseTypegenResources({resources: 'abc123.production'}, workDir)
      throw new Error('expected parseTypegenResources to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError)
      expect((error as TypeError).cause).toBeInstanceOf(Error)
    }
  })
})
