import cleanStack from 'clean-stack'
import indentString from 'indent-string'
import {styleText} from 'node:util'
import wrapAnsi from 'wrap-ansi'

// ---------------------------------------------------------------------------
// Settings / helpers
// ---------------------------------------------------------------------------

const settings: {debug?: boolean} = (globalThis as Record<string, unknown>).oclif ?? {}

function stderrWidth(): number {
  const env = Number.parseInt(process.env.OCLIF_COLUMNS!, 10)
  if (env) return env
  if (!process.stderr.isTTY) return 80
  const w = (process.stderr as {getWindowSize?: () => number[]}).getWindowSize?.()[0] ?? 80
  return Math.max(w < 1 ? 80 : w, 40)
}

function bang(color: 'red' | 'yellow'): string | undefined {
  try {
    return styleText(color, process.platform === 'win32' ? '»' : '›')
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// CLIError
// ---------------------------------------------------------------------------

export interface PrettyPrintableError {
  code?: string
  message?: string
  ref?: string
  suggestions?: string[]
}

/**
 * A formatted CLI error that pretty-prints to stderr.
 *
 * The `oclif` property is shaped so oclif's error handler recognises it
 * when thrown inside an oclif command, preserving the correct exit code
 * and suppressing redundant stack traces.
 */
export class CLIError extends Error {
  oclif: {exit?: number} = {exit: 2}
  code?: string
  suggestions?: string[]
  ref?: string
  skipOclifErrorHandling?: boolean

  constructor(error: Error | string, options: {exit?: false | number} & PrettyPrintableError = {}) {
    super(error instanceof Error ? error.message : error)
    if (error instanceof Error && error.stack) {
      this.stack = error.stack
    }
    if (options.exit !== undefined) this.oclif.exit = options.exit || undefined
    this.code = options.code
    this.suggestions = options.suggestions
    this.ref = options.ref
  }

  get bang(): string | undefined {
    return bang('red')
  }

  get prettyStack(): string {
    return cleanStack(super.stack!, {pretty: true})
  }
}

/**
 * A warning-level CLI error. Identical to {@link CLIError} except the
 * bang prefix is yellow instead of red.
 */
export class CLIWarning extends CLIError {
  constructor(input: Error | string) {
    super(input instanceof Error ? input.message : input)
    this.name = 'Warning'
  }

  override get bang(): string | undefined {
    return bang('yellow')
  }
}

// ---------------------------------------------------------------------------
// Pretty-print
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// error() and warn()
// ---------------------------------------------------------------------------

/**
 * Print a formatted error to stderr without throwing, when `exit: false`.
 */
export function error(input: Error | string, options: {exit: false} & PrettyPrintableError): void
/**
 * Throw a formatted {@link CLIError}.
 */
export function error(
  input: Error | string,
  options?: {exit?: number} & PrettyPrintableError,
): never
export function error(
  input: Error | string,
  options: {exit?: false | number} & PrettyPrintableError = {},
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
