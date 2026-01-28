import {isUnion} from '../helpers.js'
import {
  type ApiCustomizationOptions,
  type ApiSpecification,
  type ConvertedType,
  type GeneratedApiSpecification,
  type InputObjectType,
} from '../types.js'
import {generateTypeFilters} from './generateTypeFilters.js'
import {generateTypeQueries} from './generateTypeQueries.js'
import {generateTypeSortings} from './generateTypeSortings.js'

const gen3 = (
  extracted: ApiSpecification,
  options?: ApiCustomizationOptions,
): GeneratedApiSpecification => {
  const documentInterface = extracted.interfaces.find((iface) => iface.name === 'Document')
  if (!documentInterface || isUnion(documentInterface)) {
    throw new Error('Failed to find document interface')
  }

  const types = [...extracted.types, documentInterface as ConvertedType]

  const filters = generateTypeFilters(types, options)
  const sortings = generateTypeSortings(types)
  const queries = generateTypeQueries(
    types,
    sortings.filter((node): node is InputObjectType => node.kind === 'InputObject'),
    options,
  )
  const graphqlTypes = [...extracted.types, ...filters, ...sortings]

  return {generation: 'gen3', interfaces: extracted.interfaces, queries, types: graphqlTypes}
}

export default gen3
