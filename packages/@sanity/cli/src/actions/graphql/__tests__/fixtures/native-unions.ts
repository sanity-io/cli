import {Schema} from '@sanity/schema'

// The compiled schema implicitly includes the intrinsic `image`, `file`,
// `globalDocumentReference` and `crossDatasetReference` types. Their lazily-resolved
// members (`.type` / `.to`) reference the built-in `sanity.*` asset and metadata types.
// The extractor walks every base type (including these intrinsics), so the full set of
// `sanity.*` types must be present in the schema or extraction throws e.g.
// "Unknown type: sanity.imageHotspot". These mirror the definitions other fixtures in
// this directory include.
const builtinTypes = [
  {
    fields: [
      {name: 'lat', type: 'number'},
      {name: 'lng', type: 'number'},
      {name: 'alt', type: 'number'},
    ],
    name: 'geopoint',
    type: 'object',
  },
  {
    fields: [
      {name: 'x', type: 'number'},
      {name: 'y', type: 'number'},
      {name: 'height', type: 'number'},
      {name: 'width', type: 'number'},
    ],
    name: 'sanity.imageHotspot',
    type: 'object',
  },
  {
    fields: [
      {name: 'top', type: 'number'},
      {name: 'bottom', type: 'number'},
      {name: 'left', type: 'number'},
      {name: 'right', type: 'number'},
    ],
    name: 'sanity.imageCrop',
    type: 'object',
  },
  {
    fields: [
      {name: 'height', type: 'number'},
      {name: 'width', type: 'number'},
      {name: 'aspectRatio', type: 'number'},
    ],
    name: 'sanity.imageDimensions',
    type: 'object',
  },
  {
    fields: [
      {name: 'background', type: 'string'},
      {name: 'foreground', type: 'string'},
      {name: 'population', type: 'number'},
      {name: 'title', type: 'string'},
    ],
    name: 'sanity.imagePaletteSwatch',
    type: 'object',
  },
  {
    fields: [
      {name: 'darkMuted', type: 'sanity.imagePaletteSwatch'},
      {name: 'lightVibrant', type: 'sanity.imagePaletteSwatch'},
      {name: 'darkVibrant', type: 'sanity.imagePaletteSwatch'},
      {name: 'vibrant', type: 'sanity.imagePaletteSwatch'},
      {name: 'dominant', type: 'sanity.imagePaletteSwatch'},
      {name: 'lightMuted', type: 'sanity.imagePaletteSwatch'},
      {name: 'muted', type: 'sanity.imagePaletteSwatch'},
    ],
    name: 'sanity.imagePalette',
    type: 'object',
  },
  {
    fields: [
      {name: 'location', type: 'geopoint'},
      {name: 'dimensions', type: 'sanity.imageDimensions'},
      {name: 'palette', type: 'sanity.imagePalette'},
      {name: 'lqip', type: 'string'},
      {name: 'blurHash', type: 'string'},
      {name: 'thumbHash', type: 'string'},
      {name: 'hasAlpha', type: 'boolean'},
      {name: 'isOpaque', type: 'boolean'},
    ],
    name: 'sanity.imageMetadata',
    type: 'object',
  },
  {
    fields: [
      {name: 'name', type: 'string'},
      {name: 'id', type: 'string'},
      {name: 'url', type: 'string'},
    ],
    name: 'sanity.assetSourceData',
    type: 'object',
  },
  {
    fields: [
      {name: 'originalFilename', type: 'string'},
      {name: 'label', type: 'string'},
      {name: 'title', type: 'string'},
      {name: 'description', type: 'string'},
      {name: 'altText', type: 'string'},
      {name: 'sha1hash', type: 'string'},
      {name: 'extension', type: 'string'},
      {name: 'mimeType', type: 'string'},
      {name: 'size', type: 'number'},
      {name: 'assetId', type: 'string'},
      {name: 'uploadId', type: 'string'},
      {name: 'path', type: 'string'},
      {name: 'url', type: 'string'},
      {name: 'metadata', type: 'sanity.imageMetadata'},
      {name: 'source', type: 'sanity.assetSourceData'},
    ],
    name: 'sanity.imageAsset',
    type: 'document',
  },
  {
    fields: [
      {name: 'originalFilename', type: 'string'},
      {name: 'label', type: 'string'},
      {name: 'title', type: 'string'},
      {name: 'description', type: 'string'},
      {name: 'altText', type: 'string'},
      {name: 'sha1hash', type: 'string'},
      {name: 'extension', type: 'string'},
      {name: 'mimeType', type: 'string'},
      {name: 'size', type: 'number'},
      {name: 'assetId', type: 'string'},
      {name: 'path', type: 'string'},
      {name: 'url', type: 'string'},
      {name: 'source', type: 'sanity.assetSourceData'},
    ],
    name: 'sanity.fileAsset',
    type: 'document',
  },
]

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
        {name: 'content', of: [{type: 'pageBlock'}], type: 'array'},
        {name: 'mixed', of: [{type: 'promotion'}, {type: 'gallery'}], type: 'array'},
        {name: 'target', to: [{type: 'editorialTarget'}], type: 'reference'},
        {
          name: 'relatedRefs',
          of: [{to: [{type: 'editorialTarget'}], type: 'reference'}],
          type: 'array',
        },
      ],
      name: 'campaign',
      type: 'document',
    },
  ],
})
