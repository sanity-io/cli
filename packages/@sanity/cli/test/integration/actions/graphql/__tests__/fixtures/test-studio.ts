import {Schema} from '@sanity/schema'

export default Schema.compile({
  types: [
    {
      fields: [
        {
          deprecated: {
            reason: 'This field is no longer used',
          },
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
          name: 'current',
          title: 'Current slug',
          type: 'string',
        },
      ],
      name: 'slug',
      title: 'Slug',
      type: 'object',
    },
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
      components: {input: {}},
      fields: [
        {name: 'language', title: 'Language', type: 'string'},
        {name: 'filename', title: 'Filename', type: 'string'},
        {name: 'code', title: 'Code', type: 'text'},
        {
          name: 'highlightedLines',
          of: [{title: 'Highlighted line', type: 'number'}],
          title: 'Highlighted lines',
          type: 'array',
        },
      ],
      icon: {},
      name: 'code',
      preview: {
        select: {
          code: 'code',
          filename: 'filename',
          highlightedLines: 'highlightedLines',
          language: 'language',
        },
      },
      title: 'Code',
      type: 'object',
    },
    {
      fields: [
        {name: 'hex', title: 'Hex', type: 'string'},
        {name: 'alpha', title: 'Alpha', type: 'number'},
        {name: 'hsl', title: 'Hue Saturation Lightness', type: 'hslaColor'},
        {name: 'hsv', title: 'Hue Saturation Value', type: 'hsvaColor'},
        {name: 'rgb', title: 'Red Green Blue (rgb)', type: 'rgbaColor'},
      ],
      name: 'color',
      preview: {select: {alpha: 'alpha', hex: 'hex', hsl: 'hsl', title: 'hex'}},
      title: 'Color',
      type: 'object',
    },
    {
      fields: [
        {name: 'r', title: 'Red', type: 'number'},
        {name: 'g', title: 'Green', type: 'number'},
        {name: 'b', title: 'Blue', type: 'number'},
        {name: 'a', title: 'Alpha', type: 'number'},
      ],
      name: 'rgbaColor',
      title: 'Red Green Blue (rgb)',
      type: 'object',
    },
    {
      fields: [
        {name: 'h', title: 'Hue', type: 'number'},
        {name: 's', title: 'Saturation', type: 'number'},
        {name: 'v', title: 'Value', type: 'number'},
        {name: 'a', title: 'Alpha', type: 'number'},
      ],
      name: 'hsvaColor',
      title: 'Hue Saturation Value',
      type: 'object',
    },
    {
      fields: [
        {name: 'h', title: 'Hue', type: 'number'},
        {name: 's', title: 'Saturation', type: 'number'},
        {name: 'l', title: 'Lightness', type: 'number'},
        {name: 'a', title: 'Alpha', type: 'number'},
      ],
      name: 'hslaColor',
      title: 'Hue Saturation Lightness',
      type: 'object',
    },
    {
      fields: [
        {name: 'status', type: 'string'},
        {name: 'assetId', type: 'string'},
        {name: 'playbackId', type: 'string'},
        {name: 'filename', type: 'string'},
        {name: 'thumbTime', type: 'number'},
      ],
      name: 'mux.videoAsset',
      title: 'Video asset',
      type: 'object',
    },
    {
      fields: [
        {
          name: 'asset',
          title: 'Video',
          to: [{type: 'mux.videoAsset'}],
          type: 'reference',
          weak: true,
        },
      ],
      name: 'mux.video',
      preview: {
        select: {
          duration: 'asset.data.duration',
          filename: 'asset.filename',
          playbackId: 'asset.playbackId',
          playbackIds: 'asset.data.playback_ids',
          status: 'asset.status',
          thumbTime: 'asset.thumbTime',
        },
      },
      title: 'Video asset reference',
      type: 'object',
    },
    {
      fields: [
        {name: 'optimistic', title: 'Optimistic estimate', type: 'number'},
        {name: 'nominal', title: 'Nominal estimate', type: 'number'},
        {name: 'pessimistic', title: 'Pessimistic estimate', type: 'number'},
        {name: 'calculated', readOnly: true, title: 'Pert estimate', type: 'number'},
      ],
      name: 'pertEstimate',
      title: 'PERT-estimate',
      type: 'object',
    },
    {
      deprecated: {
        reason: 'Entire `Document actions` document type deprecated',
      },
      fields: [{name: 'title', title: 'Title', type: 'string'}],
      name: 'documentActionsTest',
      title: 'Document actions',
      type: 'document',
    },
    {
      fields: [
        {name: 'title', title: 'Title', type: 'string'},
        {name: 'someString', title: 'Some String', type: 'deprecatedString'},
        {name: 'someObject', title: 'Some Object', type: 'deprecatedObject'},
        {name: 'primitives', of: [{type: 'string'}], title: 'Primitives', type: 'array'},
      ],
      name: 'poppers',
      title: 'Poppers',
      type: 'document',
    },
    {
      fields: [
        {name: 'fieldNo0', type: 'string'},
        {name: 'arrayNo1', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo2', type: 'string'},
        {name: 'arrayNo3', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo4', type: 'string'},
        {name: 'arrayNo5', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo6', type: 'string'},
        {name: 'arrayNo7', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo8', type: 'string'},
        {name: 'arrayNo9', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo10', type: 'string'},
        {name: 'arrayNo11', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo12', type: 'string'},
        {name: 'arrayNo13', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo14', type: 'string'},
        {name: 'arrayNo15', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo16', type: 'string'},
        {name: 'arrayNo17', of: [{type: 'objectWithNestedArray'}], type: 'array'},
        {name: 'fieldNo18', type: 'string'},
        {name: 'arrayNo19', of: [{type: 'objectWithNestedArray'}], type: 'array'},
      ],
      name: 'objectWithNestedArray',
      type: 'object',
    },
    {
      description: 'This represents an author',
      fields: [
        {name: 'name', title: 'Name', type: 'string'},
        {name: 'bestFriend', title: 'Best friend', to: [{type: 'author'}], type: 'reference'},
        {
          name: 'role',
          options: {
            list: [
              {title: 'Developer', value: 'developer'},
              {title: 'Designer', value: 'designer'},
              {title: 'Operations', value: 'ops'},
            ],
          },
          title: 'Role',
          type: 'string',
        },
        {name: 'image', options: {hotspot: true}, title: 'Image', type: 'image'},
        {name: 'awards', of: [{type: 'string'}], title: 'Awards', type: 'array'},
        {
          name: 'minimalBlock',
          of: [{lists: [], marks: {annotations: [], decorators: []}, styles: [], type: 'block'}],
          title: 'Reset all options',
          type: 'array',
        },
      ],
      name: 'author',
      preview: {
        select: {
          awards: 'awards',
          lastUpdated: '_updatedAt',
          media: 'image',
          relatedAuthors: 'relatedAuthors',
          role: 'role',
          title: 'name',
        },
      },
      title: 'Author',
      type: 'document',
    },
    {
      dataset: 'production',
      name: 'cdrPersonReference',
      title: 'Person in another dataset',
      to: [
        {
          preview: {
            select: {
              media: 'image',
              title: 'name',
            },
          },
          type: 'person',
        },
      ],
      type: 'crossDatasetReference',
    },
    {
      fields: [
        {
          dataset: 'production',
          name: 'cdrFieldInline',
          to: [
            {
              preview: {
                select: {title: 'name'},
              },
              type: 'person',
            },
            {
              preview: {
                select: {title: 'name'},
              },
              type: 'place',
            },
          ],
          type: 'crossDatasetReference',
        },
        {
          name: 'cdrFieldNamed',
          type: 'cdrPersonReference',
        },
      ],
      name: 'documentWithCdrField',
      title: 'Document with CDR Field',
      type: 'document',
    },
    {
      deprecated: {
        reason: 'This string type has been deprecated',
      },
      name: 'deprecatedString',
      title: 'Deprecated String',
      type: 'string',
    },
    {
      deprecated: {
        reason: 'This object type has been deprecated',
      },
      fields: [
        {
          name: 'name',
          title: 'Name',
          type: 'string',
        },
        {
          deprecated: {
            reason: 'This field is no longer used',
          },
          name: 'description',
          title: 'Description',
          type: 'string',
        },
        {
          name: 'excerpt',
          title: 'Excerpt',
          type: 'deprecatedString',
        },
      ],
      name: 'deprecatedObject',
      title: 'Deprecated Object',
      type: 'object',
    },
  ],
})
