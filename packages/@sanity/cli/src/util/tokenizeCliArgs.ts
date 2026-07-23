/**
 * Tokenize a command-line argument string into an argv array without ever
 * invoking a shell. Supports single quotes, double quotes, and backslash
 * escapes — enough to round-trip anything a user would type after `sanity `.
 *
 * @throws When the input contains an unterminated quote.
 * @internal
 */
export function tokenizeCliArgs(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let hasToken = false
  let quote: "'" | '"' | null = null

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (quote === "'") {
      if (char === "'") quote = null
      else current += char
    } else if (quote === '"') {
      if (char === '"') {
        quote = null
      } else if (char === '\\' && (input[i + 1] === '"' || input[i + 1] === '\\')) {
        i += 1
        current += input[i]
      } else {
        current += char
      }
    } else if (char === "'" || char === '"') {
      quote = char
      hasToken = true
    } else if (char === '\\' && i + 1 < input.length) {
      i += 1
      current += input[i]
      hasToken = true
    } else if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (hasToken) {
        tokens.push(current)
        current = ''
        hasToken = false
      }
    } else {
      current += char
      hasToken = true
    }
  }

  if (quote) {
    throw new Error(`Unterminated ${quote === '"' ? 'double' : 'single'} quote in arguments`)
  }
  if (hasToken) tokens.push(current)

  return tokens
}
