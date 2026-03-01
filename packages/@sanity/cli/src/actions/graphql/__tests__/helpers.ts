import orderBy from 'lodash-es/orderBy.js'

import {type GeneratedApiSpecification} from '../types.js'

export function sortGraphQLSchema(schema: GeneratedApiSpecification) {
  const interfaces = orderBy(schema.interfaces, (iface) => iface.name).map((iface) => ({
    ...iface,
    fields: orderBy(iface.fields, (field) => field.fieldName),
  }))
  const queries = orderBy(schema.queries, (query) => query.fieldName).map((query) => ({
    ...query,
    args: orderBy(query.args, (arg) => arg.name),
  }))

  const types = orderBy(schema.types, (type) => type.name).map((type) => ({
    ...type,
    fields: orderBy(
      'fields' in type ? (type.fields as {fieldName: string}[]) : [],
      (field) => field.fieldName,
    ),
  }))

  return {generation: schema.generation, interfaces, queries, types}
}
