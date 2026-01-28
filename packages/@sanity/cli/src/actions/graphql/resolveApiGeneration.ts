import {CLIError} from '@oclif/core/errors'
import {isInteractive, type Output} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {oneline} from 'oneline'

import {graphqlDebug} from './graphqlDebug.js'

const LATEST_GENERATION = 'gen3'

export async function resolveApiGeneration({
  currentGeneration,
  force,
  index,
  output,
  specifiedGeneration,
}: {
  currentGeneration?: string
  force?: boolean
  index: number
  output: Output
  specifiedGeneration?: string
}): Promise<string | undefined> {
  // a) If no API is currently deployed:
  //    use the specificed one from config, or use whichever generation is the latest
  // b) If an API generation is specified explicitly:
  //    use the given one, but _prompt_ if it differs from the current one
  // c) If no API generation is specified explicitly:
  //    use whichever is already deployed, but warn if differs from latest
  if (!currentGeneration) {
    const generation = specifiedGeneration || LATEST_GENERATION
    graphqlDebug(
      'There is no current generation deployed, using %s (%s)',
      generation,
      specifiedGeneration ? 'specified' : 'default',
    )
    return generation
  }

  if (specifiedGeneration && specifiedGeneration !== currentGeneration) {
    if (!force && !isInteractive()) {
      throw new CLIError(
        oneline`
        Specified generation (${specifiedGeneration}) for API at index ${index} differs from the one currently deployed (${currentGeneration}).
        Re-run the command with \`--force\` to force deployment.
      `,
        {exit: 1},
      )
    }

    output.warn(
      `Specified generation (${specifiedGeneration}) for API at index ${index} differs from the one currently deployed (${currentGeneration}).`,
    )

    const confirmDeploy =
      force ||
      (await confirm({
        default: false,
        message: 'Are you sure you want to deploy?',
      }))

    return confirmDeploy ? specifiedGeneration : undefined
  }

  if (specifiedGeneration) {
    graphqlDebug('Using specified (%s) generation', specifiedGeneration)
    return specifiedGeneration
  }

  graphqlDebug('Using the currently deployed version (%s)', currentGeneration)
  return currentGeneration
}
