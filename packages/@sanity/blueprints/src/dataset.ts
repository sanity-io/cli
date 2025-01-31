import {z} from 'zod'

/**
 * The type of a dataset blueprint.
 *
 * @public
 */
export const TYPE_DATASET = 'sanity.dataset' as const

/**
 * The schema for a dataset blueprint.
 *
 * @internal
 */
export const datasetSchema = z.object({
  _type: z.literal(TYPE_DATASET),
  name: z.string(),
})

/**
 * The schema for a dataset blueprint.
 *
 * @internal
 */
const datasetInputSchema = datasetSchema.partial({
  _type: true,
})

/**
 * Input type for defining a dataset.
 *
 * @public
 */
export type DatasetInput = z.infer<typeof datasetInputSchema>

/**
 * The type of a dataset blueprint.
 *
 * @public
 */
export type DatasetBlueprint = z.infer<typeof datasetSchema>

/**
 * Define a dataset blueprint.
 *
 * @param dataset - The dataset definition.
 * @returns The dataset blueprint, with defaults applied.
 */
export function defineDataset(dataset: DatasetInput): DatasetBlueprint {
  const {data, error} = datasetInputSchema.safeParse(dataset)
  if (error) {
    throw new Error(`Invalid dataset definition: ${error.message}`)
  }

  return {...data, _type: TYPE_DATASET}
}
