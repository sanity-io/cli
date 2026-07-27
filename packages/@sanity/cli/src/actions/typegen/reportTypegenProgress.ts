import {type SpinnerInstance} from '@sanity/cli-core/ux'
import {type GenerationResult, type TypegenProgressEvent} from '@sanity/codegen'

/**
 * Formats a path so it is the same on Windows and Unix.
 */
export function formatPath(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

export const count = (
  amount: number,
  plural: string = '',
  singular: string = plural.slice(0, Math.max(0, plural.length - 1)),
): string =>
  [amount.toLocaleString('en-US'), amount === 1 ? singular : plural].filter(Boolean).join(' ')

const percentageFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  style: 'percent',
})

export const percent = (value: number): string => percentageFormatter.format(Math.min(value, 1))

/**
 * Renders typegen library progress events onto an ora spinner (mirrors the UX
 * that previously lived inside `@sanity/codegen`).
 */
export function createTypegenProgressReporter(
  spin: SpinnerInstance,
  options: {generates: string; schemaPath: string},
): (event: TypegenProgressEvent) => void {
  const {generates, schemaPath} = options
  let evaluatedFiles = 0
  let formattingError = false
  let formatterName: string | undefined

  return (event) => {
    switch (event.type) {
      case 'complete': {
        reportComplete(spin, event.result, {
          evaluatedFiles,
          formatterName,
          formattingError,
          generates,
        })
        break
      }
      case 'formatFailed': {
        formattingError = true
        formatterName = event.formatterName
        spin.warn(`Failed to format generated types with ${event.formatterName}: ${event.message}`)
        break
      }
      case 'formatting': {
        formatterName = event.formatterName
        spin.text = `Formatting generated types with ${event.formatterName}…`
        break
      }
      case 'moduleEvaluated': {
        evaluatedFiles = event.evaluatedFiles

        for (const error of event.errors) {
          spin.fail(error)
        }

        if (!spin.isSpinning) {
          spin.start()
        }

        spin.text =
          `Generating query types… (${percent(event.evaluatedFiles / event.expectedFileCount)})\n` +
          `  └─ Processed ${count(event.evaluatedFiles)} of ${count(event.expectedFileCount, 'files')}. ` +
          `Found ${count(event.queriesCount, 'queries', 'query')} from ${count(event.queryFilesCount, 'files')}.`
        break
      }
      case 'schemaLoaded': {
        spin.succeed(`Schema loaded from ${formatPath(schemaPath)}`)
        spin.start('Generating schema types…')
        break
      }
      case 'schemaTypesGenerated': {
        break
      }
      case 'typegenStarted': {
        spin.text = 'Generating query types…'
        break
      }
      default: {
        break
      }
    }
  }
}

function reportComplete(
  spin: SpinnerInstance,
  result: GenerationResult,
  meta: {
    evaluatedFiles: number
    formatterName: string | undefined
    formattingError: boolean
    generates: string
  },
): void {
  if (result.filesWithErrors > 0) {
    spin.warn(
      `Encountered errors in ${count(result.filesWithErrors, 'files')} while generating types`,
    )
  }

  let successText =
    `Successfully generated types to ${formatPath(meta.generates)} in ${Number(result.duration).toFixed(0)}ms` +
    `\n  └─ ${count(result.queriesCount, 'queries', 'query')} and ${count(result.schemaTypesCount, 'schema types', 'schema type')}` +
    `\n  └─ found queries in ${count(result.queryFilesCount, 'files', 'file')} after evaluating ${count(meta.evaluatedFiles, 'files', 'file')}`

  if (meta.formatterName) {
    successText += `\n  └─ ${
      meta.formattingError
        ? 'an error occurred during formatting'
        : `formatted the generated code with ${meta.formatterName}`
    }`
  }

  spin.succeed(successText)
}
