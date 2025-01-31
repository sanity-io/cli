import {z} from 'zod'

import {type DatasetBlueprint, datasetSchema} from './dataset.js'

/**
 * The type of the root blueprint object
 *
 * @public
 */
export const TYPE_BLUEPRINT = 'sanity.blueprint' as const

/**
 * Schema of union type for all possible blueprint types
 *
 * @internal
 */
const blueprintSchema = z.discriminatedUnion('_type', [datasetSchema])

/**
 * Union of all possible blueprint types
 *
 * @public
 */
export type Blueprint = z.infer<typeof blueprintSchema>

/**
 * Schema of the root blueprint object
 *
 * @internal
 */
const blueprintDefinitionSchema = z.object({
  resources: z.array(blueprintSchema),
})

/**
 * Input type for defining a blueprint
 *
 * @public
 */
export type BlueprintInput = z.infer<typeof blueprintDefinitionSchema>

/**
 * Root blueprint object
 *
 * @public
 */
export interface RootBlueprint {
  _type: typeof TYPE_BLUEPRINT
  resources: Array<DatasetBlueprint>
}

/**
 * Define a Sanity blueprint
 *
 * @param blueprint - The blueprint definition
 * @returns The blueprint object, with defaults applied
 * @public
 */
export function defineBlueprint(blueprint: BlueprintInput): RootBlueprint {
  const {data, error} = blueprintDefinitionSchema.safeParse(blueprint)
  if (error) {
    throw new Error(`Invalid blueprint definition: ${error.message}`)
  }

  return {...data, _type: TYPE_BLUEPRINT}
}
