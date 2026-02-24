import {styleText} from 'node:util'

import {isInteractive, type Output} from '@sanity/cli-core'
import {select} from '@sanity/cli-core/ux'

import {type UnresolvedPrerelease} from '../../util/compareDependencyVersions.js'

/**
 * Handle prerelease versions that cannot be resolved by the auto-updates CDN.
 *
 * In unattended or non-interactive mode, exits with an error. In interactive mode,
 * prompts the user to either disable auto-updates for this build or cancel.
 *
 * Does not return if the build should be cancelled (exits via `output.error`).
 */
export async function handlePrereleaseVersions({
  output,
  unattendedMode,
  unresolvedPrerelease,
}: {
  output: Output
  unattendedMode: boolean
  unresolvedPrerelease: UnresolvedPrerelease[]
}): Promise<void> {
  const prereleaseMessage =
    `The following packages are using prerelease versions not yet available on the auto-updates CDN:\n\n` +
    `${unresolvedPrerelease.map((mod) => ` - ${mod.pkg} (${mod.version})`).join('\n')}\n\n` +
    `Auto-updates cannot be used with prerelease versions. To re-enable auto-updates later, ` +
    `switch to a non-prerelease version locally and deploy again.`

  if (unattendedMode || !isInteractive()) {
    output.error(
      `${prereleaseMessage}\n\n` +
        `Cannot build with auto-updates in unattended mode when using prerelease versions. ` +
        `Either switch to a non-prerelease version, or use --no-auto-updates to build without auto-updates.`,
      {exit: 1},
    )
    // output.error with exit: 1 throws, but TypeScript doesn't know that
    throw new Error('unreachable')
  }

  const choice = await select({
    choices: [
      {
        name: 'Disable auto-updates for this build and continue',
        value: 'disable-auto-updates',
      },
      {name: 'Cancel build', value: 'cancel'},
    ],
    default: 'disable-auto-updates',
    message: styleText('yellow', prereleaseMessage),
  })

  if (choice === 'cancel') {
    output.error('Declined to continue with build', {exit: 1})
    // output.error with exit: 1 throws, but TypeScript doesn't know that
    throw new Error('unreachable')
  }

  output.warn('Auto-updates disabled for this build')
}
