import {getErrorMessage} from '../errors/getErrorMessage.js'
import {type Output} from '../types.js'
import {logSymbols} from '../ux/logSymbols.js'
import {debug as cliDebug} from './debug.js'

export type CheckStatus = 'fail' | 'pass' | 'skip' | 'warn'

export interface Check {
  message: string
  status: CheckStatus

  /** Exit code a real run uses when this check fails; defaults to 1 */
  exitCode?: number
  /** Actionable fix, shown under a failing or warning check */
  solution?: string
}

/**
 * Where a command's steps send their check outcomes — and the only place the
 * run mode lives. A real run fails fast: a `fail` prints and exits immediately,
 * which aborts the sequence. A dry run collects every outcome and never exits.
 * Steps just call `report`; they never know which mode is running.
 */
export interface CheckReporter<TCheck extends Check = Check> {
  report(check: TCheck): void
}

export function createFailFastReporter(output: Output): CheckReporter {
  return {
    report(check) {
      // Fixes surface in both modes: appended after the message here, and in the
      // dry-run report, so the problem and its fix never drift apart.
      const text = check.solution ? `${check.message}: ${check.solution}` : check.message
      if (check.status === 'fail') {
        output.error(text, {exit: check.exitCode ?? 1})
      } else if (check.status === 'warn') {
        output.warn(text)
      }
    },
  }
}

export function createCollectingReporter<TCheck extends Check = Check>(): CheckReporter<TCheck> & {
  results: TCheck[]
} {
  const results: TCheck[] = []
  return {
    report(check) {
      results.push(check)
    },
    results,
  }
}

/**
 * Runs a fallible step and turns a throw into a `fail` check. In a real run
 * that fail exits (aborting the sequence); in a dry run it's recorded and
 * `null` comes back so the caller can skip the rest of the step. `name` labels
 * the step in debug logs.
 */
export async function runStep<T>(
  reporter: CheckReporter,
  step: {
    debug?: (message: string, error: unknown) => void
    formatError?: (error: unknown) => string

    name: string
    solution?: string
    work: () => Promise<T>
  },
): Promise<T | null> {
  const {debug = cliDebug, formatError = getErrorMessage, name, solution, work} = step
  try {
    return await work()
  } catch (err) {
    debug(`${name} step failed`, err)
    reporter.report({message: formatError(err), solution, status: 'fail'})
    return null
  }
}

export function checkStatusIcon(status: CheckStatus): string {
  switch (status) {
    case 'fail': {
      return logSymbols.error
    }
    case 'skip': {
      return logSymbols.info
    }
    case 'warn': {
      return logSymbols.warning
    }
    default: {
      return logSymbols.success
    }
  }
}

/**
 * Indents continuation lines of a multi-line check message past the status
 * icon so its items nest under the heading.
 */
export function nestLines(text: string): string {
  return text.replaceAll('\n', '\n    ')
}

/** Renders problem/warning checks under a title, each with its fix appended. */
export function renderIssues(output: Output, title: string, checks: Check[]): void {
  if (checks.length === 0) return

  output.log(`\n${title}`)
  for (const check of checks) {
    const fix = check.solution ? `: ${check.solution}` : ''
    output.log(nestLines(`  ${checkStatusIcon(check.status)} ${check.message}${fix}`))
  }
}
