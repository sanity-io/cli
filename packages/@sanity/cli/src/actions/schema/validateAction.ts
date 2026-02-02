import {writeFileSync} from 'node:fs'

import {Output, studioWorkerTask} from '@sanity/cli-core'
import {logSymbols, spinner} from '@sanity/cli-core/ux'

import {formatSchemaValidation, getAggregatedSeverity} from './formatSchemaValidation.js'
import {generateMetafile} from './metafile.js'
import {
  type ValidateSchemaWorkerData,
  type ValidateSchemaWorkerResult,
} from './validateSchema.worker.js'

interface Options {
  output: Output
  workDir: string

  debugMetafilePath?: string
  format?: string
  level?: 'error' | 'warning'
  workspace?: string
}

export async function validateAction(options: Options): Promise<void> {
  const {debugMetafilePath, format, level, output, workDir, workspace} = options

  let spin

  if (format === 'pretty') {
    spin = spinner(
      workspace ? `Validating schema from workspace '${workspace}'…` : 'Validating schema…',
    ).start()
  }

  const {serializedDebug, validation} = await studioWorkerTask<ValidateSchemaWorkerResult>(
    new URL('validateSchema.worker.js', import.meta.url),
    {
      name: 'validateSchema',
      studioRootPath: workDir,
      workerData: {
        debugSerialize: Boolean(debugMetafilePath),
        level,
        workDir,
        workspace: workspace,
      } satisfies ValidateSchemaWorkerData,
    },
  )

  const problems = validation.flatMap((group) => group.problems)
  const errorCount = problems.filter((problem) => problem.severity === 'error').length
  const warningCount = problems.filter((problem) => problem.severity === 'warning').length

  const overallSeverity = getAggregatedSeverity(validation)
  const didFail = overallSeverity === 'error'

  if (debugMetafilePath && !didFail) {
    if (!serializedDebug) throw new Error('serializedDebug should always be produced')
    const metafile = generateMetafile(serializedDebug)
    writeFileSync(debugMetafilePath, JSON.stringify(metafile), 'utf8')
  }

  switch (format) {
    case 'json': {
      output.log(JSON.stringify(validation))
      break
    }
    case 'ndjson': {
      for (const group of validation) {
        output.log(JSON.stringify(group))
      }
      break
    }
    default: {
      spin?.succeed('Validated schema')
      output.log(`\nValidation results:`)
      output.log(
        `${logSymbols.error} Errors:   ${errorCount.toLocaleString('en-US')} error${
          errorCount === 1 ? '' : 's'
        }`,
      )
      if (level !== 'error') {
        output.log(
          `${logSymbols.warning} Warnings: ${warningCount.toLocaleString('en-US')} warning${
            warningCount === 1 ? '' : 's'
          }`,
        )
      }
      output.log()

      output.log(formatSchemaValidation(validation))

      if (debugMetafilePath) {
        output.log()
        if (didFail) {
          output.log(`${logSymbols.info} Metafile not written due to validation errors`)
        } else {
          output.log(`${logSymbols.info} Metafile written to: ${debugMetafilePath}`)
          output.log(`  This can be analyzed at https://esbuild.github.io/analyze/`)
        }
      }
    }
  }

  if (didFail) {
    throw new Error('Schema validation failed')
  }
}
