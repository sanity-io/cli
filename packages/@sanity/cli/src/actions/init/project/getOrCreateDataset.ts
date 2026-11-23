import {type BlueprintDatasetResource, defineDataset} from '@sanity/blueprints'
import {subdebug} from '@sanity/cli-core'
import {search, Separator} from '@sanity/cli-core/ux'

import {promptForDatasetName} from '../../../prompts/promptForDatasetName.js'
import {promptForDefaultConfig} from '../../../prompts/promptForDefaultConfig.js'
import {listDatasets} from '../../../services/datasets.js'
import {getProjectFeatures} from '../../../services/getProjectFeatures.js'
import {searchChoices, searchTheme} from '../../../util/searchChoices.js'
import {createDataset} from '../../dataset/create.js'
import {determineDatasetAclMode} from '../../dataset/determineDatasetAclMode.js'
import {validateDatasetName} from '../../dataset/validateDatasetName.js'
import {InitError} from '../initError.js'
import {type InitContext} from '../types.js'

const debug = subdebug('init')

export async function getOrCreateDataset(opts: {
  dataset?: string
  declareDataset?: boolean
  defaultConfig: boolean | undefined
  displayName: string
  output: InitContext['output']
  projectId: string
  showDefaultConfigPrompt: boolean
  unattended: boolean
  visibility?: string
}): Promise<{
  datasetName: string
  datasetResource?: BlueprintDatasetResource
  userAction: 'create' | 'none' | 'select'
}> {
  const {dataset, visibility} = opts
  let {defaultConfig} = opts

  const [datasets, projectFeatures] = await Promise.all([
    listDatasets(opts.projectId),
    getProjectFeatures(opts.projectId),
  ])

  async function provisionDataset(
    datasetName: string,
    forcePublic: boolean | undefined,
    isUnattended?: boolean,
  ) {
    if (!opts.declareDataset) {
      await createDataset({
        datasetName,
        forcePublic,
        ...(isUnattended === undefined ? {} : {isUnattended}),
        output: opts.output,
        projectFeatures,
        projectId: opts.projectId,
        visibility,
      })
      return {datasetName, userAction: 'create' as const}
    }

    const error = validateDatasetName(datasetName)
    if (error) throw new InitError(error, 2)
    const aclMode =
      visibility === 'private'
        ? 'private'
        : await determineDatasetAclMode({
            canCreatePrivate: projectFeatures.includes('privateDataset') && !forcePublic,
            isUnattended,
            output: opts.output,
            visibility,
          })
    return {
      datasetName,
      datasetResource: defineDataset({aclMode, datasetName, name: `dataset-${datasetName}`}),
      userAction: 'create' as const,
    }
  }

  if (dataset) {
    debug('User has specified dataset through a flag (%s)', dataset)
    const existing = datasets.find((ds) => ds.name === dataset)
    if (!existing) {
      debug('Specified dataset not found, creating it')
      return provisionDataset(dataset, defaultConfig, opts.unattended)
    }

    return {datasetName: dataset, userAction: 'none'}
  }

  if (opts.unattended) {
    debug('Unattended mode without --dataset, defaulting to "production" dataset')
    const datasetName = 'production'
    const existing = datasets.find((ds) => ds.name === datasetName)
    if (!existing) {
      return provisionDataset(datasetName, visibility === undefined, true)
    }
    return {datasetName, userAction: 'none'}
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
    return provisionDataset(name, defaultConfig)
  }

  debug(`User has ${datasets.length} dataset(s) already, showing list of choices`)
  const datasetChoices = datasets.map((dataset) => ({name: dataset.name, value: dataset.name}))

  const selected = await search({
    message: 'Select dataset to use',
    source: searchChoices([
      {name: opts.declareDataset ? 'Declare a new dataset' : 'Create new dataset', value: 'new'},
      new Separator(),
      ...datasetChoices,
    ]),
    theme: searchTheme,
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
    return provisionDataset(newDatasetName, defaultConfig)
  }

  debug(`Returning selected dataset (${selected})`)
  return {datasetName: selected, userAction: 'select'}
}
