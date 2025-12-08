import {writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {Worker} from 'node:worker_threads'

import {logSymbols, Output, spinner} from '@sanity/cli-core'
import {readPackageUp} from 'read-package-up'

import {
  type ValidateSchemaWorkerData,
  type ValidateSchemaWorkerResult,
} from '../../threads/validateSchema.js'
import {formatSchemaValidation, getAggregatedSeverity} from './formatSchemaValidation.js'
import {generateMetafile} from './metafile.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

  const rootPkgPath = (await readPackageUp({cwd: __dirname}))?.path
  if (!rootPkgPath) {
    throw new Error('Could not find root directory for `sanity` package')
  }

  const workerPath = path.join(path.dirname(rootPkgPath), 'dist', 'threads', 'validateSchema.js')

  let spin

  if (format === 'pretty') {
    spin = spinner(
      workspace ? `Validating schema from workspace '${workspace}'…` : 'Validating schema…',
    ).start()
  }

  const worker = new Worker(workerPath, {
    env: process.env,
    workerData: {
      debugSerialize: Boolean(debugMetafilePath),
      level,
      workDir,
      workspace: workspace,
    } satisfies ValidateSchemaWorkerData,
  })

  const {serializedDebug, validation} = await new Promise<ValidateSchemaWorkerResult>(
    (resolve, reject) => {
      worker.addListener('message', resolve)
      worker.addListener('error', reject)
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

  process.exitCode = didFail ? 1 : 0
}
