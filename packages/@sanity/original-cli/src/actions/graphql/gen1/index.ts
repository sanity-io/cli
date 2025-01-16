import {type ApiSpecification, type GeneratedApiSpecification} from '../types.js'
import {generateTypeFilters} from './generateTypeFilters.js'
import {generateTypeQueries} from './generateTypeQueries.js'

export default (extracted: ApiSpecification): GeneratedApiSpecification => {
  const filters = generateTypeFilters(extracted.types)
  const queries = generateTypeQueries(extracted.types, filters)
  const types = [...extracted.types, ...filters]
  return {types, queries, interfaces: extracted.interfaces, generation: 'gen1'}
}
