import {TagIcon} from '@sanity/icons/Tag'
import {defineField, defineType} from 'sanity'

import ShopifyMetafield from '../../components/inputs/ShopifyMetafield'
import {formatMetafieldValue} from '../../utils/formatMetafieldValue'

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
    }),
    // `value` is deliberately left undeclared: it can be a string, number, boolean, list or object
    // depending on the metafield type, and a declared field is type-checked even when hidden.
  ],
  preview: {
    select: {
      key: 'key',
      namespace: 'namespace',
      type: 'type',
      value: 'value',
    },
    prepare({key, namespace, type, value}) {
      const name = [namespace, key].filter(Boolean).join('.')
      return {
        subtitle: formatMetafieldValue(type, value),
        title: type ? `${name} (${type})` : name,
      }
    },
  },
})
