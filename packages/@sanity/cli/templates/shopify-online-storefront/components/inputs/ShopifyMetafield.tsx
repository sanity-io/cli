import {LockIcon} from '@sanity/icons'
import {Box, Card, Code, Flex, Stack, Text} from '@sanity/ui'
import {type ObjectInputProps} from 'sanity'
import {formatMetafieldLabel, formatMetafieldValue} from '../../utils/formatMetafieldValue'

type Metafield = {
  _key?: string
  namespace?: string
  key?: string
  type?: string
  value?: unknown
}

/**
 * Read-only display for a single Shopify metafield.
 *
 * `value` is deliberately not declared as a field on the `shopifyMetafield` schema type: its shape
 * depends on the Shopify metafield type and Sanity has no field type that accepts every variant. We
 * read it off the raw object value instead and format it according to the metafield's type.
 */
const ShopifyMetafield = (props: ObjectInputProps) => {
  const metafield = (props.value || {}) as Metafield
  const {type, value} = metafield

  const formattedValue = formatMetafieldValue(type, value)
  // Only `json` and `rich_text_field` values keep their line breaks; everything else formats to a
  // single line and reads better as plain text.
  const isMultiline = formattedValue.includes('\n')

  return (
    <Card padding={3} radius={2} shadow={1} tone="transparent">
      <Stack space={3}>
        <Flex align="center" gap={2}>
          <Text size={1} weight="semibold">
            {formatMetafieldLabel(metafield)}
          </Text>
          {type && (
            <Text muted size={1}>
              <code>{type}</code>
            </Text>
          )}
          <Text muted size={1}>
            <LockIcon />
          </Text>
        </Flex>
        {formattedValue ? (
          <Box overflow="auto">
            {isMultiline ? (
              <Code size={1}>{formattedValue}</Code>
            ) : (
              <Text size={1}>{formattedValue}</Text>
            )}
          </Box>
        ) : (
          <Text muted size={1}>
            No value
          </Text>
        )}
      </Stack>
    </Card>
  )
}

export default ShopifyMetafield
