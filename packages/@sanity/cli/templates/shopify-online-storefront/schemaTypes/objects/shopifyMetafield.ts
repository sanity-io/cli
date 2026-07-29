import {TagIcon} from '@sanity/icons'
import {defineField, defineType} from 'sanity'

import ShopifyMetafield from '../../components/inputs/ShopifyMetafield'
import {formatMetafieldValuePreview} from '../../utils/formatMetafieldValue'

export default defineType({
  title: 'Metafield',
  name: 'shopifyMetafield',
  type: 'object',
  icon: TagIcon,
  readOnly: true,
  components: {
    input: ShopifyMetafield,
  },
  fields: [
    // Namespace
    defineField({
      title: 'Namespace',
      name: 'namespace',
      type: 'string',
    }),
    // Key
    defineField({
      title: 'Key',
      name: 'key',
      type: 'string',
    }),
    // Type
    defineField({
      title: 'Type',
      name: 'type',
      type: 'string',
      description: 'Shopify metafield type, e.g. single_line_text_field',
    }),
  ],
  preview: {
    select: {
      key: 'key',
      namespace: 'namespace',
      type: 'type',
      value: 'value',
    },
    prepare({key, namespace, type, value}) {
      return {
        subtitle: formatMetafieldValuePreview(type, value) || type,
        title: [namespace, key].filter(Boolean).join('.'),
      }
    },
  },
})
