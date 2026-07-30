import {Card, Code, Text} from '@sanity/ui'
import {type ObjectInputProps} from 'sanity'
import {formatMetafieldValue} from '../../utils/formatMetafieldValue'

/**
 * Read-only display of a synced Shopify metafield's value.
 *
 * `value` is not declared on the `shopifyMetafield` schema type, so it has to be read from the raw
 * object value here. The array row already shows the namespace, key and type, so this renders the
 * value only.
 */
const ShopifyMetafield = (props: ObjectInputProps) => {
  const {type, value} = (props.value || {}) as {type?: string; value?: unknown}

  const formattedValue = formatMetafieldValue(type, value)

  return (
    <Card border padding={3} radius={1} tone="transparent">
      {formattedValue ? (
        // Only `json` and `rich_text_field` keep their line breaks and need the monospace block.
        formattedValue.includes('\n') ? (
          <Code size={1} style={{margin: 0}}>
            {formattedValue}
          </Code>
        ) : (
          <Text size={1}>{formattedValue}</Text>
        )
      ) : (
        <Text muted size={1}>
          No value
        </Text>
      )}
    </Card>
  )
}

export default ShopifyMetafield
