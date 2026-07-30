import {TagIcon} from '@sanity/icons'
import {defineField} from 'sanity'

import ShopifyMetafieldInput from '../../../components/inputs/ShopifyMetafield'
import {
  formatMetafieldLabel,
  formatMetafieldValuePreview,
} from '../../../utils/formatMetafieldValue'

export const shopifyMetafieldType = defineField({
  title: 'Metafield',
  name: 'shopifyMetafield',
  type: 'object',
  icon: TagIcon,
  readOnly: true,
  components: {
    input: ShopifyMetafieldInput,
  },
  fields: [
    defineField({
      name: 'namespace',
      type: 'string',
    }),
    defineField({
      name: 'key',
      type: 'string',
    }),
    defineField({
      name: 'type',
      type: 'string',
      description: 'Shopify metafield type, e.g. single_line_text_field',
    }),
  ],
  preview: {
    select: {
      itemKey: '_key',
      key: 'key',
      namespace: 'namespace',
      type: 'type',
      value: 'value',
    },
    prepare({itemKey, key, namespace, type, value}) {
      return {
        subtitle: formatMetafieldValuePreview(type, value) || type,
        title: formatMetafieldLabel({_key: itemKey, key, namespace}),
      }
    },
  },
})
