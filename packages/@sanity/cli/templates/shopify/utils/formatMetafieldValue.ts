/**
 * Shopify metafield values are synced deserialized, so the shape of `value` depends on the
 * metafield's Shopify `type`: a scalar for text and number types, an object for measurements, money
 * and ratings, an array for `list.*` types. These helpers turn any of them into readable text.
 */

// GraphQL measurement unit enums, as synced, mapped to their conventional symbols. Units missing
// from this map are rendered as-is rather than guessed at.
const MEASUREMENT_UNITS: Record<string, string> = {
  // Length
  MILLIMETERS: 'mm',
  CENTIMETERS: 'cm',
  METERS: 'm',
  INCHES: 'in',
  FEET: 'ft',
  YARDS: 'yd',
  // Weight
  GRAMS: 'g',
  KILOGRAMS: 'kg',
  OUNCES: 'oz',
  POUNDS: 'lb',
  // Volume
  MILLILITERS: 'ml',
  CENTILITERS: 'cl',
  LITERS: 'l',
  CUBIC_METERS: 'm³',
  FLUID_OUNCES: 'fl oz',
  PINTS: 'pt',
  QUARTS: 'qt',
  GALLONS: 'gal',
  IMPERIAL_FLUID_OUNCES: 'imp fl oz',
  IMPERIAL_PINTS: 'imp pt',
  IMPERIAL_QUARTS: 'imp qt',
  IMPERIAL_GALLONS: 'imp gal',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isBlank = (value: unknown) => value === null || typeof value === 'undefined'

const formatSingleValue = (type: string, value: unknown): string => {
  if (isBlank(value)) {
    return ''
  }

  switch (type) {
    case 'dimension':
    case 'weight':
    case 'volume': {
      if (!isRecord(value) || isBlank(value.value)) break
      const unit =
        typeof value.unit === 'string' ? (MEASUREMENT_UNITS[value.unit] ?? value.unit) : ''
      return unit ? `${value.value} ${unit}` : `${value.value}`
    }
    case 'money': {
      if (!isRecord(value) || isBlank(value.amount)) break
      const currency = value.currency_code
      return typeof currency === 'string' && currency
        ? `${value.amount} ${currency}`
        : `${value.amount}`
    }
    case 'rating': {
      if (!isRecord(value) || isBlank(value.value)) break
      return isBlank(value.scale_max) ? `${value.value}` : `${value.value} / ${value.scale_max}`
    }
    // Structured types with no meaningful one-line form
    case 'json':
    case 'rich_text_field':
      return JSON.stringify(value, null, 2)
  }

  // Text, url, color, dates, ids and references are all scalars, and dates are left in their synced
  // ISO form so they stay unambiguous.
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return JSON.stringify(value, null, 2)
}

export const formatMetafieldValue = (type: string | undefined, value: unknown) => {
  if (isBlank(value)) {
    return ''
  }

  // `list.<type>` metafields hold an array of the member type
  const memberType = type?.startsWith('list.') ? type.slice('list.'.length) : undefined
  if (memberType && Array.isArray(value)) {
    return value
      .map((member) => formatSingleValue(memberType, member))
      .filter((formatted) => formatted !== '')
      .join(', ')
  }

  return formatSingleValue(type ?? '', value)
}

/**
 * Single-line variant, for array item previews.
 */
export const formatMetafieldValuePreview = (type: string | undefined, value: unknown) => {
  return formatMetafieldValue(type, value).replace(/\s+/g, ' ').trim()
}

/**
 * `<namespace>.<key>`, which is also what the importer uses as the `_key`. Falls back to the `_key`
 * itself, which every array member has, so a metafield is never left unlabelled. The label is read
 * from `namespace` and `key` rather than from `_key` because `_key` is array identity rather than
 * data: the Studio regenerates it when an item is duplicated or copied.
 */
export const formatMetafieldLabel = (metafield: {
  namespace?: string
  key?: string
  _key?: string
}) => {
  return (
    [metafield.namespace, metafield.key].filter(Boolean).join('.') || metafield._key || 'Metafield'
  )
}
