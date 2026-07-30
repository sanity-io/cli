import {Card, Code} from '@sanity/ui'
import {type ObjectInputProps} from 'sanity'

/**
 * Shows a synced metafield's value. `value` isn't a declared field on `shopifyMetafield` — its shape
 * depends on the Shopify metafield type — so it's read from the raw object value here.
 */
export default function ShopifyMetafield(props: ObjectInputProps) {
  const {value} = (props.value || {}) as {value?: unknown}
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

  return (
    <Card border padding={3} radius={1} tone="transparent">
      <Code size={1} style={{margin: 0}}>
        {text ?? ''}
      </Code>
    </Card>
  )
}
