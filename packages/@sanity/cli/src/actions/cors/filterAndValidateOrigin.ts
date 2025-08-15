import {type Output} from '@sanity/cli-core'

/**
 * Validate an origin string.
 *
 * @internal
 */
function validateOrigin(origin: string | null, givenOrigin: string): string | true {
  if (origin === '*' || origin === 'file:///*' || origin === 'null') {
    return true
  }

  try {
    new URL(origin || '0') // Use '0' to trigger error for unset values
    return true
  } catch {
    // Fall-through to error
  }

  if (/^file:\/\//.test(givenOrigin)) {
    return `Only a local file wildcard is currently allowed: file:///*`
  }

  return `Invalid origin "${givenOrigin}", must include protocol (https://some.host)`
}

const wildcardReplacement = 'a-wild-card-r3pl4c3m3n7-a'
const portReplacement = ':7777777'

/**
 * Filter and normalize an origin string.
 *
 * @internal
 */
function filterOrigin(origin: string): string | null {
  if (origin === '*' || origin === 'file:///*' || origin === 'null') {
    return origin
  }

  try {
    const example = origin
      .replaceAll(/([^:])\*/g, `$1${wildcardReplacement}`)
      .replace(/:\*/, portReplacement)

    const parsed = new URL(example)
    let host = parsed.host || ''
    if (/^https?:$/.test(parsed.protocol || '')) {
      host = host.replace(/:(80|443)$/, '')
    }

    host = host.replaceAll(portReplacement, ':*').replaceAll(wildcardReplacement, '*')

    return `${parsed.protocol}//${host}`
  } catch {
    return null
  }
}

/**
 * Filter and validate an origin, throwing an error if invalid.
 *
 * @internal
 */
export async function filterAndValidateOrigin(
  givenOrigin: string,
  output: Output,
): Promise<string> {
  const origin = filterOrigin(givenOrigin)
  const result = validateOrigin(origin, givenOrigin)
  if (result !== true) {
    output.error(result, {exit: 1})
  }

  if (!origin) {
    output.error('Invalid origin', {exit: 1})
  }

  return origin
}
