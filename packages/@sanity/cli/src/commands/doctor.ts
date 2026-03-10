import {styleText} from 'node:util'

import {Args, Flags} from '@oclif/core'
import {SanityCommand} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {type DoctorCheckName, doctorChecks, KNOWN_CHECKS} from '../actions/doctor/checks/index.js'
import {runDoctorChecks} from '../actions/doctor/runDoctorChecks.js'
import {
  type CheckMessage,
  type CheckResultStatus,
  type CheckResultWithMeta,
  type DoctorCheck,
  type MessageType,
} from '../actions/doctor/types.js'

const STATUS_SYMBOLS: Record<CheckResultStatus, string> = {
  error: logSymbols.error,
  passed: logSymbols.success,
  warning: logSymbols.warning,
}

const MESSAGE_SYMBOLS: Record<MessageType, string> = {
  error: logSymbols.error,
  info: logSymbols.info,
  success: logSymbols.success,
  warning: logSymbols.warning,
}

export class DoctorCommand extends SanityCommand<typeof DoctorCommand> {
  // Runtime validation uses argv + getChecks() because strict=false allows variadic args.
  static override args = {
    checks: Args.string({
      description: 'Checks to enable (defaults to all)',
      multiple: true,
      options: KNOWN_CHECKS,
      required: false,
    }),
  }

  static override description = 'Run diagnostics on your Sanity project'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    {command: '<%= config.bin %> <%= command.id %> --json', description: 'Output results as JSON'},
    {
      command: '<%= config.bin %> <%= command.id %> cli',
      description: 'Only run CLI-related diagnostics',
    },
  ]

  static override flags = {
    json: Flags.boolean({
      char: 'j',
      default: false,
      description: 'Output results as JSON',
    }),
  }

  // Needed for variable argument count
  static override strict = false

  public async run(): Promise<void> {
    const {argv, flags} = await this.parse(DoctorCommand)

    const checks = getChecks(argv, this.error)
    const cwd = process.cwd()

    if (!flags.json) {
      this.log('Running diagnostics...\n')
    }

    const results = await runDoctorChecks({cwd}, checks)

    if (flags.json) {
      this.log(JSON.stringify(results, null, 2))
    } else {
      for (const check of results.checks) {
        this.printCheck(check)
      }

      this.printSummary(results.summary)
    }

    // Exit with error code if any checks failed
    if (results.summary.errors > 0) {
      this.exit(1)
    }
  }

  private printCheck(check: CheckResultWithMeta): void {
    const symbol = STATUS_SYMBOLS[check.status]
    const title =
      check.status === 'passed'
        ? check.title
        : styleText(check.status === 'error' ? 'red' : 'yellow', check.title)

    this.log(`${symbol} ${title}`)

    for (const message of check.messages) {
      this.printMessage(message)
    }

    this.log('') // Empty line between checks
  }

  private printMessage(message: CheckMessage): void {
    const symbol = MESSAGE_SYMBOLS[message.type]
    const text =
      message.type === 'error'
        ? styleText('red', message.text)
        : message.type === 'warning'
          ? styleText('yellow', message.text)
          : message.text

    this.log(`  ${symbol} ${text}`)

    if (message.suggestions?.length) {
      for (const suggestion of message.suggestions) {
        this.log(`    ${styleText('dim', '→')} ${suggestion}`)
      }
    }
  }

  private printSummary(summary: {errors: number; passed: number; warnings: number}): void {
    const parts: string[] = []

    if (summary.passed > 0) {
      parts.push(styleText('green', `${summary.passed} passed`))
    }
    if (summary.warnings > 0) {
      parts.push(
        styleText('yellow', `${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}`),
      )
    }
    if (summary.errors > 0) {
      parts.push(styleText('red', `${summary.errors} error${summary.errors === 1 ? '' : 's'}`))
    }

    this.log(`Summary: ${parts.join(', ')}`)
  }
}

function isKnownCheck(name: string): name is DoctorCheckName {
  return (KNOWN_CHECKS as readonly string[]).includes(name)
}

function getChecks(
  argv: unknown[],
  error: (message: string, options?: {exit: number}) => never,
): Array<DoctorCheck> {
  const checkNames = argv.map((item) => `${item}`)
  const unknownChecks = checkNames.filter((check) => !isKnownCheck(check))

  if (unknownChecks.length > 0) {
    const list = new Intl.ListFormat('en-US', {style: 'long', type: 'unit'})
    const validChecks = list.format(KNOWN_CHECKS)
    const message =
      unknownChecks.length === 1
        ? `Unknown check: "${unknownChecks[0]}". Valid checks are: ${validChecks}.`
        : `Unknown checks: ${list.format(unknownChecks)}. Valid checks are: ${validChecks}.`

    error(message, {exit: 1})
  }

  const validNames = checkNames.filter((name) => isKnownCheck(name))

  return validNames.length > 0
    ? validNames.map((check) => doctorChecks[check])
    : Object.values(doctorChecks)
}
