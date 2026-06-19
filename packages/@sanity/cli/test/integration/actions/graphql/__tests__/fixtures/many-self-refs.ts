import {Schema} from '@sanity/schema'

const repeat = <T>(times: number, callback: (index: number) => T) =>
  Array.from({length: times}, (_, index) => callback(index))

const allSchemaTypeNames = repeat(40, (index) => `schemaType${index}`)

const numReferenceFields = 2

const schemaTypes = allSchemaTypeNames.map((name, index) => ({
  fields: repeat(numReferenceFields, (fieldIndex) => ({
    name: `reference${fieldIndex}`,
    title: `Reference ${fieldIndex}`,
    to: allSchemaTypeNames.map((schemaTypeName) => ({type: schemaTypeName})),
    type: 'reference',
  })),
  name,
  title: `Schema type ${index}`,
  type: 'document',
}))

export default Schema.compile({
  types: [
    {
      fields: [
        {
          name: 'lat',
          title: 'Latitude',
          type: 'number',
        },
        {
          name: 'lng',
          title: 'Longitude',
          type: 'number',
        },
        {
          name: 'alt',
          title: 'Altitude',
          type: 'number',
        },
      ],
      name: 'geopoint',
      title: 'Geographical Point',
      type: 'object',
    },
    {
      fields: [
        {
          name: 'originalFilename',
          readOnly: true,
          title: 'Original file name',
          type: 'string',
        },
        {
          name: 'label',
          title: 'Label',
          type: 'string',
        },
        {
          name: 'title',
          title: 'Title',
          type: 'string',
        },
        {
          name: 'description',
          title: 'Description',
          type: 'string',
        },
        {
          name: 'altText',
          title: 'Alternative text',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'sha1hash',
          readOnly: true,
          title: 'SHA1 hash',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'extension',
          readOnly: true,
          title: 'File extension',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'mimeType',
          readOnly: true,
          title: 'Mime type',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'size',
          readOnly: true,
          title: 'File size in bytes',
          type: 'number',
        },
        {
          fieldset: 'system',
          name: 'assetId',
          readOnly: true,
          title: 'Asset ID',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'path',
          readOnly: true,
          title: 'Path',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'url',
          readOnly: true,
          title: 'Url',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'source',
          readOnly: true,
          title: 'Source',
          type: 'sanity.assetSourceData',
        },
      ],
      fieldsets: [
        {
          description: 'These fields are managed by the system and not editable',
          name: 'system',
          title: 'System fields',
        },
      ],
      name: 'sanity.fileAsset',
      orderings: [
        {
          by: [{direction: 'desc', field: 'size'}],
          name: 'fileSizeDesc',
          title: 'File size',
        },
      ],
      preview: {
        prepare(doc: Record<string, unknown>) {
          return {
            subtitle: `${doc.mimeType} (${((doc.size as number) / 1024 / 1024).toFixed(2)} MB)`,
            title: (doc.title as string) || ((doc.path as string) ?? '').split('/').at(-1),
          }
        },
        select: {
          mimeType: 'mimeType',
          path: 'path',
          size: 'size',
          title: 'originalFilename',
        },
      },
      title: 'File',
      type: 'document',
    },
    {
      fields: [
        {
          name: 'x',
          type: 'number',
        },
        {
          name: 'y',
          type: 'number',
        },
        {
          name: 'height',
          type: 'number',
        },
        {
          name: 'width',
          type: 'number',
        },
      ],
      name: 'sanity.imageHotspot',
      title: 'Image hotspot',
      type: 'object',
    },
    {
      fields: [
        {
          name: 'location',
          type: 'geopoint',
        },
        {
          fieldset: 'extra',
          name: 'dimensions',
          title: 'Dimensions',
          type: 'sanity.imageDimensions',
        },
        {
          fieldset: 'extra',
          name: 'palette',
          title: 'Palette',
          type: 'sanity.imagePalette',
        },
        {
          name: 'lqip',
          readOnly: true,
          title: 'LQIP (Low-Quality Image Placeholder)',
          type: 'string',
        },
        {
          name: 'blurHash',
          readOnly: true,
          title: 'BlurHash',
          type: 'string',
        },
        {
          name: 'thumbHash',
          readOnly: true,
          title: 'ThumbHash',
          type: 'string',
        },
        {
          name: 'hasAlpha',
          readOnly: true,
          title: 'Has alpha channel',
          type: 'boolean',
        },
        {
          name: 'isOpaque',
          readOnly: true,
          title: 'Is opaque',
          type: 'boolean',
        },
      ],
      fieldsets: [
        {
          name: 'extra',
          options: {
            collapsable: true,
          },
          title: 'Extra metadata…',
        },
      ],
      name: 'sanity.imageMetadata',
      title: 'Image metadata',
      type: 'object',
    },
    {
      fields: [
        {
          description: 'A canonical name for the source this asset is originating from',
          name: 'name',
          title: 'Source name',
          type: 'string',
        },
        {
          description:
            'The unique ID for the asset within the originating source so you can programatically find back to it',
          name: 'id',
          title: 'Asset Source ID',
          type: 'string',
        },
        {
          description: 'A URL to find more information about this asset in the originating source',
          name: 'url',
          title: 'Asset information URL',
          type: 'string',
        },
      ],
      name: 'sanity.assetSourceData',
      title: 'Asset Source Data',
      type: 'object',
    },
    {
      fields: [
        {
          name: 'top',
          type: 'number',
        },
        {
          name: 'bottom',
          type: 'number',
        },
        {
          name: 'left',
          type: 'number',
        },
        {
          name: 'right',
          type: 'number',
        },
      ],
      name: 'sanity.imageCrop',
      title: 'Image crop',
      type: 'object',
    },
    {
      fields: [
        {name: 'height', readOnly: true, title: 'Height', type: 'number'},
        {name: 'width', readOnly: true, title: 'Width', type: 'number'},
        {name: 'aspectRatio', readOnly: true, title: 'Aspect ratio', type: 'number'},
      ],
      name: 'sanity.imageDimensions',
      title: 'Image dimensions',
      type: 'object',
    },
    {
      fields: [
        {name: 'darkMuted', title: 'Dark Muted', type: 'sanity.imagePaletteSwatch'},
        {name: 'lightVibrant', title: 'Light Vibrant', type: 'sanity.imagePaletteSwatch'},
        {name: 'darkVibrant', title: 'Dark Vibrant', type: 'sanity.imagePaletteSwatch'},
        {name: 'vibrant', title: 'Vibrant', type: 'sanity.imagePaletteSwatch'},
        {name: 'dominant', title: 'Dominant', type: 'sanity.imagePaletteSwatch'},
        {name: 'lightMuted', title: 'Light Muted', type: 'sanity.imagePaletteSwatch'},
        {name: 'muted', title: 'Muted', type: 'sanity.imagePaletteSwatch'},
      ],
      name: 'sanity.imagePalette',
      title: 'Image palette',
      type: 'object',
    },
    {
      fields: [
        {name: 'background', readOnly: true, title: 'Background', type: 'string'},
        {name: 'foreground', readOnly: true, title: 'Foreground', type: 'string'},
        {name: 'population', readOnly: true, title: 'Population', type: 'number'},
        {name: 'title', readOnly: true, title: 'String', type: 'string'},
      ],
      name: 'sanity.imagePaletteSwatch',
      title: 'Image palette swatch',
      type: 'object',
    },
    {
      fields: [
        {
          name: 'originalFilename',
          readOnly: true,
          title: 'Original file name',
          type: 'string',
        },
        {
          name: 'label',
          title: 'Label',
          type: 'string',
        },
        {
          name: 'title',
          title: 'Title',
          type: 'string',
        },
        {
          name: 'description',
          title: 'Description',
          type: 'string',
        },
        {
          name: 'altText',
          title: 'Alternative text',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'sha1hash',
          readOnly: true,
          title: 'SHA1 hash',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'extension',
          readOnly: true,
          title: 'File extension',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'mimeType',
          readOnly: true,
          title: 'Mime type',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'size',
          readOnly: true,
          title: 'File size in bytes',
          type: 'number',
        },
        {
          fieldset: 'system',
          name: 'assetId',
          readOnly: true,
          title: 'Asset ID',
          type: 'string',
        },
        {
          fieldset: 'system',
          hidden: true,
          name: 'uploadId',
          readOnly: true,
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'path',
          readOnly: true,
          title: 'Path',
          type: 'string',
        },
        {
          fieldset: 'system',
          name: 'url',
          readOnly: true,
          title: 'Url',
          type: 'string',
        },
        {
          name: 'metadata',
          title: 'Metadata',
          type: 'sanity.imageMetadata',
        },
        {
          fieldset: 'system',
          name: 'source',
          readOnly: true,
          title: 'Source',
          type: 'sanity.assetSourceData',
        },
      ],
      fieldsets: [
        {
          description: 'These fields are managed by the system and not editable',
          name: 'system',
          title: 'System fields',
        },
      ],
      name: 'sanity.imageAsset',
      orderings: [
        {
          by: [{direction: 'desc', field: 'size'}],
          name: 'fileSizeDesc',
          title: 'File size',
        },
      ],
      preview: {
        prepare(doc: Record<string, unknown>) {
          return {
            media: {asset: {_ref: doc.id}},
            subtitle: `${doc.mimeType} (${((doc.size as number) / 1024 / 1024).toFixed(2)} MB)`,
            title: (doc.title as string) || ((doc.path as string) ?? '').split('/').at(-1),
          }
        },
        select: {
          id: '_id',
          mimeType: 'mimeType',
          size: 'size',
          title: 'originalFilename',
        },
      },
      title: 'Image',
      type: 'document',
    },
    ...schemaTypes,
  ],
})
