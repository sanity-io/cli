/**
 * Shows a synced Shopify metafield value as text, based on its metafield `type`.
 *
 * The types below are examples. Anything not listed falls back to the raw value, so your own
 * metafields still display — add an entry here to show one of them nicely. Every type and the shape
 * of its value: https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types
 */
const measurement = ({value, unit}: {value: number; unit: string}) => `${value} ${unit}`

const formatters: Record<string, (value: any) => string> = {
  dimension: measurement,
  weight: measurement,
  volume: measurement,
  money: ({amount, currency_code: currencyCode}) => `${amount} ${currencyCode}`,
  rating: ({value, scale_max: scaleMax}) => `${value} / ${scaleMax}`,
  'list.single_line_text_field': (values: string[]) => values.join(', '),
}

export const formatMetafieldValue = (type: string | undefined, value: unknown) => {
  if (value === null || typeof value === 'undefined') {
    return ''
  }

  const format = type ? formatters[type] : undefined
  if (format) {
    return format(value)
  }

  return typeof value === 'string' ? value : JSON.stringify(value)
}
