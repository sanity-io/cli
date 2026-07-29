import {LockIcon} from '@sanity/icons'
import {Box, Card, Code, Flex, Stack, Text} from '@sanity/ui'
import {type ObjectInputProps} from 'sanity'
import {formatMetafieldValue} from '../../utils/formatMetafieldValue'

type Metafield = {
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
 * read it off the raw object value instead and render it as text.
 */
export default function ShopifyMetafieldInput(props: ObjectInputProps) {
  const {namespace, key, type, value} = (props.value || {}) as Metafield

  const formattedValue = formatMetafieldValue(value)

  return (
    <Card padding={3} radius={2} shadow={1} tone="transparent">
      <Stack space={3}>
        <Flex align="center" gap={2}>
          <Text size={1} weight="semibold">
            {[namespace, key].filter(Boolean).join('.') || 'Metafield'}
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
            <Code size={1}>{formattedValue}</Code>
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
