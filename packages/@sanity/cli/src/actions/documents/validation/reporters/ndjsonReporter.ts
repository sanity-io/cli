import {omit} from 'lodash-es'

import {type BuiltInValidationReporter, Level} from '../../types.js'

export const ndjson: BuiltInValidationReporter = async ({output, worker}) => {
  let overallLevel: Level = 'info'

  for await (const item of worker.stream.validation()) {
    const result = omit(item, ['validatedCount'])

    if (result.level === 'error') overallLevel = 'error'
    if (result.level === 'warning' && overallLevel !== 'error') overallLevel = 'warning'

    if (result.markers.length > 0) {
      output.log(JSON.stringify(result))
    }
  }

  await worker.dispose()

  return overallLevel
}
