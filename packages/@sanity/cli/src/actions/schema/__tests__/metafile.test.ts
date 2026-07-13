import {describe, expect, it} from 'vitest'

import {generateMetafile} from '../metafile.js'

describe('generateMetafile', () => {
  it('handles an empty schema', () => {
    expect(
      generateMetafile({
        hoisted: {},
        size: 0,
        types: {},
      }),
    ).toEqual({
      inputs: {},
      outputs: {
        root: {
          bytes: 0,
          exports: [],
          imports: [],
          inputs: {},
        },
      },
    })
  })

  it('generates entries for root types and hoisted types', () => {
    const metafile = generateMetafile({
      hoisted: {
        slug: {
          extends: 'string',
          size: 3,
        },
      },
      size: 0,
      types: {
        post: {
          extends: 'document',
          size: 5,
        },
      },
    })

    expect(Object.keys(metafile.inputs).toSorted()).toEqual([
      'hoisted/slug',
      'schema/document/post',
    ])

    expect(metafile.inputs['schema/document/post']).toEqual({
      bytes: 5,
      format: 'esm',
      imports: [],
    })

    expect(metafile.outputs.root.bytes).toBe(8)
  })

  it('subtracts child sizes and recursively emits field and array entries', () => {
    const metafile = generateMetafile({
      hoisted: {},
      size: 0,
      types: {
        post: {
          extends: 'document',
          fields: {
            authors: {
              extends: 'array',
              of: {
                author: {
                  extends: 'reference',
                  size: 6,
                },
              },
              size: 10,
            },
            title: {
              extends: 'string',
              size: 4,
            },
          },
          size: 20,
        },
      },
    })

    expect(Object.keys(metafile.inputs).toSorted()).toEqual([
      'schema/document/post',
      'schema/document/post/authors',
      'schema/document/post/authors/author',
      'schema/document/post/title',
    ])

    // self size = 20 - (4 + 10)
    expect(metafile.inputs['schema/document/post'].bytes).toBe(6)

    // self size = 10 - 6
    expect(metafile.inputs['schema/document/post/authors'].bytes).toBe(4)

    expect(metafile.inputs['schema/document/post/authors/author'].bytes).toBe(6)
    expect(metafile.inputs['schema/document/post/title'].bytes).toBe(4)

    // 6 + 4 + 6 + 4
    expect(metafile.outputs.root.bytes).toBe(20)

    expect(metafile.outputs.root.inputs).toEqual({
      'schema/document/post': {bytesInOutput: 6},
      'schema/document/post/authors': {bytesInOutput: 4},
      'schema/document/post/authors/author': {bytesInOutput: 6},
      'schema/document/post/title': {bytesInOutput: 4},
    })
  })
})
