import {omit} from 'lodash-es'

import {type BuiltInValidationReporter, Level} from '../../types.js'

// TODO: replace with Array.fromAsync when it's out of stage3
async function arrayFromAsync<T>(iterable: AsyncIterable<T>) {
  const results: T[] = []
  for await (const item of iterable) results.push(item)
  return results
}

export const json: BuiltInValidationReporter = async ({output, worker}) => {
  const results = await arrayFromAsync(worker.stream.validation())
  const formatted = results
    // report out only documents with some markers
    .filter(({markers}) => markers.length)
    // remove validatedCount from the results
    .map((result) => omit(result, ['validatedCount']))

  await worker.dispose()

  output.log(JSON.stringify(formatted))

  let overallLevel: Level = 'info'

  for (const {level} of formatted) {
    if (level === 'error') overallLevel = 'error'
    if (level === 'warning' && overallLevel !== 'error') overallLevel = 'warning'
  }

  return overallLevel
}
