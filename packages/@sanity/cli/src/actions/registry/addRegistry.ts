import {subdebug} from '@sanity/cli-core'

import {applyFiles} from './applyFiles.js'
import {applyTransforms} from './applyTransforms.js'
import {buildRegistryManifest} from './buildRegistryManifest.js'
import {detectStudioLayout} from './detectStudioLayout.js'
import {loadRegistryManifest} from './loadRegistryManifest.js'
import {buildRegistryResult} from './reportPlan.js'
import {resolveRegistrySource} from './resolveRegistrySource.js'
import {type AddRegistryOptions, type AddRegistryResult, type RegistryManifest} from './types.js'

const debug = subdebug('registry:add')

export async function addRegistry(options: AddRegistryOptions): Promise<AddRegistryResult> {
  const {dryRun, local, output, overwrite, projectRoot, ref, source, subdir} = options

  const resolvedSource = await resolveRegistrySource({local, ref, source, subdir})
  const studioLayout = await detectStudioLayout(projectRoot)

  debug('Resolved source: %s', resolvedSource.sourceLabel)
  debug('Resolved registry directory: %s', resolvedSource.directory)
  debug('Studio layout: %O', studioLayout)

  try {
    const manifest = await loadManifestWithFallback({
      output,
      registryDirectory: resolvedSource.directory,
      sourceLabel: resolvedSource.sourceLabel,
    })

    const fileResult = await applyFiles({
      dryRun,
      manifest,
      overwrite,
      projectRoot,
      registryDirectory: resolvedSource.directory,
      studioLayout,
    })

    const transformResult = await applyTransforms({
      dryRun,
      manifest,
      projectRoot,
      studioLayout,
    })

    if (dryRun) {
      output.log(`Dry run for registry source "${resolvedSource.sourceLabel}"`)
    }

    return buildRegistryResult({
      addedFiles: fileResult.addedFiles,
      dryRun,
      manifest,
      manualSteps: [...fileResult.manualSteps, ...transformResult.manualSteps],
      projectRoot,
      skippedFiles: [...fileResult.skippedFiles, ...transformResult.skippedFiles],
      updatedFiles: [...fileResult.updatedFiles, ...transformResult.updatedFiles],
    })
  } finally {
    await resolvedSource.cleanup()
  }
}

async function loadManifestWithFallback(options: {
  output: AddRegistryOptions['output']
  registryDirectory: string
  sourceLabel: string
}): Promise<RegistryManifest> {
  const {output, registryDirectory, sourceLabel} = options

  try {
    return await loadRegistryManifest(registryDirectory)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes('Could not find sanity-registry.json')
    ) {
      throw error
    }
  }

  const built = await buildRegistryManifest({dryRun: true, registryDirectory})
  output.log(
    `No sanity-registry.json found for "${sourceLabel}". Built manifest from source config automatically.`,
  )
  return built.manifest
}
