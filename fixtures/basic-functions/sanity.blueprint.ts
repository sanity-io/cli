import {defineBlueprint, defineDocumentFunction} from '@sanity/blueprints'

export default defineBlueprint({
  resources: [defineDocumentFunction({event: {on: ['create', 'update']}, name: 'test-function'})],
})
