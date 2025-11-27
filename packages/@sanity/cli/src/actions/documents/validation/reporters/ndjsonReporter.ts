import {type BuiltInValidationReporter} from '../../../../commands/documents/validate.js'

export const ndjson: BuiltInValidationReporter = async ({output, worker}) => {
  let overallLevel: 'error' | 'info' | 'warning' = 'info'

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const {validatedCount: _validatedCount, ...result} of worker.stream.validation()) {
    if (result.level === 'error') overallLevel = 'error'
    if (result.level === 'warning' && overallLevel !== 'error') overallLevel = 'warning'

    if (result.markers.length > 0) {
      output.log(JSON.stringify(result))
    }
  }

  await worker.dispose()

  return overallLevel
}
