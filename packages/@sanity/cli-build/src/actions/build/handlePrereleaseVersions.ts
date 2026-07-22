import {isInteractive} from '@sanity/cli-core/util'

import {type UnresolvedPrerelease} from '../../util/compareDependencyVersions.js'
import {type BuildStudioEventListener} from './buildStudio.js'

/**
 * Handle prerelease versions that cannot be resolved by the auto-updates CDN.
 *
 * In unattended or non-interactive mode, exits with an error. In interactive mode,
 * prompts the user to either disable auto-updates for this build or cancel.
 *
 * Does not return if the build should be cancelled (exits via `output.error`).
 */
export async function handlePrereleaseVersions({
  onPreReleaseInInteractiveAutoUpdate,
  onPreReleaseInNonInteractiveAutoUpdate,
  unattendedMode,
  unresolvedPrerelease,
}: {
  onPreReleaseInInteractiveAutoUpdate: BuildStudioEventListener['onPreReleaseInInteractiveAutoUpdate']
  onPreReleaseInNonInteractiveAutoUpdate: BuildStudioEventListener['onPreReleaseInNonInteractiveAutoUpdate']
  unattendedMode: boolean
  unresolvedPrerelease: UnresolvedPrerelease[]
}): Promise<void> {
  const prereleaseMessage =
    `The following packages are using prerelease versions not yet available on the auto-updates CDN:\n\n` +
    `${unresolvedPrerelease.map((mod) => ` - ${mod.pkg} (${mod.version})`).join('\n')}\n\n` +
    `Auto-updates cannot be used with prerelease versions. To re-enable auto-updates later, ` +
    `switch to a non-prerelease version locally and deploy again.`

  if (unattendedMode || !isInteractive()) {
    onPreReleaseInNonInteractiveAutoUpdate({
      message:
        `${prereleaseMessage}\n\n` +
        `Cannot build with auto-updates in unattended mode when using prerelease versions. ` +
        `Either switch to a non-prerelease version, or use --no-auto-updates to build without auto-updates.`,
    })
    return
  }

  await onPreReleaseInInteractiveAutoUpdate({prereleaseMessage})
}
