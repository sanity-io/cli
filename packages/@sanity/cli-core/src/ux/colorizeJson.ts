import {styleText} from 'node:util'

import tokenize, {type LexerToken} from 'json-lexer'

interface KeyToken {
  raw: string
  type: 'key'
  value: string
}

type ExtendedLexerToken = KeyToken | LexerToken

/**
 * Colorize JSON output for better readability using simple regex patterns
 */
const identity = (inp: string): string => inp

export function colorizeJson(input: unknown): string {
  const formatters: Record<ExtendedLexerToken['type'], (str: string) => string> = {
    key: (s) => styleText('white', s),
    literal: (s) => styleText('bold', s),
    number: (s) => styleText('yellow', s),
    punctuator: (s) => styleText('white', s),
    string: (s) => styleText('green', s),
    whitespace: identity,
  }

  const json = JSON.stringify(input, null, 2)

  return tokenize(json)
    .map((token, i, arr): ExtendedLexerToken => {
      // Note how the following only works because we pretty-print the JSON
      const prevToken = i === 0 ? token : arr[i - 1]
      if (
        token.type === 'string' &&
        prevToken.type === 'whitespace' &&
        /^\n\s+$/.test(prevToken.value)
      ) {
        return {...token, type: 'key'}
      }

      return token
    })
    .map((token) => {
      const formatter = formatters[token.type] || identity
      return formatter(token.raw)
    })
    .join('')
}
