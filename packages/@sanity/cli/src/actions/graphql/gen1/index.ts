import {type ApiSpecification, type GeneratedApiSpecification} from '../types.js'
import {generateTypeFilters} from './generateTypeFilters.js'
import {generateTypeQueries} from './generateTypeQueries.js'

const gen1 = (extracted: ApiSpecification): GeneratedApiSpecification => {
  const filters = generateTypeFilters(extracted.types)
  const queries = generateTypeQueries(extracted.types, filters)
  const types = [...extracted.types, ...filters]
  return {generation: 'gen1', interfaces: extracted.interfaces, queries, types}
}

export default gen1
