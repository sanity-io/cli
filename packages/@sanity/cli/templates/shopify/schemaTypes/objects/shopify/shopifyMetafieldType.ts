import {TagIcon} from '@sanity/icons'
import {defineField} from 'sanity'

import ShopifyMetafield from '../../../components/inputs/ShopifyMetafield'
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
      description: 'Shopify metafield type, e.g. single_line_text_field',
    }),
    // `value` is deliberately not declared. Its shape depends on the metafield type — a string,
    // number, boolean, list or object — and no Sanity field type accepts all of those. A declared
    // field is always type-checked, even when hidden, so declaring it reports a validation error on
    // every value that is not a string. Undeclared fields are only flagged outside the Studio, so
    // this stays quiet; `ShopifyMetafield` renders the value from the raw object value.
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
