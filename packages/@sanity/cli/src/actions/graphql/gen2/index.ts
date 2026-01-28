import {
  type ApiSpecification,
  type GeneratedApiSpecification,
  type InputObjectType,
} from '../types.js'
import {generateTypeFilters} from './generateTypeFilters.js'
import {generateTypeQueries} from './generateTypeQueries.js'
import {generateTypeSortings} from './generateTypeSortings.js'

const gen2 = (extracted: ApiSpecification): GeneratedApiSpecification => {
  const filters = generateTypeFilters(extracted.types)
  const sortings = generateTypeSortings(extracted.types)
  const queries = generateTypeQueries(
    extracted.types,
    sortings.filter((node): node is InputObjectType => node.kind === 'InputObject'),
  )
  const types = [...extracted.types, ...filters, ...sortings]

  return {generation: 'gen2', interfaces: extracted.interfaces, queries, types}
}

export default gen2
