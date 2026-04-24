/* eslint-disable no-console -- this is the error output layer */
import {type PrettyPrintableError} from '@oclif/core/interfaces'
import wrapAnsi from 'wrap-ansi'

import {CLIError} from '../errors/CLIError.js'
import {CLIWarning} from '../errors/CLIWarning.js'

const settings: {debug?: boolean} = (globalThis as Record<string, unknown>).oclif ?? {}

/**
 * Print a formatted error to stderr without throwing, when `exit: false`.
 */
export function error(input: Error | string, options: PrettyPrintableError & {exit: false}): void
/**
 * Throw a formatted {@link CLIError}.
 */
export function error(
  input: Error | string,
  options?: PrettyPrintableError & {exit?: number},
): never
export function error(
  input: Error | string,
  options: PrettyPrintableError & {exit?: false | number} = {},
): void {
  const err = new CLIError(input, options)

  if (options.exit === false) {
    const message = prettyPrint(err)
    if (message) console.error(message)
  } else {
    throw err
  }
}

/**
 * Print a formatted warning to stderr.
 */
export function warn(input: Error | string): void {
  const err = new CLIWarning(input)
  const message = prettyPrint(err)
  if (message) console.error(message)
}

function indentString(str: string, count: number, options?: {indent?: string}): string {
  const indent = options?.indent ?? ' '
  if (count === 0) return str
  return str.replaceAll(/^(?!\s*$)/gm, indent.repeat(count))
}

function stderrWidth(): number {
  const env = Number.parseInt(process.env.OCLIF_COLUMNS!, 10)
  if (env) return env
  if (!process.stderr.isTTY) return 80
  const w = (process.stderr as {getWindowSize?: () => number[]}).getWindowSize?.()[0] ?? 80
  return Math.max(w < 1 ? 80 : w, 40)
}

function formatSuggestions(suggestions?: string[]): string | undefined {
  const label = 'Try this:'
  if (!suggestions || suggestions.length === 0) return undefined
  if (suggestions.length === 1) return `${label} ${suggestions[0]}`
  return `${label}\n${indentString(suggestions.map((s) => `* ${s}`).join('\n'), 2)}`
}

function prettyPrint(error: CLIError): string | undefined {
  if (settings.debug) return error.prettyStack

  const {bang: prefix, code, message, name: errorSuffix, ref, suggestions} = error
  const formattedHeader = message ? `${errorSuffix || 'Error'}: ${message}` : undefined
  const formattedCode = code ? `Code: ${code}` : undefined
  const formattedSuggestions = formatSuggestions(suggestions)
  const formattedReference = ref ? `Reference: ${ref}` : undefined

  const formatted = [formattedHeader, formattedCode, formattedSuggestions, formattedReference]
    .filter(Boolean)
    .join('\n')

  const width = stderrWidth()
  let output = wrapAnsi(formatted, width - 6, {hard: true, trim: false})
  output = indentString(output, 3)
  output = indentString(output, 1, {indent: prefix || ''})
  output = indentString(output, 1)
  return output
}
