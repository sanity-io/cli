import {type TypeGenConfig, type TypegenProgressEvent} from '@sanity/codegen'

import {count} from './count.js'
import {formatPath} from './formatPath.js'
import {percent} from './percent.js'

/**
 * Minimal structural shape of the spinner the renderer depends on.
 *
 * The `@sanity/cli-core/ux` `spinner` factory returns an instance whose
 * methods return `this` (for chaining), which is assignable to this
 * `void`-returning interface. This is deliberately narrower than the real
 * spinner type so that test doubles (plain object literals) can satisfy it
 * structurally without a type assertion.
 */
export interface TypegenSpinner {
  fail(text?: string): void
  isSpinning: boolean
  start(text?: string): void
  succeed(text?: string): void
  text: string
  warn(text?: string): void
}

interface RendererContext {
  // Indexed access avoids needing a dedicated FormatGeneratedCode export from @sanity/codegen.
  formatGeneratedCode: TypeGenConfig['formatGeneratedCode']
  generates: string
  schema: string
}

/**
 * Builds an onProgress handler that renders typegen progress to a spinner,
 * matching the output the command produced before the library was decoupled.
 */
export function createTypegenProgressRenderer(
  spin: TypegenSpinner,
  context: RendererContext,
): (event: TypegenProgressEvent) => void {
  const {formatGeneratedCode, generates, schema} = context

  // Track cross-event data needed for the final success message.
  let evaluatedFiles = 0
  let queriesCount = 0
  let queryFilesCount = 0
  let schemaTypesCount = 0
  let formatterName: string | undefined
  let formattingError = false

  return (event) => {
    switch (event.type) {
      case 'complete': {
        const {result} = event
        if (result.filesWithErrors > 0) {
          spin.warn(`Encountered errors in ${count(result.filesWithErrors, 'files')} while generating types`)
        }

        let successText =
          `Successfully generated types to ${formatPath(generates)} in ${Number(result.duration).toFixed(0)}ms` +
          `\n  └─ ${count(queriesCount, 'queries', 'query')} and ${count(schemaTypesCount, 'schema types', 'schema type')}` +
          `\n  └─ found queries in ${count(queryFilesCount, 'files', 'file')} after evaluating ${count(evaluatedFiles, 'files', 'file')}`

        // formatGeneratedCode !== false means a formatter was attempted.
        if (formatGeneratedCode !== false && formatterName) {
          successText += `\n  └─ ${formattingError ? 'an error occurred during formatting' : `formatted the generated code with ${formatterName}`}`
        }

        spin.succeed(successText)
        return
      }
      case 'formatFailed': {
        formatterName = event.formatterName
        formattingError = true
        spin.warn(`Failed to format generated types with ${event.formatterName}: ${event.message}`)
        return
      }
      case 'formatting': {
        formatterName = event.formatterName
        spin.text = `Formatting generated types with ${event.formatterName}…`
        return
      }
      case 'moduleEvaluated': {
        evaluatedFiles = event.evaluatedFiles
        queriesCount = event.queriesCount
        queryFilesCount = event.queryFilesCount

        for (const message of event.errors) {
          spin.fail(message)
        }
        if (!spin.isSpinning) {
          spin.start()
        }

        spin.text =
          `Generating query types… (${percent(event.evaluatedFiles / event.expectedFileCount)})\n` +
          `  └─ Processed ${count(event.evaluatedFiles)} of ${count(event.expectedFileCount, 'files')}. ` +
          `Found ${count(event.queriesCount, 'queries', 'query')} from ${count(event.queryFilesCount, 'files')}.`
        return
      }
      case 'schemaLoaded': {
        spin.succeed(`Schema loaded from ${formatPath(schema)}`)
        spin.start('Generating schema types…')
        return
      }
      case 'schemaTypesGenerated': {
        schemaTypesCount = event.schemaTypesCount
        spin.text = 'Generating query types…'
        return
      }
      case 'typegenStarted': {
        return
      }
      default: {
        return
      }
    }
  }
}
