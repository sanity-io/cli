import {type Output, subdebug} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {type DatasetAclMode, DatasetResponse} from '@sanity/client'

import {createDataset as createDatasetService} from '../../services/datasets.js'
import {determineDatasetAclMode} from './determineDatasetAclMode.js'

const debug = subdebug('dataset:create')

/**
 * Options for creating a dataset
 */
interface CreateDatasetOptions {
  /**
   * Name of the dataset to create
   */
  datasetName: string

  /**
   * Output instance for logging
   */
  output: Output

  /**
   * Array of project features to determine capabilities
   * Used to check if private datasets are available
   */
  projectFeatures: string[]

  /**
   * Project ID where the dataset will be created
   */
  projectId: string

  /**
   * Whether to enable embeddings for the new dataset
   */
  embeddings?: boolean

  /**
   * GROQ projection for embeddings indexing (e.g. "\{ title, body \}")
   * Only used when embeddings is true
   */
  embeddingsProjection?: string

  /**
   * Whether to force disable private dataset creation
   * Used when default config is selected (which forces public datasets)
   */
  forcePublic?: boolean

  /**
   * Whether to run in unattended mode (no prompts)
   */
  isUnattended?: boolean

  /**
   * Requested visibility mode from flags/options
   */
  visibility?: string
}

/**
 * Creates a new dataset with the appropriate ACL mode.
 *
 * This action handles the business logic for:
 * - Determining the appropriate ACL mode based on project capabilities
 * - Creating the dataset via the service layer
 * - Handling errors and providing user feedback
 *
 * @param options - Configuration options
 * @returns Promise resolving when dataset is created
 * @throws Error if dataset creation fails
 */
export async function createDataset(options: CreateDatasetOptions): Promise<DatasetResponse> {
  const {
    datasetName,
    embeddings,
    embeddingsProjection,
    forcePublic = false,
    isUnattended = false,
    output,
    projectFeatures,
    projectId,
    visibility,
  } = options

  const canCreatePrivate = projectFeatures.includes('privateDataset') && !forcePublic

  // Determine the appropriate ACL mode
  const aclMode: DatasetAclMode = await determineDatasetAclMode({
    canCreatePrivate,
    isUnattended,
    output,
    visibility,
  })

  try {
    const spin = spinner('Creating dataset').start()
    const newDataset = await createDatasetService({
      aclMode,
      datasetName,
      embeddings: embeddings
        ? {enabled: true, ...(embeddingsProjection ? {projection: embeddingsProjection} : {})}
        : undefined,
      projectId,
    })
    spin.succeed()
    output.log(`Dataset created successfully`)
    return newDataset
  } catch (error) {
    debug('Error creating dataset', {datasetName, error})
    throw error
  }
}
