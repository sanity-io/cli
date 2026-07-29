/**
 * Shopify metafield values are synced deserialized, so a single metafield can hold a string,
 * number, boolean, list or JSON object depending on its Shopify type. Render them all as text:
 * scalars as-is, everything else as indented JSON.
 */
export const formatMetafieldValue = (value: unknown) => {
  if (value === null || typeof value === 'undefined') {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return JSON.stringify(value, null, 2)
}

/**
 * Single-line variant, for array item previews.
 */
export const formatMetafieldValuePreview = (value: unknown) => {
  return formatMetafieldValue(value).replace(/\s+/g, ' ').trim()
}
