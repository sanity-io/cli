import {type Interfaces} from '@oclif/core'

const formatSuggestions = (suggestions?: string[]): string | undefined => {
  const label = 'Try this:'
  if (!suggestions || suggestions.length === 0) return undefined
  if (suggestions.length === 1) return `${label} ${suggestions[0]}`

  const multiple = suggestions.map((suggestion) => `  * ${suggestion}`).join('\n')
  return `${label}\n${multiple}`
}

type CombinedError = Error & Interfaces.PrettyPrintableError

function isCombinedError(error: unknown): error is CombinedError {
  return error !== null && typeof error === 'object' && 'name' in error && 'message' in error
}

/**
 * Render an error and its full `cause` chain as plain text, with each nested
 * cause on its own `Caused by: ...` line, so callers do not silently drop the
 * detail that `String(error)` omits.
 *
 * Adapted from oclif's unexported `prettyPrint` implementation:
 * https://github.com/oclif/core/blob/4.11.14/src/errors/errors/pretty-print.ts
 *
 * Terminal wrapping, indentation, ANSI decoration, and debug stack handling are omitted so programmatic callers receive stable plain text.
 *
 * @param error - The error to render; non-error values render as an empty string
 * @returns The rendered error chain, or an empty string when nothing could be rendered
 * @internal
 */
export function prettyPrintError(error: unknown): string {
  const prettyPrintedErrors: string[] = []
  let currentError = error
  let isDeep = false

  while (isCombinedError(currentError)) {
    const {code, message, name: errorSuffix, ref, suggestions} = currentError
    const formattedHeader = message ? `${errorSuffix || 'Error'}: ${message}` : undefined
    const formattedCode = code ? `Code: ${code}` : undefined
    const formattedSuggestions = formatSuggestions(suggestions)
    const formattedReference = ref ? `Reference: ${ref}` : undefined
    const formatted = [formattedHeader, formattedCode, formattedSuggestions, formattedReference]
      .filter(Boolean)
      .join('\n')

    prettyPrintedErrors.push(`${isDeep ? 'Caused by: ' : ''}${formatted}`)
    isDeep = true
    currentError = currentError.cause ?? null
  }

  return prettyPrintedErrors.join('\n')
}
