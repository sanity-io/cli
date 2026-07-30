import {TagIcon} from '@sanity/icons'
import {defineField} from 'sanity'

import ShopifyMetafield from '../../../components/inputs/ShopifyMetafield'

export const shopifyMetafieldType = defineField({
  title: 'Metafield',
  name: 'shopifyMetafield',
  type: 'object',
  icon: TagIcon,
  readOnly: true,
  components: {
    input: ShopifyMetafield,
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
    }),
    // `value` is deliberately left undeclared: it can be a string, number, boolean, list or object
    // depending on the metafield type, and a declared field is type-checked even when hidden.
  ],
  preview: {
    select: {
      key: 'key',
      namespace: 'namespace',
      value: 'value',
    },
    prepare({key, namespace, value}) {
      return {
        subtitle: typeof value === 'string' ? value : JSON.stringify(value),
        title: [namespace, key].filter(Boolean).join('.'),
      }
    },
  },
})
