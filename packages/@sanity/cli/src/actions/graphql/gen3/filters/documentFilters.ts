import {type InputObjectType} from '../../types.js'

export function createDocumentFilters(): InputObjectType {
  return {
    fields: [
      {
        description: 'All documents referencing the given document ID.',
        fieldName: 'references',
        type: 'ID',
      },
      {
        description: 'All documents that are drafts.',
        fieldName: 'is_draft',
        type: 'Boolean',
      },
    ],
    isConstraintFilter: true,
    kind: 'InputObject',
    name: 'Sanity_DocumentFilter',
  }
}
