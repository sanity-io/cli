import {request} from './api.js'
import {confirm, input, output, select, Separator, spinner} from './ui.js'

const DATASET_API_VERSION = 'v2025-09-16'
const PROJECT_FEATURES_API_VERSION = 'v2025-09-16'
const MAX_DATASET_NAME_LENGTH = 64

type AclMode = 'private' | 'public'

export function validateDatasetName(name: string): false | string {
  if (!name) return 'Dataset name is missing'
  if (name.toLowerCase() !== name) return 'Dataset name must be all lowercase characters'
  if (name.length < 2) return 'Dataset name must be at least two characters long'
  if (name.length > MAX_DATASET_NAME_LENGTH) {
    return `Dataset name must be at most ${MAX_DATASET_NAME_LENGTH} characters`
  }
  if (!/^[a-z0-9]/.test(name)) return 'Dataset name must start with a letter or a number'
  if (!/^[a-z0-9][-_a-z0-9]+$/.test(name)) {
    return 'Dataset name must only contain letters, numbers, dashes and underscores'
  }
  if (/[-_]$/.test(name)) return 'Dataset name must not end with a dash or an underscore'
  return false
}

function listDatasets(projectId: string): Promise<{name: string}[]> {
  return request({apiVersion: DATASET_API_VERSION, projectId, url: '/datasets'})
}

function getProjectFeatures(projectId: string): Promise<string[]> {
  return request({apiVersion: PROJECT_FEATURES_API_VERSION, projectId, url: '/features'})
}

export async function createDatasetRequest(options: {
  aclMode?: AclMode
  datasetName: string
  projectId: string
}): Promise<void> {
  await request({
    apiVersion: DATASET_API_VERSION,
    body: options.aclMode ? {aclMode: options.aclMode} : {},
    method: 'PUT',
    projectId: options.projectId,
    url: `/datasets/${encodeURIComponent(options.datasetName)}`,
  })
}

async function determineAclMode(options: {
  canCreatePrivate: boolean
  isUnattended: boolean
  visibility?: AclMode
}): Promise<AclMode> {
  const {canCreatePrivate, isUnattended, visibility} = options
  if (visibility === 'public') return 'public'
  if (visibility === 'private') {
    if (canCreatePrivate) return 'private'
    output.warn('Private datasets are not available for this project. Creating as public.')
    return 'public'
  }
  if (isUnattended || !canCreatePrivate) return 'public'

  const mode = await select<AclMode>({
    choices: [
      {name: 'Public (world readable)', value: 'public'},
      {name: 'Private (Authenticated user or token needed)', value: 'private'},
    ],
    message: 'Dataset visibility',
  })
  if (mode === 'private') {
    output.warn(
      'Please note that while documents are private, assets (files and images) are still public',
    )
  }
  return mode
}

async function createDataset(options: {
  datasetName: string
  forcePublic?: boolean
  isUnattended?: boolean

  projectFeatures: string[]
  projectId: string
  visibility?: AclMode
}): Promise<void> {
  const aclMode = await determineAclMode({
    canCreatePrivate: options.projectFeatures.includes('privateDataset') && !options.forcePublic,
    isUnattended: options.isUnattended ?? false,
    visibility: options.visibility,
  })
  const spin = spinner('Creating dataset').start()
  try {
    await createDatasetRequest({
      aclMode,
      datasetName: options.datasetName,
      projectId: options.projectId,
    })
  } catch (error) {
    spin.fail()
    throw error
  }
  spin.succeed()
  output.log('Dataset created successfully')
}

function promptForDatasetName(message: string, existing: string[] = []): Promise<string> {
  return input({
    message,
    validate: (name) => {
      if (existing.includes(name)) return 'Dataset name already exists'
      return validateDatasetName(name) || true
    },
  })
}

function promptForDefaultConfig(): Promise<boolean> {
  output.log(
    'Your content will be stored in a dataset that can be public or private, depending on\n' +
      'whether you want to query your content with or without authentication.\n' +
      'The default dataset configuration has a public dataset named "production".',
  )
  return confirm({default: true, message: 'Use the default dataset configuration?'})
}

/** Select an existing dataset or create a new one, like `sanity init` */
export async function getOrCreateDataset(options: {
  dataset?: string
  defaultConfig: boolean | undefined
  projectId: string
  showDefaultConfigPrompt: boolean
  unattended: boolean
  visibility?: AclMode
}): Promise<string> {
  const {dataset, projectId, unattended, visibility} = options
  let {defaultConfig} = options
  if (dataset && unattended) return dataset

  const [datasets, projectFeatures] = await Promise.all([
    listDatasets(projectId),
    getProjectFeatures(projectId),
  ])
  const create = (datasetName: string, extra: {forcePublic?: boolean; isUnattended?: boolean}) =>
    createDataset({datasetName, projectFeatures, projectId, visibility, ...extra})

  if (dataset) {
    if (!datasets.some((candidate) => candidate.name === dataset)) {
      await create(dataset, {forcePublic: defaultConfig})
    }
    return dataset
  }

  if (unattended) {
    const datasetName = 'production'
    if (!datasets.some((candidate) => candidate.name === datasetName)) {
      await create(datasetName, {forcePublic: visibility === undefined, isUnattended: true})
    }
    return datasetName
  }

  if (datasets.length === 0) {
    if (options.showDefaultConfigPrompt) defaultConfig = await promptForDefaultConfig()
    const name = defaultConfig
      ? 'production'
      : await promptForDatasetName('Name of your first dataset:')
    await create(name, {forcePublic: defaultConfig})
    return name
  }

  const selected = await select({
    choices: [
      {name: 'Create new dataset', value: 'new'},
      new Separator(),
      ...datasets.map((candidate) => ({value: candidate.name})),
    ],
    message: 'Select dataset to use',
  })
  if (selected !== 'new') return selected

  const existing = datasets.map((candidate) => candidate.name)
  if (options.showDefaultConfigPrompt && !existing.includes('production')) {
    defaultConfig = await promptForDefaultConfig()
  }
  const name = defaultConfig ? 'production' : await promptForDatasetName('Dataset name:', existing)
  await create(name, {forcePublic: defaultConfig})
  return name
}
