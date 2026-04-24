import {subdebug} from '@sanity/cli-core'
import {select, Separator} from '@sanity/cli-core/ux'

import {promptForDatasetName} from '../../../prompts/promptForDatasetName.js'
import {promptForDefaultConfig} from '../../../prompts/promptForDefaultConfig.js'
import {listDatasets} from '../../../services/datasets.js'
import {getProjectFeatures} from '../../../services/getProjectFeatures.js'
import {createDataset} from '../../dataset/create.js'
import {type InitContext} from '../types.js'

const debug = subdebug('init')

export async function getOrCreateDataset(opts: {
  dataset?: string
  defaultConfig: boolean | undefined
  displayName: string
  output: InitContext['output']
  projectId: string
  showDefaultConfigPrompt: boolean
  unattended: boolean
  visibility?: string
}): Promise<{
  datasetName: string
  userAction: 'create' | 'none' | 'select'
}> {
  const {dataset, visibility} = opts
  let {defaultConfig} = opts

  if (dataset && opts.unattended) {
    return {datasetName: dataset, userAction: 'none'}
  }

  const [datasets, projectFeatures] = await Promise.all([
    listDatasets(opts.projectId),
    getProjectFeatures(opts.projectId),
  ])

  if (dataset) {
    debug('User has specified dataset through a flag (%s)', dataset)
    const existing = datasets.find((ds) => ds.name === dataset)
    if (!existing) {
      debug('Specified dataset not found, creating it')
      await createDataset({
        datasetName: dataset,
        forcePublic: defaultConfig,
        output: opts.output,
        projectFeatures,
        projectId: opts.projectId,
        visibility,
      })
    }

    return {datasetName: dataset, userAction: 'none'}
  }

  if (opts.unattended) {
    debug('Unattended mode without --dataset, defaulting to "production" dataset')
    const datasetName = 'production'
    const existing = datasets.find((ds) => ds.name === datasetName)
    if (!existing) {
      await createDataset({
        datasetName,
        forcePublic: visibility === undefined,
        isUnattended: true,
        output: opts.output,
        projectFeatures,
        projectId: opts.projectId,
        visibility,
      })
    }
    return {datasetName, userAction: existing ? 'none' : 'create'}
  }

  if (datasets.length === 0) {
    debug('No datasets found for project, prompting for name')
    if (opts.showDefaultConfigPrompt) {
      defaultConfig = await promptForDefaultConfig()
    }
    const name = defaultConfig
      ? 'production'
      : await promptForDatasetName({
          message: 'Name of your first dataset:',
        })
    await createDataset({
      datasetName: name,
      forcePublic: defaultConfig,
      output: opts.output,
      projectFeatures,
      projectId: opts.projectId,
      visibility,
    })
    return {datasetName: name, userAction: 'create'}
  }

  debug(`User has ${datasets.length} dataset(s) already, showing list of choices`)
  const datasetChoices = datasets.map((dataset) => ({value: dataset.name}))

  const selected = await select({
    choices: [{name: 'Create new dataset', value: 'new'}, new Separator(), ...datasetChoices],
    message: 'Select dataset to use',
  })

  if (selected === 'new') {
    const existingDatasetNames = datasets.map((ds) => ds.name)
    debug('User wants to create a new dataset, prompting for name')
    if (opts.showDefaultConfigPrompt && !existingDatasetNames.includes('production')) {
      defaultConfig = await promptForDefaultConfig()
    }

    const newDatasetName = defaultConfig
      ? 'production'
      : await promptForDatasetName(
          {
            message: 'Dataset name:',
          },
          existingDatasetNames,
        )
    await createDataset({
      datasetName: newDatasetName,
      forcePublic: defaultConfig,
      output: opts.output,
      projectFeatures,
      projectId: opts.projectId,
      visibility,
    })
    return {datasetName: newDatasetName, userAction: 'create'}
  }

  debug(`Returning selected dataset (${selected})`)
  return {datasetName: selected, userAction: 'select'}
}
