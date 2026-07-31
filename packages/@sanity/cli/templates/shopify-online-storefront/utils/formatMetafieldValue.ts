/**
 * Shows a synced Shopify metafield value as text, based on its metafield `type`.
 *
 * Only a handful of types are listed below, as examples. Any type not listed falls back to the raw
 * value — a string as-is, anything else as JSON — so unlisted metafields still display, just less
 * prettily. To show one of your own metafield types nicely, add an entry to `formatters`.
 *
 * The full list of Shopify metafield types is here:
 * https://shopify.dev/docs/apps/build/custom-data/metafields/list-of-data-types
 */
const formatters: Record<string, (value: any) => string> = {
  // {"value": 180, "unit": "CENTIMETERS"} -> 180 CENTIMETERS
  dimension: ({value, unit}) => `${value} ${unit}`,
  weight: ({value, unit}) => `${value} ${unit}`,
  // {"amount": "649.00", "currency_code": "USD"} -> 649.00 USD
  money: ({amount, currency_code: currencyCode}) => `${amount} ${currencyCode}`,
  // {"value": "4.7", "scale_min": "1.0", "scale_max": "5.0"} -> 4.7 / 5.0
  rating: ({value, scale_max: scaleMax}) => `${value} / ${scaleMax}`,
  // A `list.*` type holds an array of its member type
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

  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

/**
 * Single-line variant, for the array row subtitle.
 */
export const formatMetafieldValuePreview = (type: string | undefined, value: unknown) => {
  return formatMetafieldValue(type, value).replace(/\s+/g, ' ').trim()
}
