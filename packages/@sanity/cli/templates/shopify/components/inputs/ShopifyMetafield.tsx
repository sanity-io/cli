import {Card, Code} from '@sanity/ui'
import {type ObjectInputProps} from 'sanity'
import {formatMetafieldValue} from '../../utils/formatMetafieldValue'

/**
 * Shows a synced metafield's value. `value` isn't a declared field on `shopifyMetafield` — its shape
 * depends on the Shopify metafield type — so it's read from the raw object value here.
 */
export default function ShopifyMetafield(props: ObjectInputProps) {
  const {type, value} = (props.value || {}) as {type?: string; value?: unknown}
  const text = formatMetafieldValue(type, value)

  return (
    <Card border padding={3} radius={1} tone="transparent">
      <Code size={1} style={{margin: 0}}>
        {text}
      </Code>
    </Card>
  )
}
