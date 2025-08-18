import {type Output} from '@sanity/cli-core'

const wildcardReplacement = 'a-wild-card-r3pl4c3m3n7-a'
const portReplacement = ':7777777'

/**
 * Filter and validate an origin, throwing an error if invalid.
 *
 * @internal
 */
export async function filterAndValidateOrigin(
  givenOrigin: string,
  output: Output,
): Promise<string> {
  // Handle special cases that are always valid
  if (givenOrigin === '*' || givenOrigin === 'file:///*' || givenOrigin === 'null') {
    return givenOrigin
  }

  // Special validation for file:// protocols
  if (/^file:\/\//.test(givenOrigin)) {
    output.error('Only a local file wildcard is currently allowed: file:///*', {exit: 1})
  }

  try {
    const example = givenOrigin
      // Replace wildcards with placeholder values for URL parsing
      .replaceAll(/([^:])\*/g, `$1${wildcardReplacement}`)
      // Replace port wildcards with placeholder value for URL parsing
      .replace(/:\*/, portReplacement)

    const parsed = new URL(example)
    let host = parsed.host || ''

    // Remove default ports for http/https
    if (/^https?:$/.test(parsed.protocol || '')) {
      host = host.replace(/:(80|443)$/, '')
    }

    // Restore wildcards
    host = host.replaceAll(portReplacement, ':*').replaceAll(wildcardReplacement, '*')

    return `${parsed.protocol}//${host}`
  } catch {
    output.error(`Invalid origin "${givenOrigin}", must include protocol (https://some.host)`, {
      exit: 1,
    })
  }
}
