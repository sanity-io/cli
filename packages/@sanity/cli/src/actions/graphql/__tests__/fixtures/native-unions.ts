import {Schema} from '@sanity/schema'
import {builtinTypes} from '@sanity/schema/_internal'

// The compiled schema implicitly references the intrinsic `image`/`file`/reference types,
// whose members resolve to the built-in `sanity.*` asset and metadata types. The extractor
// walks every base type, so those built-ins must be present or extraction throws e.g.
// "Unknown type: sanity.imageHotspot". `builtinTypes` is the canonical set exported from
// `@sanity/schema/_internal`.

export default Schema.compile({
  types: [
    ...builtinTypes,
    {fields: [{name: 'sku', type: 'string'}], name: 'productPromotion', type: 'object'},
    {fields: [{name: 'slug', type: 'string'}], name: 'articlePromotion', type: 'object'},
    {fields: [{name: 'title', type: 'string'}], name: 'gallery', type: 'object'},
    {fields: [{name: 'title', type: 'string'}], name: 'book', type: 'document'},
    {fields: [{name: 'name', type: 'string'}], name: 'author', type: 'document'},
    {
      name: 'promotion',
      of: [{type: 'productPromotion'}, {type: 'articlePromotion'}],
      type: 'union',
    },
    {name: 'pageBlock', of: [{type: 'promotion'}, {type: 'gallery'}], type: 'union'},
    {name: 'editorialTarget', of: [{type: 'book'}, {type: 'author'}], type: 'union'},
    {
      fields: [
        {name: 'featuredPromotion', type: 'promotion'},
        {name: 'featuredBlock', type: 'pageBlock'},
        {name: 'content', of: [{type: 'pageBlock'}], type: 'array'},
        {name: 'mixed', of: [{type: 'promotion'}, {type: 'gallery'}], type: 'array'},
        {name: 'target', to: [{type: 'editorialTarget'}], type: 'reference'},
        {
          name: 'relatedRefs',
          of: [{to: [{type: 'editorialTarget'}], type: 'reference'}],
          type: 'array',
        },
        // Array mixing a named union with a reference: not nameable from the declared
        // view, so naming must fall back to the effective concatenation.
        {
          name: 'mixedRef',
          of: [{type: 'promotion'}, {to: [{type: 'book'}], type: 'reference'}],
          type: 'array',
        },
      ],
      name: 'campaign',
      type: 'document',
    },
  ],
})
