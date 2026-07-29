import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'shopifyCollection',
  title: 'Shopify',
  type: 'object',
  options: {
    collapsed: false,
    collapsible: true,
  },
  readOnly: true,
  fieldsets: [
    {
      name: 'status',
      title: 'Status',
    },
    {
      name: 'metafields',
      title: 'Metafields',
      options: {
        collapsed: true,
        collapsible: true,
      },
    },
  ],
  fields: [
    // Created at
    defineField({
      fieldset: 'status',
      name: 'createdAt',
      title: 'Created at',
      type: 'string',
    }),
    // Updated at
    defineField({
      fieldset: 'status',
      name: 'updatedAt',
      title: 'Updated at',
      type: 'string',
    }),
    // Deleted
    defineField({
      fieldset: 'status',
      name: 'isDeleted',
      title: 'Deleted from Shopify?',
      type: 'boolean',
    }),
    // Title
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    // Collection ID
    defineField({
      name: 'id',
      title: 'ID',
      type: 'number',
      description: 'Shopify Collection ID',
    }),
    // GID
    defineField({
      name: 'gid',
      title: 'GID',
      type: 'string',
      description: 'Shopify Collection GID',
    }),
    // Slug
    defineField({
      name: 'slug',
      title: 'Slug',
      description: 'Shopify Collection handle',
      type: 'slug',
    }),
    // Description
    defineField({
      name: 'descriptionHtml',
      title: 'HTML Description',
      type: 'text',
      rows: 5,
    }),
    // Image URL
    defineField({
      name: 'imageUrl',
      title: 'Image URL',
      type: 'string',
    }),
    // Rules
    defineField({
      name: 'rules',
      title: 'Rules',
      type: 'array',
      description: 'Include Shopify products that satisfy these conditions',
      of: [{type: 'collectionRule'}],
    }),
    // Disjunctive rules
    defineField({
      name: 'disjunctive',
      title: 'Disjunctive rules?',
      description: 'Require any condition if true, otherwise require all conditions',
      type: 'boolean',
    }),
    // Sort order
    defineField({
      name: 'sortOrder',
      title: 'Sort order',
      type: 'string',
    }),
    // Metafields
    defineField({
      fieldset: 'metafields',
      name: 'metafields',
      title: 'Metafields',
      type: 'array',
      description:
        'Shopify metafields, for the namespaces selected in Sanity Connect. Replaced in full on every sync',
      // Keep this a single-member array: Sanity resolves members without a `_type` to the sole
      // member type, and synced metafields carry only a `_key`.
      of: [{type: 'shopifyMetafield'}],
    }),
    // Shop details
    defineField({
      name: 'shop',
      title: 'Shop',
      type: 'shop',
      description: 'Shopify Shop details',
    }),
  ],
})
