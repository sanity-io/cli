import {type BuiltInValidationReporter} from '../../../../commands/documents/validate.js'

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
    .map(({validatedCount: _, ...result}) => result)

  await worker.dispose()

  output.log(JSON.stringify(formatted))

  let overallLevel: 'error' | 'info' | 'warning' = 'info'

  for (const {level} of formatted) {
    if (level === 'error') overallLevel = 'error'
    if (level === 'warning' && overallLevel !== 'error') overallLevel = 'warning'
  }

  return overallLevel
}
